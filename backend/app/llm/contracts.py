from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


OrchestratorAction = Literal["answer", "propose_ingest", "propose_expand"]
AgentRuntimeAction = Literal["answer", "propose_ingest", "propose_expand", "quiz_closure", "mark_finished", "rollback"]

ORCHESTRATOR_ACTIONS: tuple[OrchestratorAction, ...] = ("answer", "propose_ingest", "propose_expand")
AGENT_RUNTIME_ACTIONS: tuple[AgentRuntimeAction, ...] = (
    "answer",
    "propose_ingest",
    "propose_expand",
    "quiz_closure",
    "mark_finished",
    "rollback",
)

INLINE_QUIZ_CHOICE_COUNT = 4
QUIZ_DRAFT_SHAPE_NAME = "QuizQuestionSetDraft"
QUIZ_ANSWER_HISTORY_TAG = "[QUIZ_ANSWER]"


@dataclass(frozen=True)
class AgentActionSpec:
    id: AgentRuntimeAction
    label: str
    summary: str
    mutates_workspace: bool
    requires_review: bool


ACTION_REGISTRY: dict[AgentRuntimeAction, AgentActionSpec] = {
    "answer": AgentActionSpec(
        id="answer",
        label="Answer",
        summary="Respond directly without mutating workspace state.",
        mutates_workspace=False,
        requires_review=False,
    ),
    "propose_ingest": AgentActionSpec(
        id="propose_ingest",
        label="Propose ingest",
        summary="Turn raw topic material into a reviewable graph proposal.",
        mutates_workspace=False,
        requires_review=True,
    ),
    "propose_expand": AgentActionSpec(
        id="propose_expand",
        label="Propose expand",
        summary="Extend the current graph toward a target through a reviewable proposal.",
        mutates_workspace=False,
        requires_review=True,
    ),
    "quiz_closure": AgentActionSpec(
        id="quiz_closure",
        label="Closure quiz",
        summary="Assess one topic with generated questions before awarding completion.",
        mutates_workspace=True,
        requires_review=False,
    ),
    "mark_finished": AgentActionSpec(
        id="mark_finished",
        label="Mark finished",
        summary="Close a topic manually without generating quiz questions.",
        mutates_workspace=True,
        requires_review=False,
    ),
    "rollback": AgentActionSpec(
        id="rollback",
        label="Rollback",
        summary="Restore an earlier workspace snapshot.",
        mutates_workspace=True,
        requires_review=False,
    ),
}


def render_action_contract(scope: Literal["orchestrator", "runtime"] = "runtime") -> str:
    allowed_ids = ORCHESTRATOR_ACTIONS if scope == "orchestrator" else AGENT_RUNTIME_ACTIONS
    lines = []
    for action_id in allowed_ids:
        action = ACTION_REGISTRY[action_id]
        review_text = "requires review" if action.requires_review else "no review gate"
        mutation_text = "mutates workspace" if action.mutates_workspace else "does not mutate workspace"
        lines.append(f"- {action.id}: {action.summary} ({mutation_text}; {review_text}).")
    return "\n".join(lines)


def render_quiz_contract() -> str:
    return (
        f"- If you emit an inline quiz, use the nested inline_quiz object.\n"
        f"- inline_quiz.question must be a single concrete question.\n"
        f"- inline_quiz.choices must contain exactly {INLINE_QUIZ_CHOICE_COUNT} distinct strings.\n"
        "- inline_quiz.correct_index must point to the correct choice.\n"
        f"- Quiz generation service uses the structured shape named {QUIZ_DRAFT_SHAPE_NAME}."
    )
