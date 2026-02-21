"""
FastAPI Application Entry Point
"""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlalchemy import create_engine

from pulse_tex.core import Database
from pulse_tex.models import Base
from pulse_tex.web.api import ai, compile, config, diagram, files, literature, projects


@asynccontextmanager
async def lifespan(app: FastAPI):
    db_url = os.getenv("PULSE_TEX_DATABASE_URL", "sqlite:///data/pulse_tex.db")
    engine = create_engine(db_url)
    Base.metadata.create_all(engine)
    db = Database(db_url)
    db.init_default_config()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Pulse-TeX",
        description="AI-powered LaTeX paper writing tool",
        version="0.1.0",
        lifespan=lifespan,
    )

    @app.get("/api/health")
    async def health_check():
        return {"status": "ok", "version": "0.1.0"}

    api_router = FastAPI(prefix="/api")
    api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
    api_router.include_router(files.router, prefix="/files", tags=["files"])
    api_router.include_router(compile.router, prefix="/compile", tags=["compile"])
    api_router.include_router(config.router, prefix="/config", tags=["config"])
    api_router.include_router(ai.router, tags=["ai"])
    api_router.include_router(literature.router, tags=["literature"])
    api_router.include_router(diagram.router, tags=["diagram"])

    app.mount("/api", api_router)

    static_path = Path(__file__).parent / "static"
    if static_path.exists() and any(static_path.iterdir()):
        app.mount("/", StaticFiles(directory=str(static_path), html=True), name="static")

    return app


app = create_app()
