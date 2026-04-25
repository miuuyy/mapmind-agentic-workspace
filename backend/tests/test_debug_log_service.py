from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app.api import routes
from app.main import app
from app.models.domain import UpdateWorkspaceConfigRequest
from app.services.debug_log_service import DebugClientLogRequest, DebugLogService
from app.services.repository import GraphRepository


class DebugLogServiceTests(unittest.TestCase):
    def test_client_entries_redact_secrets_but_preserve_user_content(self) -> None:
        """Local-first product: user sees their own prompts and responses in debug
        logs, but API keys / Bearer tokens are always stripped from payloads."""
        tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(tempdir.cleanup)
        service = DebugLogService(Path(tempdir.name) / "logs.log")

        entry = service.ingest_client_entry(
            DebugClientLogRequest(
                kind="api",
                title="POST /api/v1/workspace/config",
                message="Request completed",
                request_excerpt='{"gemini_api_key":"secret-value","messages":[{"content":"private note"}]}',
                response_excerpt='{"openai_api_key":"other-secret"}',
            )
        )

        self.assertNotIn("secret-value", entry.request_excerpt or "")
        self.assertNotIn("other-secret", entry.response_excerpt or "")
        self.assertIn("private note", entry.request_excerpt or "")
        self.assertIn("[redacted]", entry.request_excerpt or "")

    def test_server_entries_can_preserve_private_payload_while_redacting_secrets(self) -> None:
        tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(tempdir.cleanup)
        service = DebugLogService(Path(tempdir.name) / "logs.log")

        entry = service.log_server_error(
            title="POST /api/v1/graphs/demo/chat/stream",
            message="Proposal generation failed",
            request_payload={
                "prompt": "full prompt text",
                "planner_system_instruction": "full role text",
                "gemini_api_key": "secret-value",
                "messages": [{"content": "full message body"}],
            },
            response_payload={"raw_model_response_text": "{\"summary\":\"ok\"}"},
            preserve_private_payload=True,
        )

        self.assertIn("full prompt text", entry.request_excerpt or "")
        self.assertIn("full role text", entry.request_excerpt or "")
        self.assertIn("full message body", entry.request_excerpt or "")
        self.assertNotIn("secret-value", entry.request_excerpt or "")
        self.assertIn("[redacted]", entry.request_excerpt or "")


class DebugLogRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(tempdir.cleanup)
        self.repository = GraphRepository(Path(tempdir.name) / "state.sqlite3")

    def test_debug_log_routes_require_debug_mode(self) -> None:
        client = TestClient(app, raise_server_exceptions=False)
        app.dependency_overrides[routes.get_repository] = lambda: self.repository
        self.addCleanup(app.dependency_overrides.clear)

        response = client.get("/api/v1/debug/logs")

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"], "debug logs are disabled")

    def test_debug_log_routes_work_when_debug_mode_enabled(self) -> None:
        self.repository.update_workspace_config(
            UpdateWorkspaceConfigRequest(debug_mode_enabled=True)
        )

        client = TestClient(app)
        app.dependency_overrides[routes.get_repository] = lambda: self.repository
        self.addCleanup(app.dependency_overrides.clear)

        ingest_response = client.post(
            "/api/v1/debug/logs/client",
            json={
                "kind": "api",
                "title": "GET /api/v1/workspace/current",
                "message": "ok",
            },
        )
        self.assertEqual(ingest_response.status_code, 200)

        snapshot_response = client.get("/api/v1/debug/logs")
        self.assertEqual(snapshot_response.status_code, 200)
        self.assertEqual(len(snapshot_response.json()["api"]), 1)


if __name__ == "__main__":
    unittest.main()
