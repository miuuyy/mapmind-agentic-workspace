from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, model_validator

from app.llm.contracts import INLINE_QUIZ_CHOICE_COUNT, OrchestratorAction
from app.models.domain import EdgeRelation, ProposalOpenQuestion


class ProposalResourceDraft(BaseModel):
    id: str | None = None
    label: str
    url: str
    kind: str = "reference"


class ProposalTopicDraft(BaseModel):
    id: str
    title: str
    slug: str
    description: str = ""
    difficulty: float = 0.0
    estimated_minutes: int = 0
    level: int = 0
    state: str = "not_started"
    zones: list[str] = Field(default_factory=list)
    resources: list[ProposalResourceDraft] = Field(default_factory=list)


class ProposalEdgeDraft(BaseModel):
    id: str
    source_topic_id: str
    target_topic_id: str
    relation: EdgeRelation = "requires"
    rationale: str = ""
    weight: float = 1.0


class ProposalZoneDraft(BaseModel):
    id: str
    title: str
    kind: str
    topic_ids: list[str] = Field(default_factory=list)


class GraphOperationDraft(BaseModel):
    op_id: str
    op: str
    entity_kind: str
    depends_on: list[str] = Field(default_factory=list)
    rationale: str = ""
    topic_id: str | None = None
    edge_id: str | None = None
    zone_id: str | None = None
    state: str | None = None
    topic: ProposalTopicDraft | None = None
    edge: ProposalEdgeDraft | None = None
    zone: ProposalZoneDraft | None = None


class GeminiProposalDraft(BaseModel):
    summary: str = ""
    assistant_message: str = Field(
        default="",
        description="A message explaining the proposal. Format with standard single unescaped newlines. DO NOT output literal double-escaped '\\n' strings."
    )
    assumptions: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    open_questions: list[ProposalOpenQuestion] = Field(default_factory=list)
    operations: list[GraphOperationDraft] = Field(default_factory=list)


class InlineQuizDraft(BaseModel):
    question: str
    choices: list[str]
    correct_index: int

    @model_validator(mode="after")
    def _validate_shape(self) -> "InlineQuizDraft":
        if len(self.choices) != INLINE_QUIZ_CHOICE_COUNT:
            raise ValueError(f"inline quiz must contain exactly {INLINE_QUIZ_CHOICE_COUNT} choices")
        if len(set(self.choices)) != INLINE_QUIZ_CHOICE_COUNT:
            raise ValueError("inline quiz choices must be distinct")
        if self.correct_index < 0 or self.correct_index >= INLINE_QUIZ_CHOICE_COUNT:
            raise ValueError("inline quiz correct_index is out of range")
        return self


class OrchestratorDecision(BaseModel):
    action: OrchestratorAction = "answer"
    reply_message: str = Field(
        default="",
        description="The assistant's natural language reply. Format paragraphs with standard single unescaped newlines. DO NOT output literal double-escaped '\\n' strings."
    )
    proposal_target_goal: str = ""
    proposal_raw_text: str = ""
    proposal_instructions: str = ""
    inline_quiz: InlineQuizDraft | None = None

    @model_validator(mode="after")
    def _validate_action_payload_consistency(self) -> "OrchestratorDecision":
        if self.action != "answer" and self.inline_quiz is not None:
            raise ValueError("inline_quiz is only allowed when action is 'answer'")
        return self


class QuizQuestionDraft(BaseModel):
    prompt: str
    choices: list[str]
    correct_choice_index: int
    explanation: str = ""

    @model_validator(mode="after")
    def _validate_shape(self) -> "QuizQuestionDraft":
        if len(self.choices) != INLINE_QUIZ_CHOICE_COUNT:
            raise ValueError(f"quiz question must contain exactly {INLINE_QUIZ_CHOICE_COUNT} choices")
        if len(set(self.choices)) != INLINE_QUIZ_CHOICE_COUNT:
            raise ValueError("quiz question choices must be distinct")
        if self.correct_choice_index < 0 or self.correct_choice_index >= INLINE_QUIZ_CHOICE_COUNT:
            raise ValueError("quiz question correct_choice_index is out of range")
        return self


class QuizQuestionSetDraft(BaseModel):
    questions: list[QuizQuestionDraft] = Field(default_factory=list)


def planner_response_json_schema() -> dict[str, Any]:
    state_enum = ["not_started", "learning", "shaky", "solid", "mastered", "needs_review"]
    relation_enum = ["requires", "supports", "bridges", "extends", "reviews"]
    op_enum = ["upsert_topic", "upsert_edge", "upsert_zone", "set_mastery"]
    return {
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "assistant_message": {"type": "string"},
            "assumptions": {"type": "array", "items": {"type": "string"}},
            "warnings": {"type": "array", "items": {"type": "string"}},
            "open_questions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "kind": {"type": "string"},
                        "message": {"type": "string"},
                        "impact": {"type": "string", "enum": ["low", "medium", "high"]},
                        "suggested_resolution": {"type": "string"},
                    },
                    "required": ["id", "kind", "message"],
                    "additionalProperties": False,
                },
            },
            "operations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "op_id": {"type": "string"},
                        "op": {"type": "string", "enum": op_enum},
                        "entity_kind": {"type": "string", "enum": ["topic", "edge", "zone", "mastery"]},
                        "rationale": {"type": "string"},
                        "topic": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string"},
                                "title": {"type": "string"},
                                "slug": {"type": "string"},
                                "description": {"type": "string"},
                                "difficulty": {"type": "number"},
                                "estimated_minutes": {"type": "integer"},
                                "level": {"type": "integer"},
                                "state": {"type": "string", "enum": state_enum},
                                "zones": {"type": "array", "items": {"type": "string"}},
                                "resources": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "id": {"type": "string"},
                                            "label": {"type": "string"},
                                            "url": {"type": "string"},
                                            "kind": {"type": "string"},
                                        },
                                        "required": ["id", "label", "url"],
                                        "additionalProperties": False,
                                    },
                                },
                            },
                            "required": ["id", "title", "slug", "description", "difficulty", "estimated_minutes", "level", "state", "zones", "resources"],
                            "additionalProperties": False,
                        },
                        "edge": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string"},
                                "source_topic_id": {"type": "string"},
                                "target_topic_id": {"type": "string"},
                                "relation": {"type": "string", "enum": relation_enum},
                                "rationale": {"type": "string"},
                                "weight": {"type": "number"},
                            },
                            "required": ["id", "source_topic_id", "target_topic_id", "relation", "rationale", "weight"],
                            "additionalProperties": False,
                        },
                        "zone": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string"},
                                "title": {"type": "string"},
                                "kind": {"type": "string"},
                                "topic_ids": {"type": "array", "items": {"type": "string"}},
                            },
                            "required": ["id", "title", "kind", "topic_ids"],
                            "additionalProperties": False,
                        },
                        "topic_id": {"type": "string"},
                        "edge_id": {"type": "string"},
                        "zone_id": {"type": "string"},
                        "state": {"type": "string", "enum": state_enum},
                        "depends_on": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["op_id", "op", "entity_kind", "rationale"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["summary", "assistant_message", "assumptions", "warnings", "open_questions", "operations"],
        "additionalProperties": False,
    }
