from __future__ import annotations

import unittest

from pydantic import ValidationError

from app.llm.contracts import render_action_contract, render_quiz_contract
from app.llm.prompt_templates import (
    orchestrator_system_instruction,
    planner_system_instruction,
    quiz_system_instruction,
    study_assistant_system_instruction,
)
from app.llm.schemas import GeminiProposalDraft, InlineQuizDraft, ProposalEdgeDraft, QuizQuestionSetDraft, planner_response_json_schema


class LLMContractTests(unittest.TestCase):
    def test_orchestrator_action_contract_mentions_all_runtime_paths(self) -> None:
        contract = render_action_contract("runtime")

        self.assertIn("answer", contract)
        self.assertIn("propose_ingest", contract)
        self.assertIn("propose_expand", contract)
        self.assertIn("quiz_closure", contract)
        self.assertIn("mark_finished", contract)
        self.assertIn("rollback", contract)

    def test_quiz_contract_shape_rejects_wrong_choice_count(self) -> None:
        with self.assertRaises(ValidationError):
            QuizQuestionSetDraft.model_validate(
                {
                    "questions": [
                        {
                            "prompt": "Which topic comes first?",
                            "choices": ["A", "B", "C"],
                            "correct_choice_index": 0,
                            "explanation": "A is first.",
                        }
                    ]
                }
            )

    def test_inline_quiz_contract_validates_distinct_choices(self) -> None:
        with self.assertRaises(ValidationError):
            InlineQuizDraft.model_validate(
                {
                    "question": "Pick the correct answer",
                    "choices": ["A", "A", "B", "C"],
                    "correct_index": 0,
                }
            )

    def test_quiz_contract_text_mentions_structured_shape(self) -> None:
        contract = render_quiz_contract()

        self.assertIn("inline_quiz", contract)
        self.assertIn("QuizQuestionSetDraft", contract)

    def test_planner_schema_does_not_expose_operation_status_to_llm(self) -> None:
        schema = planner_response_json_schema()
        operation_properties = schema["properties"]["operations"]["items"]["properties"]

        self.assertNotIn("status", operation_properties)
        zone_properties = operation_properties["zone"]["properties"]
        self.assertNotIn("color", zone_properties)
        self.assertNotIn("intensity", zone_properties)

    def test_gemini_proposal_draft_schema_avoids_additional_properties_maps(self) -> None:
        schema = GeminiProposalDraft.model_json_schema()

        schema_text = str(schema)
        self.assertNotIn("'additionalProperties': True", schema_text)
        self.assertNotIn('"additionalProperties": true', schema_text)

    def test_proposal_edge_draft_rejects_unknown_relation_literal(self) -> None:
        with self.assertRaises(ValidationError):
            ProposalEdgeDraft.model_validate(
                {
                    "id": "edge-functions-linear",
                    "source_topic_id": "functions",
                    "target_topic_id": "linear-equations",
                    "relation": "prerequisite",
                    "rationale": "bad synonym",
                    "weight": 1.0,
                }
            )

    def test_math_formatting_rules_are_injected_into_model_roles(self) -> None:
        planner = planner_system_instruction()
        orchestrator = orchestrator_system_instruction(language_name="English", persona_rules="", use_grounding=False)
        assistant = study_assistant_system_instruction(language_name="English", persona_rules="", use_grounding=False)
        quiz = quiz_system_instruction(language_name="English")

        for prompt in (planner, orchestrator, assistant, quiz):
            self.assertIn("MATH FORMATTING RULES:", prompt)
            self.assertIn("KaTeX-compatible LaTeX", prompt)
            self.assertIn("Use $...$ for inline formulas", prompt)


if __name__ == "__main__":
    unittest.main()
