import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

os.environ["PULSE_TEX_DATABASE_URL"] = "sqlite:///tests/test.db"
os.environ["PULSE_TEX_PROJECTS_DIR"] = "tests/projects"


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from pulse_tex.web.app import create_app

    app = create_app()
    with TestClient(app) as c:
        yield c


class TestCompile:
    def test_compile_without_tectonic(self, client):
        create_resp = client.post("/api/projects", json={"name": "CompileTest"})
        project_id = create_resp.json()["id"]

        client.post(
            f"/api/files/{project_id}",
            json={"path": "main.tex", "content": "\\documentclass{article}\\begin{document}Test\\end{document}"},
        )

        response = client.post(f"/api/compile/{project_id}")
        assert response.status_code == 200
        data = response.json()

        if not data["success"]:
            error_msg = data.get("error_message", "").lower()
            assert any(x in error_msg for x in ["not found", "not generated", "pdf", "tectonic", "latex"])

    def test_get_pdf_without_compile(self, client):
        create_resp = client.post("/api/projects", json={"name": "NoPDF"})
        project_id = create_resp.json()["id"]

        response = client.get(f"/api/compile/{project_id}/pdf")
        assert response.status_code == 404

    def test_compile_project_not_found(self, client):
        response = client.post("/api/compile/99999")
        assert response.status_code == 404


class TestEditorPage:
    def test_editor_page_loads(self, client):
        create_resp = client.post("/api/projects", json={"name": "EditorTest"})
        project_id = create_resp.json()["id"]

        response = client.get(f"/editor.html?id={project_id}")
        assert response.status_code == 200
        assert b"Pulse-TeX Editor" in response.content

    def test_static_files(self, client):
        response = client.get("/css/main.css")
        assert response.status_code == 200

        response = client.get("/js/i18n.js")
        assert response.status_code == 200

        response = client.get("/js/utils.js")
        assert response.status_code == 200

        response = client.get("/js/api.js")
        assert response.status_code == 200

        response = client.get("/js/i18n.js")
        assert response.status_code == 200

        response = client.get("/js/utils.js")
        assert response.status_code == 200

        response = client.get("/js/api.js")
        assert response.status_code == 200

        response = client.get("/js/i18n.js")
        assert response.status_code == 200
