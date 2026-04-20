from __future__ import annotations

import json
from types import SimpleNamespace
import unittest

from app.llm.base import LLMProviderError, LLMStructuredResponse, LLMStructuredStreamChunk
from app.models.domain import ProposalGenerateRequest
from app.services.bootstrap import build_seed_workspace
from app.services.proposal_planner import ProposalPlanner, ProposalPlannerError
from app.services.proposal_normalizer import ProposalNormalizer


class _ProviderStub:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = 0
        self.last_kwargs = None

    def generate_structured(self, **kwargs):
        self.calls += 1
        self.last_kwargs = kwargs
        if not self._responses:
            raise AssertionError("no fake responses left")
        response = self._responses.pop(0)
        if isinstance(response, Exception):
            raise response
        if isinstance(response, LLMStructuredResponse):
            return response
        if isinstance(response, dict):
            parsed = kwargs["schema"].model_validate(response)
            return LLMStructuredResponse(
                text=json.dumps(response),
                parsed=parsed,
                usage=None,
                finish_reason=None,
            )
        raise AssertionError(f"unsupported stub response: {type(response)!r}")

    def stream_structured(self, **kwargs):
        self.calls += 1
        self.last_kwargs = kwargs
        if not self._responses:
            raise AssertionError("no fake responses left")
        response = self._responses.pop(0)
        if isinstance(response, list):
            return iter(response)
        return iter([response])


class ProposalPlannerRuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.graph = next(graph for graph in build_seed_workspace().graphs if graph.graph_id == "mathematics-demo")

    def _planner_with_responses(self, *responses):
        planner = ProposalPlanner.__new__(ProposalPlanner)
        planner._settings = SimpleNamespace(default_model="gemini-3-pro-preview", planner_max_output_tokens=200000)
        planner._provider = _ProviderStub(responses)
        planner._normalizer = ProposalNormalizer()
        return planner

    def _valid_expand_response(self):
        return {
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

        self.assertEqual(planner._provider.calls, 1)
        self.assertEqual(result.display.summary, "1 topic, 1 edge")

    def test_invalid_json_surfaces_without_retry_or_repair(self) -> None:
        planner = self._planner_with_responses(
            LLMProviderError("provider returned invalid JSON")
        )

        with self.assertRaisesRegex(ProposalPlannerError, "invalid JSON"):
            planner.generate_proposal(
                self.graph,
                ProposalGenerateRequest(mode="ingest_topics", raw_text="- arithmetic"),
            )

        self.assertEqual(planner._provider.calls, 1)

    def test_max_tokens_truncation_surfaces_explicit_transport_error(self) -> None:
        planner = self._planner_with_responses(
            LLMProviderError("Gemini proposal hit the output token limit (200000) before closing JSON")
        )

        with self.assertRaisesRegex(ProposalPlannerError, "output token limit"):
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

    def test_generated_resources_receive_stable_ids(self) -> None:
        planner = self._planner_with_responses(
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

        kwargs = planner._provider.last_kwargs or {}
        self.assertEqual(kwargs.get("model"), "gemini-3-flash-preview")
        self.assertEqual(kwargs.get("schema_name"), "graph_proposal_draft")
        self.assertIsNotNone(kwargs.get("response_json_schema"))
        self.assertEqual(kwargs.get("max_output_tokens"), planner._settings.planner_max_output_tokens)
        self.assertEqual(kwargs.get("temperature"), 0.0)

    def test_system_instruction_explicitly_forbids_prerequisite_relation_synonym(self) -> None:
        planner = self._planner_with_responses()

        instruction = planner._build_system_instruction()

        self.assertIn('edge.relation MUST be exactly one of "requires", "supports", "bridges", "extends", or "reviews"', instruction)
        self.assertIn('Never output "prerequisite"', instruction)

    def test_system_instruction_requires_upsert_zone_for_new_topic_zone_ids(self) -> None:
        planner = self._planner_with_responses()

        instruction = planner._build_system_instruction()
        prompt = planner._build_prompt(
            self.graph,
            ProposalGenerateRequest(mode="expand_goal", raw_text="- neurobiology major"),
            sanitized_raw_text="- neurobiology major",
        )

        self.assertIn("If any topic.zones entry uses a zone id that does not already exist in the graph, you MUST include an upsert_zone", instruction)
        self.assertIn("if topic.zones references a new zone id, include an upsert_zone for that exact id in the same proposal", prompt)

    def test_generate_proposal_auto_creates_missing_zone_from_topic_references(self) -> None:
        planner = self._planner_with_responses(
            {
                "summary": "Expanded biology",
                "assistant_message": "Added one molecular biology topic.",
                "operations": [
                    {
                        "op_id": "topic_1",
                        "op": "upsert_topic",
                        "entity_kind": "topic",
                        "rationale": "needed",
                        "topic": {
                            "id": "bio-mol-dna-repair",
                            "title": "DNA Repair",
                            "slug": "dna-repair",
                            "zones": ["genetics-molecular"],
                        },
                    },
                    {
                        "op_id": "edge_1",
                        "op": "upsert_edge",
                        "entity_kind": "edge",
                        "rationale": "connect to existing graph",
                        "edge": {
                            "id": "edge-functions-dna-repair",
                            "source_topic_id": "functions",
                            "target_topic_id": "bio-mol-dna-repair",
                            "relation": "requires",
                        },
                    },
                ],
            }
        )

        result = planner.generate_proposal(
            self.graph,
            ProposalGenerateRequest(mode="expand_goal", raw_text="- dna repair"),
        )

        zone_operations = [
            operation for operation in result.proposal_envelope.operations
            if operation.op == "upsert_zone" and operation.zone is not None
        ]
        self.assertTrue(any(operation.zone.id == "genetics-molecular" for operation in zone_operations))
        created_zone = next(operation.zone for operation in zone_operations if operation.zone.id == "genetics-molecular")
        self.assertEqual(created_zone.topic_ids, ["bio-mol-dna-repair"])
        self.assertTrue(
            any(
                "mentioned a new zone (genetics-molecular)" in warning
                for warning in result.proposal_envelope.warnings
            )
        )

    def test_stream_proposal_emits_status_delta_and_result(self) -> None:
        planner = self._planner_with_responses(
            [
                LLMStructuredStreamChunk(
                    text='{"summary":"1 topic',
                    finish_reason=None,
                ),
                LLMStructuredStreamChunk(
                    text='{"summary":"1 topic, 1 edge","assistant_message":"ok","operations":[{"op_id":"topic_1","op":"upsert_topic","entity_kind":"topic","rationale":"needed","topic":{"id":"linear-equations","title":"Linear equations","slug":"linear-equations"}},{"op_id":"edge_1","op":"upsert_edge","entity_kind":"edge","rationale":"linear equations depend on algebra basics","edge":{"id":"edge-algebra-linear","source_topic_id":"algebra-basics","target_topic_id":"linear-equations","relation":"requires"}}]}',
                    usage={"total_token_count": 123},
                    finish_reason="STOP",
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

        prompt = planner._provider.last_kwargs["prompt"]
        system_instruction = planner._provider.last_kwargs["system_instruction"]
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

        prompt = planner._provider.last_kwargs["prompt"]
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

        prompt = planner._provider.last_kwargs["prompt"]
        self.assertIn('"selected_topic": {"id": "functions"', prompt)
        self.assertIn('"attach_near_selected_topic": true', prompt)


if __name__ == "__main__":
    unittest.main()
