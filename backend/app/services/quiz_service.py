from __future__ import annotations
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from app.core.config import Settings
from app.llm import LLMProviderError, build_llm_provider
from app.llm.prompt_templates import quiz_system_instruction
from app.llm.contracts import QUIZ_DRAFT_SHAPE_NAME
from app.llm.schemas import QuizQuestionSetDraft
from app.models.domain import (
    QuizAttempt,
    QuizQuestion,
    QuizQuestionReview,
    StudyGraph,
    Topic,
    TopicClosureStatus,
    TopicQuizSession,
)

if TYPE_CHECKING:
    from google import genai as genai_module


def is_prerequisite_relation(relation: str) -> bool:
    return relation == "requires"


class QuizService:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._provider = build_llm_provider(settings)
        self._client: genai_module.Client | None = getattr(self._provider, "_client", None)
        self._types: Any | None = getattr(self._provider, "_types", None)

    def build_closure_status(self, graph: StudyGraph, topic_id: str) -> TopicClosureStatus:
        topic_map = {topic.id: topic for topic in graph.topics}
        topic = topic_map.get(topic_id)
        if topic is None:
            raise KeyError(topic_id)

        parent_map: dict[str, list[str]] = {item.id: [] for item in graph.topics}
        for edge in graph.edges:
            if not is_prerequisite_relation(edge.relation):
                continue
            parent_map.setdefault(edge.target_topic_id, []).append(edge.source_topic_id)

        prerequisite_ids: list[str] = []
        seen: set[str] = set()
        stack = list(parent_map.get(topic_id, []))
        while stack:
            current = stack.pop()
            if current in seen:
                continue
            seen.add(current)
            prerequisite_ids.append(current)
            stack.extend(parent_map.get(current, []))

        blocked_ids = [
            prerequisite_id
            for prerequisite_id in prerequisite_ids
            if topic_map[prerequisite_id].state not in {"solid", "mastered"}
        ]
        latest_attempt = None
        for attempt in graph.quiz_attempts:
            if attempt.topic_id == topic_id:
                latest_attempt = attempt

        return TopicClosureStatus(
            topic_id=topic.id,
            prerequisite_topic_ids=prerequisite_ids,
            blocked_prerequisite_ids=blocked_ids,
            can_award_completion=len(blocked_ids) == 0,
            latest_attempt=latest_attempt,
        )

    def start_session(self, graph: StudyGraph, topic_id: str, question_count: int, model: str | None = None) -> TopicQuizSession:
        topic_map = {topic.id: topic for topic in graph.topics}
        topic = topic_map.get(topic_id)
        if topic is None:
            raise KeyError(topic_id)
        if question_count < 6 or question_count > 12:
            raise ValueError("question_count must be between 6 and 12")

        closure = self.build_closure_status(graph, topic_id)
        if not closure.can_award_completion:
            blocked_titles = [topic_map[item_id].title for item_id in closure.blocked_prerequisite_ids if item_id in topic_map]
            detail = ", ".join(blocked_titles[:6]) or "open prerequisites"
            raise ValueError(f"close prerequisite topics first: {detail}")
        questions, generator = self._generate_questions(graph, topic, closure, question_count, model=model)
        return TopicQuizSession(
            session_id=f"quiz_{uuid4().hex[:12]}",
            graph_id=graph.graph_id,
            topic_id=topic_id,
            question_count=len(questions),
            questions=questions,
            closure_status=closure,
            generator=generator,
        )

    def grade_session(
        self,
        graph: StudyGraph,
        session: TopicQuizSession,
        answers: dict[str, int],
        *,
        pass_threshold: float | None = None,
    ) -> tuple[QuizAttempt, TopicClosureStatus, str | None, list[QuizQuestionReview]]:
        correct_count = 0
        reviews: list[QuizQuestionReview] = []
        for question in session.questions:
            selected_index = answers.get(question.id)
            was_correct = selected_index == question.correct_choice_index
            if was_correct:
                correct_count += 1
            reviews.append(
                QuizQuestionReview(
                    question_id=question.id,
                    prompt=question.prompt,
                    selected_choice=question.choices[selected_index] if selected_index is not None and 0 <= selected_index < len(question.choices) else None,
                    correct_choice=question.choices[question.correct_choice_index],
                    was_correct=was_correct,
                    explanation=question.explanation,
                )
            )
        score = correct_count / max(1, len(session.questions))
        closure = self.build_closure_status(graph, session.topic_id)
        passed = score >= (pass_threshold if pass_threshold is not None else topic_pass_threshold(graph, session.topic_id))
        closure_awarded = passed and closure.can_award_completion
        awarded_state = "solid" if closure_awarded else ("needs_review" if not passed else None)
        missed = [r.prompt for r in reviews if not r.was_correct]
        previous_fails = sum(1 for a in graph.quiz_attempts if a.topic_id == session.topic_id and not a.passed)
        attempt = QuizAttempt(
            id=f"attempt_{uuid4().hex[:12]}",
            topic_id=session.topic_id,
            passed=passed,
            score=score,
            question_count=len(session.questions),
            closure_awarded=closure_awarded,
            missed_questions=missed,
            fail_count=previous_fails + (0 if passed else 1),
        )
        return attempt, closure, awarded_state, reviews

    def _generate_questions(
        self,
        graph: StudyGraph,
        topic: Topic,
        closure: TopicClosureStatus,
        question_count: int,
        *,
        model: str | None,
    ) -> tuple[list[QuizQuestion], str]:
        if self._provider is None:
            raise ValueError("closure quiz generation is unavailable: missing AI provider")
        questions = self._build_questions_with_ai(graph, topic, closure, question_count, model=model)
        if not questions:
            raise ValueError("closure quiz generation failed: provider returned no valid questions")
        return questions, model or self._settings.default_model

    def _build_questions_with_ai(
        self,
        graph: StudyGraph,
        topic: Topic,
        closure: TopicClosureStatus,
        question_count: int,
        *,
        model: str | None,
    ) -> list[QuizQuestion] | None:
        if self._provider is None:
            return None
        topic_map = {item.id: item for item in graph.topics}
        parent_ids = [
            edge.source_topic_id
            for edge in graph.edges
            if edge.target_topic_id == topic.id and is_prerequisite_relation(edge.relation)
        ]
        child_ids = [edge.target_topic_id for edge in graph.edges if edge.source_topic_id == topic.id]
        zone_titles = [zone.title for zone in graph.zones if zone.id in topic.zones]
        prompt = {
            "task": "Generate a closure quiz for one study-graph topic.",
            "requirements": {
                "language": self._language_name(graph.language),
                "question_count": question_count,
                "shape": QUIZ_DRAFT_SHAPE_NAME,
                "rules": [
                    "Each question must have exactly 4 unique choices.",
                    "Use only one correct choice.",
                    "Prefer conceptual, structural, and dependency-aware questions.",
                    "Avoid trivial identity questions unless the graph context is too sparse.",
                    "Use the current roadmap state and prerequisite structure.",
                    "Explanations must be concise and useful for review.",
                ],
            },
            "topic": {
                "id": topic.id,
                "title": topic.title,
                "description": topic.description,
                "level": topic.level,
                "estimated_minutes": topic.estimated_minutes,
                "zones": zone_titles,
            },
            "closure": {
                "blocked_prerequisite_titles": [topic_map[item_id].title for item_id in closure.blocked_prerequisite_ids],
                "direct_prerequisite_titles": [topic_map[item_id].title for item_id in parent_ids],
                "direct_unlock_titles": [topic_map[item_id].title for item_id in child_ids],
            },
            "graph_context": {
                "topic_titles": [item.title for item in graph.topics],
                "zone_titles": [zone.title for zone in graph.zones],
            },
        }
        try:
            response = self._provider.generate_structured(
                model=model or self._settings.default_model,
                prompt=str(prompt),
                system_instruction=quiz_system_instruction(language_name=self._language_name(graph.language)),
                schema=QuizQuestionSetDraft,
                schema_name="quiz_question_set_draft",
                max_output_tokens=int(self._settings.quiz_max_output_tokens),
                temperature=0.3,
                use_grounding=False,
            )
            question_set = response.parsed
            questions = self._validate_ai_questions(
                [
                    QuizQuestion(
                        id=f"quiz_{uuid4().hex[:8]}",
                        prompt=item.prompt,
                        choices=list(item.choices),
                        correct_choice_index=item.correct_choice_index,
                        explanation=item.explanation,
                    )
                    for item in question_set.questions
                ],
                question_count,
            )
            return questions or None
        except (LLMProviderError, Exception):
            return None

    def _language_name(self, language: str) -> str:
        return {"en": "English", "uk": "Ukrainian", "ru": "Russian"}.get(language, "English")

    def _validate_ai_questions(self, questions: list[QuizQuestion], question_count: int) -> list[QuizQuestion]:
        valid: list[QuizQuestion] = []
        seen_prompts: set[str] = set()
        for question in questions:
            prompt_key = question.prompt.strip().lower()
            if prompt_key in seen_prompts:
                continue
            if len(question.choices) != 4:
                continue
            if len(set(question.choices)) != 4:
                continue
            if question.correct_choice_index < 0 or question.correct_choice_index >= len(question.choices):
                continue
            seen_prompts.add(prompt_key)
            valid.append(question)
            if len(valid) >= question_count:
                break
        return valid


def topic_pass_threshold(graph: StudyGraph, topic_id: str) -> float:
    for topic in graph.topics:
        if topic.id == topic_id:
            return topic.quiz_policy.pass_threshold
    return 0.75
