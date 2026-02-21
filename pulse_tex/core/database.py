import json
from datetime import UTC, datetime

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from pulse_tex.models import Base, Project, ProjectFile, SystemConfig


class Database:
    _instance = None
    _engine = None

    def __new__(cls, db_url: str | None = None):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._engine = create_engine(
                db_url or "sqlite:///data/pulse_tex.db",
                pool_size=10,
                max_overflow=20,
                pool_pre_ping=True,
                connect_args={"check_same_thread": False} if "sqlite" in (db_url or "") else {},
            )
            Base.metadata.create_all(cls._engine)

            @event.listens_for(cls._engine, "connect")
            def set_sqlite_pragma(dbapi_connection, connection_record):
                if "sqlite" in str(cls._engine.url):
                    cursor = dbapi_connection.cursor()
                    cursor.execute("PRAGMA journal_mode=WAL")
                    cursor.execute("PRAGMA synchronous=NORMAL")
                    cursor.execute("PRAGMA busy_timeout=30000")
                    cursor.close()

        return cls._instance

    def __init__(self, db_url: str | None = None):
        self.Session = sessionmaker(bind=self._engine)

    def get_session(self):
        return self.Session()

    def get_config(self, key: str, default: str | None = None) -> str | None:
        with self.get_session() as session:
            config = session.query(SystemConfig).filter_by(key=key).first()
            if config:
                return config.value
            return default

    def set_config(self, key: str, value: str, description: str | None = None) -> None:
        with self.get_session() as session:
            config = session.query(SystemConfig).filter_by(key=key).first()
            if config:
                config.value = value
                if description:
                    config.description = description
            else:
                config = SystemConfig(key=key, value=value, description=description)
                session.add(config)
            session.commit()

    def get_all_config(self) -> dict[str, str]:
        with self.get_session() as session:
            configs = session.query(SystemConfig).all()
            return {c.key: c.value for c in configs}

    def init_default_config(self) -> None:
        from pulse_tex.core.config import DEFAULT_CONFIG

        for key, value in DEFAULT_CONFIG.items():
            if self.get_config(key) is None:
                self.set_config(key, value)

    def is_initialized(self) -> bool:
        return self.get_config("is_initialized") == "true"

    def set_initialized(self, initialized: bool = True) -> None:
        self.set_config("is_initialized", "true" if initialized else "false")

    def create_project(self, name: str, description: str = "") -> Project:
        with self.get_session() as session:
            project = Project(name=name, description=description)
            session.add(project)
            session.commit()
            session.refresh(project)
            return project

    def get_project(self, project_id: str) -> Project | None:
        with self.get_session() as session:
            return session.query(Project).filter_by(id=project_id).first()

    def get_projects(self) -> list[Project]:
        with self.get_session() as session:
            return session.query(Project).order_by(Project.updated_at.desc()).all()

    def update_project(self, project_id: str, **kwargs) -> bool:
        with self.get_session() as session:
            project = session.query(Project).filter_by(id=project_id).first()
            if project:
                for key, value in kwargs.items():
                    setattr(project, key, value)
                project.updated_at = datetime.now(UTC).replace(tzinfo=None)
                session.commit()
                return True
            return False

    def delete_project(self, project_id: str) -> bool:
        with self.get_session() as session:
            project = session.query(Project).filter_by(id=project_id).first()
            if project:
                session.query(ProjectFile).filter_by(project_id=project_id).delete()
                session.delete(project)
                session.commit()
                return True
            return False

    def get_file(self, project_id: str, path: str) -> ProjectFile | None:
        with self.get_session() as session:
            return session.query(ProjectFile).filter_by(project_id=project_id, path=path).first()

    def get_files(self, project_id: str) -> list[ProjectFile]:
        with self.get_session() as session:
            return session.query(ProjectFile).filter_by(project_id=project_id).all()

    def create_file(self, project_id: str, path: str, content: str = "") -> ProjectFile:
        with self.get_session() as session:
            file = ProjectFile(project_id=project_id, path=path, content=content)
            session.add(file)
            session.commit()
            session.refresh(file)
            return file

    def update_file(self, project_id: str, path: str, content: str) -> bool:
        with self.get_session() as session:
            file = session.query(ProjectFile).filter_by(project_id=project_id, path=path).first()
            if file:
                file.content = content
                file.updated_at = datetime.now(UTC).replace(tzinfo=None)
                session.commit()
                return True
            return False

    def delete_file(self, project_id: str, path: str) -> bool:
        with self.get_session() as session:
            file = session.query(ProjectFile).filter_by(project_id=project_id, path=path).first()
            if file:
                session.delete(file)
                session.commit()
                return True
            return False
