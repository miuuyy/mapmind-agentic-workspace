from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app.api import routes
from app.main import app
from app.services.repository import GraphRepository


class ApplyRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(tempdir.cleanup)
        self.repository = GraphRepository(Path(tempdir.name) / "state.sqlite3")

    def test_apply_rejects_remove_operations_in_envelopes(self) -> None:
        client = TestClient(app)
        app.dependency_overrides[routes.get_repository] = lambda: self.repository
        self.addCleanup(app.dependency_overrides.clear)

        response = client.post(
            "/api/v1/graphs/mathematics-demo/apply",
            json={
                "graph_id": "mathematics-demo",
                "mode": "expand_goal",
                "intent": {"user_prompt": "remove topic"},
                "source_bundle": {"raw_text": "", "source_items": [], "grounding_enabled": False},
                "summary": "bad proposal",
                "assistant_message": "bad proposal",
                "operations": [
                    {
                        "op_id": "remove_1",
                        "op": "remove_topic",
                        "entity_kind": "topic",
                        "rationale": "not allowed",
                        "topic_id": "functions",
                    }
                ],
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("not allowed in proposal envelopes", response.json()["detail"]["errors"][0])


if __name__ == "__main__":
    unittest.main()
