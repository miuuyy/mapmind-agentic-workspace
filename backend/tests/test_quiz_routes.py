from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app.api import routes
from app.core.config import Settings
from app.main import app
from app.services.debug_log_service import get_debug_log_service
from app.services.quiz_service import QuizGenerationError
from app.services.repository import GraphRepository


class QuizRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(tempdir.cleanup)
        self.root_dir = Path(tempdir.name)
        self.repository = GraphRepository(self.root_dir / "state.sqlite3")
        self.settings = Settings()
        self.settings.root_dir = self.root_dir

    def test_start_quiz_returns_502_and_logs_diagnostics_when_generation_fails(self) -> None:
        class FailingQuizService:
            @staticmethod
            def start_session(*args, **kwargs):  # noqa: ANN002, ANN003, ANN201
                raise QuizGenerationError(
                    "closure quiz generation failed: provider returned no valid questions",
                    diagnostics={"topic_id": "arithmetics", "model": "gemini-2.5-pro"},
                )

        client = TestClient(app, raise_server_exceptions=False)
        app.dependency_overrides[routes.get_repository] = lambda: self.repository
        app.dependency_overrides[routes.get_quiz_service] = lambda: FailingQuizService()
        app.dependency_overrides[routes.get_settings] = lambda: self.settings
        self.addCleanup(app.dependency_overrides.clear)

        response = client.post(
            "/api/v1/graphs/mathematics-demo/topics/arithmetics/quiz/start",
            json={"question_count": 6, "model": "gemini-2.5-pro"},
        )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.json()["detail"],
            "closure quiz generation failed: provider returned no valid questions",
        )

        logs = get_debug_log_service(self.settings.root_dir).snapshot()
        self.assertEqual(logs.server[0].message, "Closure quiz generation failed")
        self.assertIn("\"topic_id\":\"arithmetics\"", logs.server[0].response_excerpt or "")
        self.assertIn("\"model\":\"gemini-2.5-pro\"", logs.server[0].response_excerpt or "")


if __name__ == "__main__":
    unittest.main()
