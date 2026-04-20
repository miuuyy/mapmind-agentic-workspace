from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app.api import routes
from app.core.config import Settings
from app.main import app
from app.llm.schemas import OrchestratorDecision
from app.models.domain import ApplyPlanEnvelope, ApplyPreview, ApplyValidation, ChatMessage, CreateGraphRequest, GraphChatResponse, GraphOperation, GraphProposal, GraphProposalEnvelope, PatchOperation, ProposalDisplay, ProposalGenerateResponse, ProposalIntent, ProposalSourceBundle, ProposalTopic, ProposalTrace
from app.services.chat_orchestrator import ChatOrchestratorError
from app.services.debug_log_service import get_debug_log_service
from app.services.repository import GraphRepository


class _OrchestratorStub:
    @staticmethod
    def has_live_provider() -> bool:
        return True

    def respond(self, graph, request, *, persona_rules: str = "", workspace_config=None) -> GraphChatResponse:  # noqa: ANN001, ANN003
        return GraphChatResponse(
            session_id="",
            graph_id=graph.graph_id,
            message=f"Reply for {request.prompt}",
            model="gemini-3-flash-preview",
            fallback_used=False,
            action="answer",
        )


class ChatPersistenceTests(unittest.TestCase):
    GRAPH_ID = "mathematics-demo"

    def setUp(self) -> None:
        tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(tempdir.cleanup)
        self.temp_root = Path(tempdir.name)
        self.repository = GraphRepository(self.temp_root / "state.sqlite3")
        self.settings = Settings()
        self.settings.root_dir = self.temp_root

    def test_repository_keeps_one_stable_thread_per_graph(self) -> None:
        initial = self.repository.chat_thread(self.GRAPH_ID)
        self.assertEqual(initial.session_id, f"thread_{self.GRAPH_ID}")
        self.assertEqual(initial.messages, [])

        self.repository.append_chat_message(self.GRAPH_ID, ChatMessage(role="user", content="hello"))
        persisted = self.repository.append_chat_message(self.GRAPH_ID, ChatMessage(role="assistant", content="world"))

        self.assertEqual(persisted.session_id, f"thread_{self.GRAPH_ID}")
        self.assertEqual([message.role for message in persisted.messages], ["user", "assistant"])
        self.assertEqual([message.content for message in persisted.messages], ["hello", "world"])

    def test_chat_route_returns_persisted_thread(self) -> None:
        client = TestClient(app)
        app.dependency_overrides[routes.get_repository] = lambda: self.repository
        app.dependency_overrides[routes.get_chat_orchestrator] = lambda: _OrchestratorStub()
        self.addCleanup(app.dependency_overrides.clear)

        get_response = client.get(f"/api/v1/graphs/{self.GRAPH_ID}/chat")
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.json()["messages"], [])

        post_response = client.post(
            f"/api/v1/graphs/{self.GRAPH_ID}/chat",
            json={
                "prompt": "Help me",
                "messages": [],
                "selected_topic_id": None,
                "model": "gemini-3-flash-preview",
                "use_grounding": True,
            },
        )
        self.assertEqual(post_response.status_code, 200)
        payload = post_response.json()
        self.assertEqual(payload["graph_id"], self.GRAPH_ID)
        self.assertEqual([message["role"] for message in payload["messages"]], ["user", "assistant"])
        self.assertEqual(payload["messages"][0]["content"], "Help me")
        self.assertEqual(payload["messages"][1]["content"], "Reply for Help me")

        persisted_response = client.get(f"/api/v1/graphs/{self.GRAPH_ID}/chat")
        self.assertEqual(persisted_response.status_code, 200)
        persisted_payload = persisted_response.json()
        self.assertEqual(len(persisted_payload["messages"]), 2)
        self.assertEqual(persisted_payload["messages"][1]["content"], "Reply for Help me")

    def test_mark_applied_persists_on_chat_message(self) -> None:
        thread = self.repository.append_chat_message(
            self.GRAPH_ID,
            ChatMessage(
                role="assistant",
                content="Proposal ready",
                id="assistant_1",
            ),
        )
        self.assertFalse(thread.messages[0].proposal_applied)

        client = TestClient(app)
        app.dependency_overrides[routes.get_repository] = lambda: self.repository
        self.addCleanup(app.dependency_overrides.clear)

        response = client.post(f"/api/v1/graphs/{self.GRAPH_ID}/chat/messages/assistant_1/applied")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["messages"][0]["proposal_applied"])

    def test_repository_persists_planning_status_on_chat_message(self) -> None:
        thread = self.repository.append_chat_message(
            self.GRAPH_ID,
            ChatMessage(
                role="assistant",
                content="Preparing proposal",
                id="assistant_planning",
                action="propose_expand",
            ),
        )
        message = thread.messages[0]
        message.planning_status = "Creating graph proposal"
        message.planning_error = None

        updated = self.repository.update_chat_message(self.GRAPH_ID, message)
        self.assertEqual(updated.messages[0].planning_status, "Creating graph proposal")

        persisted = self.repository.chat_thread(self.GRAPH_ID)
        self.assertEqual(persisted.messages[0].planning_status, "Creating graph proposal")

    def test_delete_and_recreate_graph_does_not_reuse_old_chat_history(self) -> None:
        self.repository.append_chat_message(self.GRAPH_ID, ChatMessage(role="user", content="old prompt"))
        self.repository.append_chat_message(self.GRAPH_ID, ChatMessage(role="assistant", content="old answer"))

        self.repository.delete_graph(self.GRAPH_ID)
        self.repository.create_graph(
            CreateGraphRequest(
                title="Mathematics demo",
                subject="math",
                language="en",
                description="fresh graph",
            )
        )

        recreated_thread = self.repository.chat_thread(self.GRAPH_ID)
        self.assertEqual(recreated_thread.session_id, f"thread_{self.GRAPH_ID}")
        self.assertEqual(recreated_thread.messages, [])

    def test_chat_route_rejects_unknown_session_id(self) -> None:
        client = TestClient(app, raise_server_exceptions=False)
        app.dependency_overrides[routes.get_repository] = lambda: self.repository
        app.dependency_overrides[routes.get_chat_orchestrator] = lambda: _OrchestratorStub()
        self.addCleanup(app.dependency_overrides.clear)

        response = client.post(
            f"/api/v1/graphs/{self.GRAPH_ID}/chat",
            json={
                "prompt": "Hello",
                "messages": [],
                "session_id": "chat_missing",
                "use_grounding": False,
            },
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "chat session chat_missing not found")

    def test_chat_stream_rejects_unknown_session_id(self) -> None:
        client = TestClient(app, raise_server_exceptions=False)
        app.dependency_overrides[routes.get_repository] = lambda: self.repository
        app.dependency_overrides[routes.get_chat_orchestrator] = lambda: _OrchestratorStub()
        self.addCleanup(app.dependency_overrides.clear)

        response = client.post(
            f"/api/v1/graphs/{self.GRAPH_ID}/chat/stream",
            json={
                "prompt": "Hello",
                "messages": [],
                "session_id": "chat_missing",
                "use_grounding": False,
            },
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "chat session chat_missing not found")

    def test_chat_route_fails_closed_without_provider_and_does_not_persist_user_message(self) -> None:
        class UnavailableOrchestrator:
            @staticmethod
            def has_live_provider() -> bool:
                return False

            @staticmethod
            def respond(graph, request, *, persona_rules: str = "", workspace_config=None):  # noqa: ANN001, ANN003, ANN201
                raise ChatOrchestratorError("The selected AI provider is unavailable: missing API key")

        client = TestClient(app, raise_server_exceptions=False)
        app.dependency_overrides[routes.get_repository] = lambda: self.repository
        app.dependency_overrides[routes.get_chat_orchestrator] = lambda: UnavailableOrchestrator()
        self.addCleanup(app.dependency_overrides.clear)

        response = client.post(
            f"/api/v1/graphs/{self.GRAPH_ID}/chat",
            json={
                "prompt": "Hello",
                "messages": [],
                "use_grounding": False,
            },
        )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "The selected AI provider is unavailable: missing API key")
        self.assertEqual(self.repository.chat_thread(self.GRAPH_ID).messages, [])

    def test_chat_stream_proposal_ready_event_includes_updated_message(self) -> None:
        def build_proposal_payload(graph_id: str) -> dict:
            topic = ProposalTopic(
                id="attention-basics",
                title="Attention basics",
                slug="attention-basics",
                description="Study the attention mechanism.",
                level=1,
            )
            operation = GraphOperation(
                op_id="topic_attention_basics",
                op="upsert_topic",
                entity_kind="topic",
                rationale="Needed for transformer expansion.",
                topic=topic,
            )
            proposal = ProposalGenerateResponse(
                proposal_envelope=GraphProposalEnvelope(
                    graph_id=graph_id,
                    mode="expand_goal",
                    proposal_id="proposal_attention_basics",
                    intent=ProposalIntent(user_prompt="Expand toward transformers", target_goal="transformers"),
                    source_bundle=ProposalSourceBundle(raw_text="", grounding_enabled=False),
                    summary="Add attention basics.",
                    assistant_message="Added a foundation topic.",
                    operations=[operation],
                ),
                apply_plan=ApplyPlanEnvelope(
                    proposal_id="proposal_attention_basics",
                    graph_id=graph_id,
                    validation=ApplyValidation(ok=True),
                    normalized_proposal=GraphProposal(
                        graph_id=graph_id,
                        user_prompt="Expand toward transformers",
                        summary="Add attention basics.",
                        assistant_message="Added a foundation topic.",
                        operations=[PatchOperation(op="upsert_topic", topic=topic)],
                    ),
                    patch_groups=[],
                    preview=ApplyPreview(topic_add_count=1),
                ),
                trace=ProposalTrace(
                    model="gpt-5.4-nano",
                    mode="expand_goal",
                    used_grounding=False,
                    raw_text_present=False,
                    source_item_count=0,
                ),
                display=ProposalDisplay(summary="1 topic"),
            )
            return proposal.model_dump(mode="json")

        class StreamingOrchestrator:
            @staticmethod
            def has_live_provider() -> bool:
                return True

            @staticmethod
            def decide(graph, request, *, persona_rules: str = "", workspace_config=None):  # noqa: ANN001, ANN003, ANN201
                return OrchestratorDecision(
                    action="propose_expand",
                    reply_message="Preparing proposal.",
                    proposal_target_goal="transformers",
                    proposal_instructions="Add one bridge topic.",
                )

            @staticmethod
            def reply_for_decision(decision):  # noqa: ANN001, ANN201
                return decision.reply_message

            @staticmethod
            def proposal_request_for_decision(decision, request, *, model_name: str):  # noqa: ANN001, ANN003, ANN201
                return None

            @staticmethod
            def stream_proposal_result(graph, request):  # noqa: ANN001, ANN201
                return build_proposal_payload(graph.graph_id)

        client = TestClient(app)
        app.dependency_overrides[routes.get_repository] = lambda: self.repository
        app.dependency_overrides[routes.get_settings] = lambda: self.settings
        app.dependency_overrides[routes.get_chat_orchestrator] = lambda: StreamingOrchestrator()
        self.addCleanup(app.dependency_overrides.clear)

        response = client.post(
            f"/api/v1/graphs/{self.GRAPH_ID}/chat/stream",
            json={
                "prompt": "Expand graph toward transformers",
                "messages": [],
                "use_grounding": False,
            },
        )

        self.assertEqual(response.status_code, 200)
        events = [json.loads(line) for line in response.text.splitlines() if line.strip()]
        proposal_ready = next(event for event in events if event["type"] == "proposal_ready")
        self.assertIn("message", proposal_ready)
        self.assertIn("messages", proposal_ready)
        self.assertEqual(proposal_ready["message"]["proposal"]["display"]["summary"], "1 topic")

    def test_chat_stream_logs_server_diagnostics_when_proposal_generation_fails(self) -> None:
        class FailingStreamingOrchestrator:
            @staticmethod
            def has_live_provider() -> bool:
                return True

            @staticmethod
            def decide(graph, request, *, persona_rules: str = "", workspace_config=None):  # noqa: ANN001, ANN003, ANN201
                return OrchestratorDecision(
                    action="propose_expand",
                    reply_message="Preparing proposal.",
                    proposal_target_goal="neurobiology",
                    proposal_instructions="Make it more detailed.",
                )

            @staticmethod
            def reply_for_decision(decision):  # noqa: ANN001, ANN201
                return decision.reply_message

            @staticmethod
            def proposal_request_for_decision(decision, request, *, model_name: str):  # noqa: ANN001, ANN003, ANN201
                from app.models.domain import ProposalGenerateRequest

                return ProposalGenerateRequest(
                    mode="expand_goal",
                    raw_text=request.prompt,
                    target_goal=decision.proposal_target_goal,
                    instructions=decision.proposal_instructions,
                    selected_topic_id=request.selected_topic_id,
                    use_grounding=request.use_grounding,
                    model=model_name,
                )

            @staticmethod
            def stream_proposal_result(graph, request):  # noqa: ANN001, ANN201
                raise ChatOrchestratorError(
                    "proposal generation failed: proposal would create disconnected graph islands; link new topics through meaningful prerequisites",
                    diagnostics={
                        "planner_system_instruction": "full planner role and hard rules",
                        "planner_prompt": "{\"task\":{\"target_goal\":\"neurobiology\"}}",
                        "raw_model_response_text": '{"summary":"x","operations":[]}',
                        "proposal_payload": {"operations": []},
                        "connectivity": {
                            "connected": False,
                            "component_count": 2,
                            "island_components": [{"topic_ids": ["topic-a", "topic-b"]}],
                        },
                    },
                )

        client = TestClient(app)
        app.dependency_overrides[routes.get_repository] = lambda: self.repository
        app.dependency_overrides[routes.get_settings] = lambda: self.settings
        app.dependency_overrides[routes.get_chat_orchestrator] = lambda: FailingStreamingOrchestrator()
        self.addCleanup(app.dependency_overrides.clear)

        response = client.post(
            f"/api/v1/graphs/{self.GRAPH_ID}/chat/stream",
            json={
                "prompt": "Expand graph toward neurobiology",
                "messages": [],
                "use_grounding": True,
                "model": "gemini-3-flash-preview",
            },
        )

        self.assertEqual(response.status_code, 200)
        logs = get_debug_log_service(self.settings.root_dir).snapshot()
        server_entry = logs.server[0]
        self.assertEqual(server_entry.message, "Proposal generation failed")
        self.assertIn("raw_model_response_text", server_entry.request_excerpt or "")
        self.assertIn("connectivity", server_entry.request_excerpt or "")
        self.assertIn("proposal_request", server_entry.request_excerpt or "")
        self.assertIn("full planner role and hard rules", server_entry.request_excerpt or "")
        self.assertIn("\"target_goal\":\"neurobiology\"", server_entry.request_excerpt or "")

    def test_delete_session_is_scoped_to_its_graph(self) -> None:
        self.repository.create_graph(CreateGraphRequest(title="Physics", subject="science"))
        physics_session = self.repository.create_chat_session("physics", title="Physics session")

        client = TestClient(app)
        app.dependency_overrides[routes.get_repository] = lambda: self.repository
        self.addCleanup(app.dependency_overrides.clear)

        response = client.delete(f"/api/v1/graphs/{self.GRAPH_ID}/chat/sessions/{physics_session.session_id}")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], f"chat session {physics_session.session_id} not found")
        self.assertIn(physics_session.session_id, [session.session_id for session in self.repository.list_chat_sessions("physics")])

    def test_delete_session_rejects_default_graph_thread(self) -> None:
        default_thread = self.repository.chat_thread(self.GRAPH_ID)

        client = TestClient(app)
        app.dependency_overrides[routes.get_repository] = lambda: self.repository
        self.addCleanup(app.dependency_overrides.clear)

        response = client.delete(f"/api/v1/graphs/{self.GRAPH_ID}/chat/sessions/{default_thread.session_id}")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "default graph thread cannot be deleted")

    def test_create_session_rejects_empty_topic_id(self) -> None:
        client = TestClient(app, raise_server_exceptions=False)
        app.dependency_overrides[routes.get_repository] = lambda: self.repository
        self.addCleanup(app.dependency_overrides.clear)

        response = client.post(
            f"/api/v1/graphs/{self.GRAPH_ID}/chat/sessions",
            json={"topic_id": "", "title": "Broken"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "topic_id cannot be empty")

    def test_create_session_rejects_unknown_topic_id(self) -> None:
        client = TestClient(app, raise_server_exceptions=False)
        app.dependency_overrides[routes.get_repository] = lambda: self.repository
        self.addCleanup(app.dependency_overrides.clear)

        response = client.post(
            f"/api/v1/graphs/{self.GRAPH_ID}/chat/sessions",
            json={"topic_id": "topic_missing", "title": "Broken"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], f"topic topic_missing not found in graph {self.GRAPH_ID}")

    def test_mark_applied_rejects_unknown_session_id(self) -> None:
        client = TestClient(app, raise_server_exceptions=False)
        app.dependency_overrides[routes.get_repository] = lambda: self.repository
        self.addCleanup(app.dependency_overrides.clear)

        response = client.post(
            f"/api/v1/graphs/{self.GRAPH_ID}/chat/messages/assistant_1/applied?session_id=chat_missing"
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "chat session chat_missing not found")


if __name__ == "__main__":
    unittest.main()
