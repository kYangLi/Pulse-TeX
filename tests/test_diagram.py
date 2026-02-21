import os
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

os.environ["PULSE_TEX_DATABASE_URL"] = "sqlite:///tests/test_diagram.db"
os.environ["PULSE_TEX_PROJECTS_DIR"] = "tests/projects"


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from pulse_tex.web.app import create_app

    with patch("pulse_tex.services.diagram_service.DiagramService.is_configured", True):
        app = create_app()
        with TestClient(app) as c:
            yield c

    db_path = Path("tests/test_diagram.db")
    if db_path.exists():
        db_path.unlink()


@pytest.fixture
def client_no_ai():
    from fastapi.testclient import TestClient
    from pulse_tex.web.app import create_app

    with patch("pulse_tex.services.diagram_service.DiagramService.is_configured", False):
        app = create_app()
        with TestClient(app) as c:
            yield c

    db_path = Path("tests/test_diagram.db")
    if db_path.exists():
        db_path.unlink()


class TestDiagramStyles:
    def test_get_styles(self, client):
        response = client.get("/api/diagram/styles")
        assert response.status_code == 200
        data = response.json()
        assert "styles" in data
        assert "diagram_types" in data
        assert "nature" in data["styles"]
        assert "flowchart" in data["diagram_types"]


class TestRefineSketch:
    @patch("pulse_tex.services.diagram_service.diagram_service.refine_sketch")
    def test_refine_sketch_success(self, mock_refine, client):
        mock_refine.return_value = {
            "refined_svg": "<svg><rect/></svg>",
            "style": "nature",
            "style_name": "Nature",
        }

        response = client.post(
            "/api/diagram/refine",
            json={
                "sketch_svg": "<svg><circle/></svg>",
                "description": "A simple flowchart",
                "style": "nature",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["style"] == "nature"

    def test_refine_sketch_without_ai(self, client_no_ai):
        response = client_no_ai.post(
            "/api/diagram/refine",
            json={
                "sketch_svg": "<svg><circle/></svg>",
                "description": "A simple flowchart",
            },
        )
        assert response.status_code == 503


class TestGenerateFromText:
    @patch("pulse_tex.services.diagram_service.diagram_service.generate_from_text")
    def test_generate_from_text_success(self, mock_generate, client):
        mock_generate.return_value = {
            "svg": "<svg><rect/><text>Step 1</text></svg>",
            "style": "nature",
            "style_name": "Nature",
            "diagram_type": "flowchart",
        }

        response = client.post(
            "/api/diagram/generate",
            json={
                "description": "DFT calculation workflow: structure optimization -> SCF -> band structure",
                "style": "nature",
                "diagram_type": "flowchart",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["diagram_type"] == "flowchart"

    def test_generate_without_ai(self, client_no_ai):
        response = client_no_ai.post(
            "/api/diagram/generate",
            json={
                "description": "A process diagram",
            },
        )
        assert response.status_code == 503


class TestIterateDesign:
    @patch("pulse_tex.services.diagram_service.diagram_service.iterate_design")
    def test_iterate_design_success(self, mock_iterate, client):
        mock_iterate.return_value = {
            "svg": '<svg><rect fill="blue"/></svg>',
            "style": "nature",
            "feedback_addressed": "Make the box blue",
        }

        response = client.post(
            "/api/diagram/iterate",
            json={
                "current_svg": "<svg><rect/></svg>",
                "feedback": "Make the box blue",
                "style": "nature",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True


class TestSvgToTikz:
    @patch("pulse_tex.services.diagram_service.diagram_service.svg_to_tikz")
    def test_svg_to_tikz_success(self, mock_convert, client):
        mock_convert.return_value = "\\begin{tikzpicture}\n\\draw (0,0) rectangle (1,1);\n\\end{tikzpicture}"

        response = client.post(
            "/api/diagram/svg-to-tikz",
            json={
                "svg": '<svg><rect x="0" y="0" width="100" height="100"/></svg>',
                "description": "A simple rectangle",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "tikz" in data["data"]
        assert "tikzpicture" in data["data"]["tikz"]


class TestDiagramPage:
    def test_diagram_page_loads(self, client):
        response = client.get("/diagram.html")
        assert response.status_code == 200
        assert "Diagram Workbench" in response.text
        assert "excalidraw" in response.text.lower()
