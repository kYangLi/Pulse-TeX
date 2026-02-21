import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

db_path = Path("tests/test_ai.db")
if db_path.exists():
    db_path.unlink()

os.environ["PULSE_TEX_DATABASE_URL"] = "sqlite:///tests/test_ai.db"
os.environ["PULSE_TEX_PROJECTS_DIR"] = "tests/projects"


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from pulse_tex.web.app import create_app
    import pulse_tex.core.config as config_module
    from pulse_tex.services.ai_assistant import ai_service

    config_module._db_instance = None
    ai_service._client = None

    app = create_app()

    with TestClient(app) as c:
        c.patch("/api/config", json={"ai_api_key": ""})
        yield c

    config_module._db_instance = None
    ai_service._client = None


class TestAIStatus:
    def test_ai_status_not_configured(self, client):
        response = client.get("/api/ai/status")
        assert response.status_code == 200
        data = response.json()
        assert data["configured"] is False

    def test_ai_status_configured(self, client):
        client.patch("/api/config", json={"ai_api_key": "test-key"})

        response = client.get("/api/ai/status")
        assert response.status_code == 200
        data = response.json()
        assert data["configured"] is True


class TestAIChat:
    def test_chat_without_config(self, client):
        response = client.post("/api/ai/chat", json={"message": "Hello"})
        assert response.status_code == 503

    @patch("pulse_tex.services.ai_assistant.AIService.chat", new_callable=AsyncMock)
    def test_chat_with_config(self, mock_chat, client):
        client.patch("/api/config", json={"ai_api_key": "test-key"})
        mock_chat.return_value = "Hello! How can I help you?"

        response = client.post("/api/ai/chat", json={"message": "Hello"})
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "Hello" in data["content"]


class TestAIPolish:
    def test_polish_without_config(self, client):
        response = client.post("/api/ai/polish", json={"text": "test"})
        assert response.status_code == 503

    @patch("pulse_tex.services.ai_assistant.AIService.polish", new_callable=AsyncMock)
    def test_polish_with_config(self, mock_polish, client):
        client.patch("/api/config", json={"ai_api_key": "test-key"})
        mock_polish.return_value = "Polished text"

        response = client.post("/api/ai/polish", json={"text": "test text"})
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True


class TestAITranslate:
    def test_translate_without_config(self, client):
        response = client.post("/api/ai/translate", json={"text": "test", "direction": "en"})
        assert response.status_code == 503

    @patch("pulse_tex.services.ai_assistant.AIService.translate", new_callable=AsyncMock)
    def test_translate_with_config(self, mock_translate, client):
        client.patch("/api/config", json={"ai_api_key": "test-key"})
        mock_translate.return_value = "Translated text"

        response = client.post("/api/ai/translate", json={"text": "test", "direction": "en"})
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True


class TestAIExplainError:
    def test_explain_error_without_config(self, client):
        response = client.post("/api/ai/explain-error", json={"log_content": "error log"})
        assert response.status_code == 503

    @patch("pulse_tex.services.ai_assistant.AIService.explain_error", new_callable=AsyncMock)
    def test_explain_error_with_config(self, mock_explain, client):
        client.patch("/api/config", json={"ai_api_key": "test-key"})
        mock_explain.return_value = "Missing closing brace on line 10"

        response = client.post(
            "/api/ai/explain-error", json={"log_content": "error log", "source_code": "\\documentclass{article}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
