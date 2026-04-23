from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from app.core.config import Settings
from app.services.quiz_service import QuizGenerationError, QuizService
from app.services.repository import GraphRepository


class QuizServiceTests(unittest.TestCase):
    DEMO_GRAPH_ID = "mathematics-demo"

    def setUp(self) -> None:
        settings = Settings()
        settings.gemini_api_key = None
        self.quiz_service = QuizService(settings)

    def _install_provider_stub(self) -> None:
        class ProviderStub:
            @staticmethod
            def generate_structured(**kwargs):  # noqa: ANN003, ANN201
                question_count = int(kwargs["schema_name"] == "quiz_question_set_draft" and 6)
                questions = [
                    {
                        "prompt": f"Question {index + 1}?",
                        "choices": [f"A{index}", f"B{index}", f"C{index}", f"D{index}"],
                        "correct_choice_index": 0,
                        "explanation": f"Explanation {index + 1}",
                    }
                    for index in range(question_count)
                ]
                return SimpleNamespace(
                    parsed=kwargs["schema"].model_validate({"questions": questions}),
                    usage=None,
                )

        self.quiz_service._provider = ProviderStub()  # type: ignore[attr-defined]

    def test_closure_status_blocks_unfinished_prerequisites(self) -> None:
        repository = self._repository()
        graph = repository.graph(self.DEMO_GRAPH_ID)

        status = self.quiz_service.build_closure_status(graph, "embeddings")

        self.assertIn("linear-algebra", status.prerequisite_topic_ids)
        self.assertNotIn("vectors-geometry", status.prerequisite_topic_ids)
        self.assertNotIn("circles", status.prerequisite_topic_ids)
        self.assertFalse(status.can_award_completion)
        self.assertIn("linear-algebra", status.blocked_prerequisite_ids)

    def test_quiz_attempt_awards_state_only_when_prerequisites_closed(self) -> None:
        repository = self._repository()
        graph = repository.graph(self.DEMO_GRAPH_ID)
        self._install_provider_stub()

        for topic in graph.topics:
            if topic.id in {"arithmetics", "angles", "algebra-basics", "triangles", "functions", "circles", "vectors-geometry", "linear-algebra"}:
                topic.state = "solid"
        session = self.quiz_service.start_session(graph, "embeddings", 6)
        answers = {question.id: question.correct_choice_index for question in session.questions}
        attempt, _, awarded_state, _ = self.quiz_service.grade_session(graph, session, answers)

        repository.record_quiz_attempt(self.DEMO_GRAPH_ID, attempt, awarded_state)
        updated = repository.graph(self.DEMO_GRAPH_ID)
        embeddings = next(topic for topic in updated.topics if topic.id == "embeddings")

        self.assertEqual(embeddings.state, "solid")
        self.assertEqual(len(updated.quiz_attempts), 1)
        self.assertTrue(updated.quiz_attempts[0].closure_awarded)

    def test_start_session_blocks_topics_with_open_prerequisites(self) -> None:
        repository = self._repository()
        graph = repository.graph(self.DEMO_GRAPH_ID)

        with self.assertRaises(ValueError) as context:
            self.quiz_service.start_session(graph, "embeddings", 6)

        self.assertIn("close prerequisite topics first", str(context.exception))

    def test_failed_attempt_marks_topic_for_review(self) -> None:
        repository = self._repository()
        graph = repository.graph(self.DEMO_GRAPH_ID)
        self._install_provider_stub()
        session = self.quiz_service.start_session(graph, "arithmetics", 6)
        wrong_answers = {question.id: (question.correct_choice_index + 1) % len(question.choices) for question in session.questions}
        attempt, _, awarded_state, reviews = self.quiz_service.grade_session(graph, session, wrong_answers)

        repository.record_quiz_attempt(self.DEMO_GRAPH_ID, attempt, awarded_state)
        updated = repository.graph(self.DEMO_GRAPH_ID)
        arithmetics = next(topic for topic in updated.topics if topic.id == "arithmetics")

        self.assertEqual(arithmetics.state, "needs_review")
        self.assertFalse(updated.quiz_attempts[0].passed)
        self.assertEqual(len(reviews), 6)
        self.assertTrue(all(review.correct_choice for review in reviews))

    def test_without_api_key_quiz_generation_fails_closed(self) -> None:
        repository = self._repository()
        graph = repository.graph(self.DEMO_GRAPH_ID)

        with self.assertRaises(ValueError) as context:
            self.quiz_service.start_session(graph, "arithmetics", 6)

        self.assertIn("missing AI provider", str(context.exception))

    def test_provider_failure_surfaces_quiz_generation_error_with_diagnostics(self) -> None:
        repository = self._repository()
        graph = repository.graph(self.DEMO_GRAPH_ID)

        class ProviderStub:
            @staticmethod
            def generate_structured(**kwargs):  # noqa: ANN003, ANN201
                raise RuntimeError("socket closed")

        self.quiz_service._provider = ProviderStub()  # type: ignore[attr-defined]

        with self.assertRaises(QuizGenerationError) as context:
            self.quiz_service.start_session(graph, "arithmetics", 6)

        self.assertIn("unexpected provider error", str(context.exception))
        self.assertEqual(context.exception.diagnostics["topic_id"], "arithmetics")
        self.assertEqual(context.exception.diagnostics["graph_id"], self.DEMO_GRAPH_ID)

    def _repository(self) -> GraphRepository:
        tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(tempdir.cleanup)
        return GraphRepository(Path(tempdir.name) / "state.sqlite3")


if __name__ == "__main__":
    unittest.main()
