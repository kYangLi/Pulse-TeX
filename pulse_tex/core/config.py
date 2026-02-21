import os
from pathlib import Path


class classproperty:
    def __init__(self, getter):
        self.getter = getter

    def __get__(self, instance, owner):
        return self.getter(owner)


_db_instance = None


def get_db():
    global _db_instance
    if _db_instance is None:
        from pulse_tex.core.database import Database

        db_url = os.getenv("PULSE_TEX_DATABASE_URL", "sqlite:///data/pulse_tex.db")
        _db_instance = Database(db_url)
    return _db_instance


DEFAULT_CONFIG = {
    "ai_api_key": "",
    "ai_model": "DeepSeek-V3.2",
    "ai_base_url": "https://llmapi.paratera.com",
    "arxiv_pulse_url": "http://localhost:8001",
    "ui_language": "zh",
    "latex_engine": "tectonic",
    "bibtex_engine": "biber",
}


class Config:
    @classmethod
    def _get(cls, key: str, default: str = "") -> str:
        db = get_db()
        value = db.get_config(key)
        return value if value is not None else default

    @classmethod
    def _get_int(cls, key: str, default: int = 0) -> int:
        try:
            return int(cls._get(key, str(default)))
        except ValueError:
            return default

    @classmethod
    def _set(cls, key: str, value: str) -> None:
        db = get_db()
        db.set_config(key, value)

    @classproperty
    def DATABASE_URL(cls) -> str:
        return os.getenv("PULSE_TEX_DATABASE_URL", "sqlite:///data/pulse_tex.db")

    @classproperty
    def PROJECTS_DIR(cls) -> str:
        return os.getenv("PULSE_TEX_PROJECTS_DIR", "./projects")

    @classproperty
    def AI_API_KEY(cls) -> str | None:
        key = cls._get("ai_api_key", "")
        return key if key else None

    @classproperty
    def AI_MODEL(cls) -> str:
        return cls._get("ai_model", "DeepSeek-V3.2")

    @classproperty
    def AI_BASE_URL(cls) -> str:
        return cls._get("ai_base_url", "https://llmapi.paratera.com")

    @classproperty
    def ARXIV_PULSE_URL(cls) -> str:
        return cls._get("arxiv_pulse_url", "http://localhost:8001")

    @classproperty
    def UI_LANGUAGE(cls) -> str:
        return cls._get("ui_language", "zh")

    @classproperty
    def LATEX_ENGINE(cls) -> str:
        return cls._get("latex_engine", "tectonic")

    @classproperty
    def BIBTEX_ENGINE(cls) -> str:
        return cls._get("bibtex_engine", "biber")

    @classproperty
    def TECTONIC_PATH(cls) -> str:
        return cls._get("latex_engine", "tectonic")

    @classmethod
    def is_initialized(cls) -> bool:
        db = get_db()
        return db.is_initialized()

    @classmethod
    def set_initialized(cls, initialized: bool = True) -> None:
        db = get_db()
        db.set_initialized(initialized)

    @classmethod
    def get_all_config(cls) -> dict[str, str]:
        db = get_db()
        return db.get_all_config()

    @classmethod
    def update_config(cls, config_dict: dict[str, str]) -> None:
        for key, value in config_dict.items():
            cls._set(key, value)

    @classmethod
    def validate(cls) -> bool:
        if not cls.AI_API_KEY:
            print("Warning: AI_API_KEY not set. AI features will be limited.")
        else:
            print(f"Info: AI API key found. Model: {cls.AI_MODEL}")

        Path(cls.PROJECTS_DIR).mkdir(parents=True, exist_ok=True)
        return True
