import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

db_path = Path("tests/test_literature.db")
if db_path.exists():
    db_path.unlink()

os.environ["PULSE_TEX_DATABASE_URL"] = "sqlite:///tests/test_literature.db"
os.environ["PULSE_TEX_PROJECTS_DIR"] = "tests/projects"


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from pulse_tex.web.app import create_app
    import pulse_tex.core.config as config_module
    from pulse_tex.services.arxiv_client import arxiv_client

    config_module._db_instance = None

    app = create_app()

    with TestClient(app) as c:
        yield c

    config_module._db_instance = None

    db_path = Path("tests/test_literature.db")
    if db_path.exists():
        db_path.unlink()


class TestLiteratureStatus:
    def test_literature_status(self, client):
        response = client.get("/api/literature/status")
        assert response.status_code == 200
        data = response.json()
        assert "available" in data
        assert "arxiv_pulse_url" in data


class TestLiteratureSearch:
    @patch("pulse_tex.services.arxiv_client.ArxivPulseClient.search_papers", new_callable=AsyncMock)
    def test_search_literature_success(self, mock_search, client):
        mock_search.return_value = {
            "query": "test",
            "total": 1,
            "papers": [
                {
                    "arxiv_id": "2401.12345",
                    "title": "Test Paper",
                    "authors": ["Author One", "Author Two"],
                }
            ],
        }

        response = client.get("/api/literature/search?q=test")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["total"] == 1

    def test_search_literature_missing_query(self, client):
        response = client.get("/api/literature/search")
        assert response.status_code == 422


class TestCitation:
    def test_generate_citation(self, client):
        response = client.post(
            "/api/literature/citation",
            json={
                "arxiv_id": "2401.12345",
                "title": "Test Paper Title",
                "authors": ["Author One", "Author Two"],
                "year": "2024",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["cite_key"] == "2401_12345"
        assert "\\cite{2401_12345}" in data["citation"]
        assert "@article{2401_12345" in data["bibtex"]
        assert "Test Paper Title" in data["bibtex"]

    def test_generate_citation_minimal(self, client):
        response = client.post(
            "/api/literature/citation",
            json={"arxiv_id": "2301.00001"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["cite_key"] == "2301_00001"
        assert "eprint={2301.00001}" in data["bibtex"]
