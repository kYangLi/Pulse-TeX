import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

os.environ["PULSE_TEX_DATABASE_URL"] = "sqlite:///tests/test.db"
os.environ["PULSE_TEX_PROJECTS_DIR"] = "tests/projects"


@pytest.fixture
def db():
    from pulse_tex.core import Database

    db = Database(os.environ["PULSE_TEX_DATABASE_URL"])
    db.init_default_config()
    yield db

    db_path = Path("tests/test.db")
    if db_path.exists():
        db_path.unlink()


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from pulse_tex.web.app import create_app

    app = create_app()
    with TestClient(app) as c:
        yield c


class TestHealth:
    def test_health_check(self, client):
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"


class TestProjects:
    def test_list_projects(self, client):
        response = client.get("/api/projects")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_create_project(self, client):
        response = client.post("/api/projects", json={"name": "Test Project"})
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Test Project"
        assert data["id"] is not None

    def test_get_project(self, client):
        create_resp = client.post("/api/projects", json={"name": "Test"})
        project_id = create_resp.json()["id"]

        response = client.get(f"/api/projects/{project_id}")
        assert response.status_code == 200
        assert response.json()["name"] == "Test"

    def test_delete_project(self, client):
        create_resp = client.post("/api/projects", json={"name": "ToDelete"})
        project_id = create_resp.json()["id"]

        response = client.delete(f"/api/projects/{project_id}")
        assert response.status_code == 200

        get_resp = client.get(f"/api/projects/{project_id}")
        assert get_resp.status_code == 404


class TestFiles:
    def test_create_file(self, client):
        create_resp = client.post("/api/projects", json={"name": "Test"})
        project_id = create_resp.json()["id"]

        response = client.post(
            f"/api/files/{project_id}", json={"path": "test.tex", "content": "\\documentclass{article}"}
        )
        assert response.status_code == 200
        assert response.json()["path"] == "test.tex"

    def test_get_file(self, client):
        create_resp = client.post("/api/projects", json={"name": "Test"})
        project_id = create_resp.json()["id"]

        client.post(f"/api/files/{project_id}", json={"path": "test.tex", "content": "content"})

        response = client.get(f"/api/files/{project_id}/test.tex")
        assert response.status_code == 200
        assert response.json()["content"] == "content"

    def test_update_file(self, client):
        create_resp = client.post("/api/projects", json={"name": "Test"})
        project_id = create_resp.json()["id"]

        client.post(f"/api/files/{project_id}", json={"path": "test.tex", "content": "old"})

        response = client.patch(f"/api/files/{project_id}/test.tex", json={"content": "new"})
        assert response.status_code == 200

        get_resp = client.get(f"/api/files/{project_id}/test.tex")
        assert get_resp.json()["content"] == "new"


class TestConfig:
    def test_get_config(self, client):
        response = client.get("/api/config")
        assert response.status_code == 200
        data = response.json()
        assert "ai_model" in data

    def test_update_config(self, client):
        response = client.patch("/api/config", json={"ai_model": "TestModel"})
        assert response.status_code == 200

        get_resp = client.get("/api/config")
        assert get_resp.json()["ai_model"] == "TestModel"


class TestConfigStatus:
    def test_get_status(self, client):
        response = client.get("/api/config/status")
        assert response.status_code == 200
        data = response.json()
        assert "is_initialized" in data
        assert "latex_engines" in data
        assert "bibtex_engines" in data

    def test_latex_engines_detection(self, client):
        response = client.get("/api/config/status")
        data = response.json()
        engines = data["latex_engines"]
        assert "tectonic" in engines
        assert "pdflatex" in engines
        assert "available" in engines["tectonic"]

    def test_bibtex_engines_detection(self, client):
        response = client.get("/api/config/status")
        data = response.json()
        engines = data["bibtex_engines"]
        assert "biber" in engines
        assert "bibtex" in engines
        assert "available" in engines["biber"]


class TestInit:
    def test_init_page_loads(self, client):
        response = client.get("/setup.html")
        assert response.status_code == 200
        assert "Pulse-TeX Setup" in response.text
