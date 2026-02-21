import os
import sys
from io import BytesIO
from pathlib import Path
from unittest.mock import AsyncMock, patch
from zipfile import ZipFile

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

db_path = Path("tests/test_phase5.db")
if db_path.exists():
    db_path.unlink()

os.environ["PULSE_TEX_DATABASE_URL"] = "sqlite:///tests/test_phase5.db"
os.environ["PULSE_TEX_PROJECTS_DIR"] = "tests/projects"


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from pulse_tex.web.app import create_app
    import pulse_tex.core.config as config_module

    config_module._db_instance = None

    app = create_app()

    with TestClient(app) as c:
        yield c

    config_module._db_instance = None

    db_path = Path("tests/test_phase5.db")
    if db_path.exists():
        db_path.unlink()


class TestProjectExport:
    def test_export_project(self, client):
        create_resp = client.post("/api/projects", json={"name": "ExportTest"})
        project_id = create_resp.json()["id"]

        client.post(f"/api/files/{project_id}", json={"path": "test.tex", "content": "\\documentclass{article}"})

        response = client.get(f"/api/projects/{project_id}/export")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/zip"

        zip_buffer = BytesIO(response.content)
        with ZipFile(zip_buffer, "r") as zf:
            assert "test.tex" in zf.namelist()
            assert "\\documentclass{article}" in zf.read("test.tex").decode()

    def test_export_nonexistent_project(self, client):
        response = client.get("/api/projects/99999/export")
        assert response.status_code == 404


class TestTikZGeneration:
    @patch("pulse_tex.services.ai_assistant.AIService.generate_tikz", new_callable=AsyncMock)
    @patch("pulse_tex.services.ai_assistant.AIService.is_configured", True)
    def test_generate_tikz(self, mock_tikz, client):
        mock_tikz.return_value = "```latex\n\\begin{tikzpicture}\n\\draw (0,0) circle (1);\n\\end{tikzpicture}\n```"

        response = client.post(
            "/api/ai/generate-tikz",
            json={"description": "Draw a circle"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "tikzpicture" in data["content"]

    @patch("pulse_tex.services.ai_assistant.AIService.is_configured", False)
    def test_generate_tikz_without_config(self, client):
        response = client.post(
            "/api/ai/generate-tikz",
            json={"description": "Draw a circle"},
        )
        assert response.status_code == 503


class TestPlotGeneration:
    @patch("pulse_tex.services.ai_assistant.AIService.generate_plot", new_callable=AsyncMock)
    @patch("pulse_tex.services.ai_assistant.AIService.is_configured", True)
    def test_generate_plot(self, mock_plot, client):
        mock_plot.return_value = (
            "```python\nimport matplotlib.pyplot as plt\nplt.plot([1,2,3])\nplt.savefig('figure.pdf')\n```"
        )

        response = client.post(
            "/api/ai/generate-plot",
            json={"description": "Plot a simple line graph", "data": "1,2,3"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "matplotlib" in data["content"]

    @patch("pulse_tex.services.ai_assistant.AIService.is_configured", False)
    def test_generate_plot_without_config(self, client):
        response = client.post(
            "/api/ai/generate-plot",
            json={"description": "Plot something"},
        )
        assert response.status_code == 503
