from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
import sqlite3

from app.core.config import Settings
from app.llm.base import LLMProviderError
from app.llm.registry import build_llm_provider
from app.models.domain import ChatMessage, CreateGraphRequest, GraphChatRequest, StudyAssistantRequest, UpdateWorkspaceConfigRequest, WorkspaceConfig
from app.services.chat_orchestrator import ChatOrchestratorError, ChatOrchestratorService
from app.services.repository import GraphRepository
from app.services.study_assistant import StudyAssistantError, StudyAssistantService


class WorkspaceConfigAndAssistantTests(unittest.TestCase):
    def setUp(self) -> None:
        tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(tempdir.cleanup)
        self.db_path = Path(tempdir.name) / "state.sqlite3"
        self.repository = GraphRepository(self.db_path)

    def test_update_workspace_default_model(self) -> None:
        workspace = self.repository.update_workspace_config(
            UpdateWorkspaceConfigRequest(default_model="gemini-3-flash-preview")
        )

        self.assertEqual(workspace.workspace.config.default_model, "gemini-3-flash-preview")

    def test_update_workspace_grounding_flag(self) -> None:
        workspace = self.repository.update_workspace_config(
            UpdateWorkspaceConfigRequest(use_google_search_grounding=False)
        )

        self.assertFalse(workspace.workspace.config.use_google_search_grounding)

    def test_update_workspace_closure_tests_flag(self) -> None:
        workspace = self.repository.update_workspace_config(
            UpdateWorkspaceConfigRequest(enable_closure_tests=False)
        )

        self.assertFalse(workspace.workspace.config.enable_closure_tests)

    def test_update_workspace_memory_mode_applies_preset(self) -> None:
        workspace = self.repository.update_workspace_config(
            UpdateWorkspaceConfigRequest(memory_mode="max")
        )

        self.assertEqual(workspace.workspace.config.memory_mode, "max")
        self.assertEqual(workspace.workspace.config.memory_history_message_limit, 64)
        self.assertTrue(workspace.workspace.config.memory_include_graph_context)
        self.assertTrue(workspace.workspace.config.memory_include_progress_context)

    def test_workspace_config_migrates_legacy_hidden_modes_to_custom(self) -> None:
        config = WorkspaceConfig.model_validate(
            {
                "thinking_mode": "max",
                "memory_mode": "compact",
            }
        )

        self.assertEqual(config.thinking_mode, "custom")
        self.assertEqual(config.planner_max_output_tokens, 360000)
        self.assertEqual(config.planner_thinking_budget, 32768)
        self.assertEqual(config.memory_mode, "custom")
        self.assertEqual(config.memory_history_message_limit, 12)
        self.assertFalse(config.memory_include_graph_context)

    def test_update_workspace_persona_rules(self) -> None:
        workspace = self.repository.update_workspace_config(
            UpdateWorkspaceConfigRequest(persona_rules="Be concise. Prioritize concrete study steps.")
        )

        self.assertEqual(
            workspace.workspace.config.persona_rules,
            "Be concise. Prioritize concrete study steps.",
        )

    def test_env_keys_override_workspace_stored_keys(self) -> None:
        workspace = self.repository.update_workspace_config(
            UpdateWorkspaceConfigRequest(
                gemini_api_key="workspace-gemini",
                openai_api_key="workspace-openai",
                openai_base_url="https://workspace.example/v1",
            )
        )
        settings = Settings()
        settings.gemini_api_key = "env-gemini"
        settings.openai_api_key = "env-openai"
        settings.openai_base_url = "https://env.example/v1"

        effective = settings.with_workspace_overrides(workspace.workspace.config)

        self.assertEqual(effective.gemini_api_key, "env-gemini")
        self.assertEqual(effective.openai_api_key, "env-openai")
        self.assertEqual(effective.openai_base_url, "https://env.example/v1")

    def test_workspace_api_keys_are_kept_out_of_snapshot_payloads(self) -> None:
        self.repository.update_workspace_config(
            UpdateWorkspaceConfigRequest(
                gemini_api_key="workspace-gemini",
                openai_api_key="workspace-openai",
            )
        )

        created = self.repository.create_graph(
            CreateGraphRequest(title="Physics", subject="science", language="en", description="")
        )

        self.assertEqual(created.workspace.config.gemini_api_key, "workspace-gemini")
        self.assertEqual(created.workspace.config.openai_api_key, "workspace-openai")

        conn = sqlite3.connect(self.db_path)
        row = conn.execute(
            "SELECT payload_json FROM graph_snapshots ORDER BY id DESC LIMIT 1"
        ).fetchone()
        conn.close()

        self.assertIsNotNone(row)
        self.assertNotIn("workspace-gemini", row[0])
        self.assertNotIn("workspace-openai", row[0])

    def test_build_llm_provider_fails_closed_for_unknown_provider(self) -> None:
        settings = Settings()
        settings.ai_provider = "anthropic"
        settings.gemini_api_key = "test-key"

        with self.assertRaises(LLMProviderError) as context:
            build_llm_provider(settings)

        self.assertIn("Unsupported AI provider", str(context.exception))

    def test_study_assistant_fails_closed_without_api_key(self) -> None:
        settings = Settings()
        settings.gemini_api_key = None
        assistant = StudyAssistantService(settings)
        graph = self.repository.graph("mathematics-demo")

        with self.assertRaises(StudyAssistantError) as context:
            assistant.answer(
                graph,
                StudyAssistantRequest(
                    prompt="What should I focus on next?",
                    selected_topic_id="functions",
                    model="gemini-3-flash-preview",
                ),
            )

        self.assertIn("missing API key", str(context.exception))

    def test_chat_orchestrator_fails_closed_without_api_key(self) -> None:
        settings = Settings()
        settings.gemini_api_key = None
        planner = type("PlannerStub", (), {"generate_proposal": lambda self, graph, request: None})()
        orchestrator = ChatOrchestratorService(settings, planner)
        graph = self.repository.graph("mathematics-demo")

        with self.assertRaises(ChatOrchestratorError) as context:
            orchestrator.respond(
                graph,
                GraphChatRequest(
                    prompt="Expand graph toward target: transformers",
                    selected_topic_id="functions",
                    model="gemini-3-flash-preview",
                    use_grounding=True,
                ),
            )

        self.assertIn("selected AI provider is unavailable", str(context.exception))

    def test_chat_orchestrator_surfaces_planner_failure_with_api_key(self) -> None:
        settings = Settings()
        settings.gemini_api_key = "test-key"

        class ProviderStub:
            @staticmethod
            def generate_structured(**kwargs):  # noqa: ANN003, ANN201
                from app.services.chat_orchestrator import OrchestratorDecision

                return type(
                    "StructuredResponse",
                    (),
                    {
                        "parsed": OrchestratorDecision(
                            action="propose_expand",
                            reply_message="Working on it.",
                            proposal_target_goal="ml learning first steps",
                            proposal_raw_text="",
                            proposal_instructions="",
                        )
                    },
                )()

        class PlannerStub:
            @staticmethod
            def generate_proposal(graph, request):  # noqa: ANN001, ANN201
                raise RuntimeError("planner exploded")

        orchestrator = ChatOrchestratorService(settings, PlannerStub())
        orchestrator._provider = ProviderStub()  # type: ignore[attr-defined]
        graph = self.repository.graph("mathematics-demo")

        with self.assertRaises(ChatOrchestratorError) as context:
            orchestrator.respond(
                graph,
                GraphChatRequest(
                    prompt="Build an ml path",
                    selected_topic_id="functions",
                    model="gemini-3-flash-preview",
                    use_grounding=True,
                ),
            )

        self.assertIn("proposal generation failed", str(context.exception))

    def test_chat_orchestrator_includes_persona_rules_in_system_instruction(self) -> None:
        settings = Settings()
        settings.gemini_api_key = "test-key"
        captured: dict[str, object] = {}

        class ProviderStub:
            @staticmethod
            def generate_structured(**kwargs):  # noqa: ANN003, ANN201
                captured.update(kwargs)
                from app.services.chat_orchestrator import OrchestratorDecision

                return type(
                    "StructuredResponse",
                    (),
                    {"parsed": OrchestratorDecision(action="answer", reply_message="ok")},
                )()

        planner = type("PlannerStub", (), {"generate_proposal": lambda self, graph, request: None})()
        orchestrator = ChatOrchestratorService(settings, planner)
        orchestrator._provider = ProviderStub()  # type: ignore[attr-defined]
        graph = self.repository.graph("mathematics-demo")

        orchestrator.respond(
            graph,
            GraphChatRequest(
                prompt="hello",
                selected_topic_id="functions",
                model="gemini-3-flash-preview",
                use_grounding=True,
            ),
            persona_rules="Be concise. Avoid fluff.",
        )

        self.assertIn("Be concise. Avoid fluff.", str(captured["system_instruction"]))
        self.assertIn("cannot delete graph content", str(captured["system_instruction"]))

    def test_chat_orchestrator_respects_custom_memory_profile(self) -> None:
        settings = Settings()
        settings.gemini_api_key = None
        planner = type("PlannerStub", (), {"generate_proposal": lambda self, graph, request: None})()
        orchestrator = ChatOrchestratorService(settings, planner)
        graph = self.repository.graph("mathematics-demo")

        prompt = orchestrator._build_prompt(  # noqa: SLF001
            graph,
            GraphChatRequest(
                prompt="what next?",
                messages=[
                    ChatMessage(role="user", content="old one"),
                    ChatMessage(role="assistant", content="older reply"),
                    ChatMessage(role="user", content="latest message"),
                ],
                selected_topic_id="functions",
                use_grounding=True,
            ),
            workspace_config=WorkspaceConfig(
                memory_mode="custom",
                memory_history_message_limit=1,
                memory_include_graph_context=False,
                memory_include_progress_context=True,
                memory_include_quiz_context=False,
                memory_include_frontier_context=False,
                memory_include_selected_topic_context=False,
            ),
        )

        self.assertIn("Graph context:\nomitted", prompt)
        self.assertIn("Recent quiz activity:\nomitted", prompt)
        self.assertIn("Learning frontier (ready to study next):\nomitted", prompt)
        self.assertIn("Selected topic context:\nomitted", prompt)
        self.assertIn("Recent chat history:\nuser: latest message", prompt)
        self.assertNotIn("old one", prompt)

    def test_chat_orchestrator_stream_result_uses_public_planner_path(self) -> None:
        settings = Settings()
        settings.gemini_api_key = "test-key"

        class PlannerStub:
            @staticmethod
            def stream_proposal(graph, request):  # noqa: ANN001, ANN201
                yield {"type": "status", "stage": "started"}
                yield {"type": "result", "result": {"proposal_envelope": {"graph_id": graph.graph_id}}}

        orchestrator = ChatOrchestratorService(settings, PlannerStub())
        graph = self.repository.graph("mathematics-demo")

        result = orchestrator.stream_proposal_result(
            graph,
            orchestrator.proposal_request_for_decision(
                decision=type(
                    "DecisionStub",
                    (),
                    {
                        "action": "propose_expand",
                        "proposal_raw_text": "",
                        "proposal_target_goal": "embeddings",
                        "proposal_instructions": "",
                    },
                )(),
                request=GraphChatRequest(
                    prompt="build path",
                    selected_topic_id="functions",
                    model="gemini-3-flash-preview",
                    use_grounding=True,
                ),
                model_name="gemini-3-flash-preview",
            ),
        )

        self.assertEqual(result["proposal_envelope"]["graph_id"], "mathematics-demo")

    def test_proposal_request_carries_selected_topic_id(self) -> None:
        settings = Settings()
        settings.gemini_api_key = "test-key"
        planner = type("PlannerStub", (), {"generate_proposal": lambda self, graph, request: None})()
        orchestrator = ChatOrchestratorService(settings, planner)

        request = GraphChatRequest(
            prompt="Expand graph toward target: transformers",
            selected_topic_id="functions",
            model="gemini-3-flash-preview",
            use_grounding=True,
        )

        proposal_request = orchestrator.proposal_request_for_decision(
            decision=type(
                "DecisionStub",
                (),
                {
                    "action": "propose_expand",
                    "proposal_raw_text": "",
                    "proposal_target_goal": "transformers",
                    "proposal_instructions": "",
                },
            )(),
            request=request,
            model_name="gemini-3-flash-preview",
        )

        self.assertEqual(proposal_request.selected_topic_id, "functions")

    def test_learning_session_prompt_constrains_inline_quiz_to_answer_action(self) -> None:
        settings = Settings()
        settings.gemini_api_key = None
        planner = type("PlannerStub", (), {"generate_proposal": lambda self, graph, request: None})()
        orchestrator = ChatOrchestratorService(settings, planner)
        graph = self.repository.graph("mathematics-demo")

        prompt = orchestrator._build_prompt(  # noqa: SLF001
            graph,
            GraphChatRequest(
                prompt="Expand graph toward target: transformers",
                selected_topic_id="functions",
                session_id="session_1",
                use_grounding=True,
            ),
            workspace_config=WorkspaceConfig(),
        )

        self.assertIn("Inline quizzes are allowed only when action='answer'", prompt)
        self.assertIn("inline_quiz must be null", prompt)
        self.assertIn("short imperative request to add, expand, grow, extend, or flesh out the graph", prompt)
        self.assertIn("do not answer with options or a plan summary", prompt)


if __name__ == "__main__":
    unittest.main()
