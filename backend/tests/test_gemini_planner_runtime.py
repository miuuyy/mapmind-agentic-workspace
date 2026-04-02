from __future__ import annotations

import json
from types import SimpleNamespace
import unittest

from app.models.domain import ProposalGenerateRequest
from app.services.bootstrap import build_seed_workspace
from app.services.gemini_planner import GeminiPlanner, GeminiPlannerError
from app.services.proposal_normalizer import ProposalNormalizer


class _FakeModels:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = 0
        self.last_kwargs = None

    def generate_content(self, **kwargs):
        self.calls += 1
        self.last_kwargs = kwargs
        if not self._responses:
            raise AssertionError("no fake responses left")
        return self._responses.pop(0)

    def generate_content_stream(self, **kwargs):
        self.calls += 1
        self.last_kwargs = kwargs
        if not self._responses:
            raise AssertionError("no fake responses left")
        response = self._responses.pop(0)
        if isinstance(response, list):
            return iter(response)
        return iter([response])


class _FakeGenerateContentConfig:
    def __init__(self, **kwargs):
        self._kwargs = kwargs

    def model_dump(self, exclude_none: bool = False):
        if not exclude_none:
            return dict(self._kwargs)
        return {key: value for key, value in self._kwargs.items() if value is not None}


class _FakeThinkingConfig:
    def __init__(self, thinking_budget):
        self.thinking_budget = thinking_budget

    def model_dump(self, mode: str = "json"):
        return {"thinking_budget": self.thinking_budget}


class GeminiPlannerRuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.graph = next(graph for graph in build_seed_workspace().graphs if graph.graph_id == "mathematics-demo")

    def _planner_with_responses(self, *responses):
        planner = GeminiPlanner.__new__(GeminiPlanner)
        planner._settings = SimpleNamespace(default_model="gemini-3-pro-preview", planner_max_output_tokens=200000)
        planner._client = SimpleNamespace(models=_FakeModels(responses))
        planner._types = SimpleNamespace(
            GenerateContentConfig=_FakeGenerateContentConfig,
            ThinkingConfig=_FakeThinkingConfig,
            Tool=lambda **kwargs: kwargs,
            GoogleSearch=object,
            UrlContext=object,
        )
        planner._normalizer = ProposalNormalizer()
        return planner

    def _valid_expand_response(self):
        draft = {
            "summary": "Ingested 20 topics and multiple bridges.",
            "assistant_message": "Added a bridge topic and its dependency.",
            "operations": [
                {
                    "op_id": "topic_1",
                    "op": "upsert_topic",
                    "entity_kind": "topic",
                    "rationale": "bridge to embeddings",
                    "topic": {
                        "id": "exponential-function",
                        "title": "Exponential function",
                        "slug": "exponential-function",
                        "description": "Foundation for later logarithms",
                        "estimated_minutes": 90,
                        "level": 2,
                    },
                },
                {
                    "op_id": "edge_1",
                    "op": "upsert_edge",
                    "entity_kind": "edge",
                    "rationale": "depends on functions",
                    "edge": {
                        "id": "edge-functions-exponential",
                        "source_topic_id": "functions",
                        "target_topic_id": "exponential-function",
                        "relation": "requires",
                    },
                },
            ],
        }
        return SimpleNamespace(parsed=draft, text=json.dumps(draft), usage_metadata=None)

    def test_sanitize_raw_text_only_removes_separators_and_extra_blank_lines(self) -> None:
        planner = self._planner_with_responses()

        sanitized = planner._sanitize_raw_text(
            "---\n"
            "* Arithmetic operations\n"
            "  Region: Foundations\n"
            "\n"
            "\n"
            "---\n"
            "* Exponents and roots\n"
        )

        self.assertEqual(
            sanitized,
            "* Arithmetic operations\n  Region: Foundations\n\n* Exponents and roots",
        )

    def test_generate_proposal_uses_single_generation_call(self) -> None:
        planner = self._planner_with_responses(self._valid_expand_response())

        result = planner.generate_proposal(
            self.graph,
            ProposalGenerateRequest(mode="expand_goal", raw_text="- exponential function"),
        )

        self.assertEqual(planner._client.models.calls, 1)
        self.assertEqual(result.display.summary, "1 topic, 1 edge")

    def test_invalid_json_surfaces_without_retry_or_repair(self) -> None:
        planner = self._planner_with_responses(
            SimpleNamespace(parsed=None, text="not json", usage_metadata=None)
        )

        with self.assertRaisesRegex(GeminiPlannerError, "invalid proposal JSON"):
            planner.generate_proposal(
                self.graph,
                ProposalGenerateRequest(mode="ingest_topics", raw_text="- arithmetic"),
            )

        self.assertEqual(planner._client.models.calls, 1)

    def test_max_tokens_truncation_surfaces_explicit_transport_error(self) -> None:
        planner = self._planner_with_responses(
            SimpleNamespace(
                parsed=None,
                text='{"summary":"cut off"',
                candidates=[SimpleNamespace(finish_reason="MAX_TOKENS")],
                usage_metadata=None,
            )
        )

        with self.assertRaisesRegex(GeminiPlannerError, "output token limit"):
            planner.generate_proposal(
                self.graph,
                ProposalGenerateRequest(mode="ingest_topics", raw_text="- arithmetic"),
            )

    def test_display_summary_is_derived_from_normalized_operations(self) -> None:
        planner = self._planner_with_responses(self._valid_expand_response())

        result = planner.generate_proposal(
            self.graph,
            ProposalGenerateRequest(mode="expand_goal", raw_text="- exponential function"),
        )

        self.assertEqual(result.proposal_envelope.summary, "Ingested 20 topics and multiple bridges.")
        self.assertEqual(result.display.summary, "1 topic, 1 edge")
        self.assertIn("Exponential function", result.display.highlights)

    def test_extracts_json_from_candidate_parts_when_response_text_is_missing(self) -> None:
        planner = self._planner_with_responses(
            SimpleNamespace(
                parsed=None,
                text=None,
                candidates=[
                    SimpleNamespace(
                        content=SimpleNamespace(
                            parts=[
                                SimpleNamespace(
                                    text=json.dumps(
                                        {
                                            "summary": "Bridge topic",
                                            "assistant_message": "Added one topic.",
                                            "operations": [
                                                {
                                                    "op_id": "topic_1",
                                                    "op": "upsert_topic",
                                                    "entity_kind": "topic",
                                                    "rationale": "needed",
                                                    "topic": {
                                                        "id": "vector-basis",
                                                        "title": "Vector basis",
                                                        "slug": "vector-basis",
                                                        "resources": [
                                                            {
                                                                "label": "Lesson",
                                                                "url": "https://example.com/basis",
                                                            }
                                                        ],
                                                    },
                                                },
                                                {
                                                    "op_id": "edge_1",
                                                    "op": "upsert_edge",
                                                    "entity_kind": "edge",
                                                    "rationale": "vector basis builds on functions",
                                                    "edge": {
                                                        "id": "edge-functions-vector-basis",
                                                        "source_topic_id": "functions",
                                                        "target_topic_id": "vector-basis",
                                                        "relation": "requires",
                                                    },
                                                },
                                            ],
                                        }
                                    )
                                )
                            ]
                        )
                    )
                ],
                usage_metadata=None,
            )
        )

        result = planner.generate_proposal(
            self.graph,
            ProposalGenerateRequest(mode="expand_goal", raw_text="- vector basis"),
        )

        self.assertEqual(result.display.summary, "1 topic, 1 edge")
        self.assertEqual(result.proposal_envelope.operations[0].topic.resources[0].id, "vector-basis_res_1")

    def test_generate_content_uses_response_schema_and_selected_model(self) -> None:
        planner = self._planner_with_responses(self._valid_expand_response())

        planner.generate_proposal(
            self.graph,
            ProposalGenerateRequest(mode="expand_goal", raw_text="- exponential function", model="gemini-3-flash-preview"),
        )

        kwargs = planner._client.models.last_kwargs or {}
        self.assertEqual(kwargs.get("model"), "gemini-3-flash-preview")
        cfg = kwargs.get("config")
        dumped = cfg.model_dump(exclude_none=True) if hasattr(cfg, "model_dump") else {}
        self.assertEqual(dumped.get("response_mime_type"), "application/json")
        self.assertEqual(dumped.get("max_output_tokens"), planner._settings.planner_max_output_tokens)
        self.assertIn("response_schema", dumped)
        self.assertNotIn("response_json_schema", dumped)

    def test_stream_proposal_emits_status_delta_and_result(self) -> None:
        planner = self._planner_with_responses(
            [
                SimpleNamespace(
                    text='{"summary":"1 topic',
                    candidates=[SimpleNamespace(finish_reason=None)],
                    usage_metadata=None,
                ),
                SimpleNamespace(
                    text='{"summary":"1 topic, 1 edge","assistant_message":"ok","operations":[{"op_id":"topic_1","op":"upsert_topic","entity_kind":"topic","rationale":"needed","topic":{"id":"linear-equations","title":"Linear equations","slug":"linear-equations"}},{"op_id":"edge_1","op":"upsert_edge","entity_kind":"edge","rationale":"linear equations depend on algebra basics","edge":{"id":"edge-algebra-linear","source_topic_id":"algebra-basics","target_topic_id":"linear-equations","relation":"requires"}}]}',
                    candidates=[SimpleNamespace(finish_reason="STOP")],
                    usage_metadata={"total_token_count": 123},
                ),
            ]
        )

        events = list(
            planner.stream_proposal(
                self.graph,
                ProposalGenerateRequest(mode="ingest_topics", raw_text="- Linear equations"),
            )
        )

        self.assertEqual(events[0]["type"], "status")
        self.assertTrue(any(event["type"] == "delta" for event in events))
        self.assertEqual(events[-1]["type"], "result")
        result = events[-1]["result"]
        self.assertEqual(result["display"]["summary"], "1 topic, 1 edge")

    def test_prompt_includes_factual_source_context_without_scope_heuristics(self) -> None:
        planner = self._planner_with_responses(self._valid_expand_response())

        planner.generate_proposal(
            self.graph,
            ProposalGenerateRequest(
                mode="expand_goal",
                raw_text="- Transformers\n\n- Cybersecurity foundations",
                target_goal="Transformers and cybersecurity foundations",
            ),
        )

        prompt = planner._client.models.last_kwargs["contents"]
        cfg = planner._client.models.last_kwargs["config"]
        dumped = cfg.model_dump(exclude_none=True) if hasattr(cfg, "model_dump") else {}
        system_instruction = dumped.get("system_instruction", "")
        self.assertIn('"source_item_count": 2', prompt)
        self.assertIn('"graph_is_empty": false', prompt)
        self.assertNotIn("expected_min_topics", prompt)
        self.assertIn("study plan, not a semester outline", system_instruction)
        self.assertIn("concrete study unit", prompt)
        self.assertIn("Do not remove topics or edges", system_instruction)
        self.assertIn("every new branch must attach back into the existing graph", system_instruction)
        self.assertIn("connectivity_execution_policy", prompt)
        self.assertNotIn("remove_topic", prompt)

    def test_source_items_are_included_in_prompt_and_response_metadata(self) -> None:
        planner = self._planner_with_responses(self._valid_expand_response())

        result = planner.generate_proposal(
            self.graph,
            ProposalGenerateRequest(
                mode="ingest_topics",
                raw_text="",
                source_items=[
                    {
                        "title": "Probability basics",
                        "description": "Discrete probability starter",
                        "estimated_minutes": 90,
                        "testing_notes": "Simple exercises",
                        "links": [{"label": "Course", "url": "https://example.com/probability"}],
                    },
                    {
                        "title": "Random variables",
                        "description": "Expectation and variance",
                        "estimated_minutes": 120,
                        "testing_notes": "Short quiz",
                        "links": [],
                    },
                ],
            ),
        )

        prompt = planner._client.models.last_kwargs["contents"]
        self.assertIn('"source_item_count": 2', prompt)
        self.assertIn('"source_items": [{"title": "Probability basics"', prompt)
        self.assertEqual(result.trace.source_item_count, 2)
        self.assertEqual(len(result.proposal_envelope.source_bundle.source_items), 2)
        self.assertEqual(result.proposal_envelope.source_bundle.source_items[0].title, "Probability basics")

    def test_prompt_includes_selected_topic_attachment_context(self) -> None:
        planner = self._planner_with_responses(self._valid_expand_response())

        planner.generate_proposal(
            self.graph,
            ProposalGenerateRequest(
                mode="expand_goal",
                raw_text="- transformers",
                selected_topic_id="functions",
            ),
        )

        prompt = planner._client.models.last_kwargs["contents"]
        self.assertIn('"selected_topic": {"id": "functions"', prompt)
        self.assertIn('"attach_near_selected_topic": true', prompt)


if __name__ == "__main__":
    unittest.main()
