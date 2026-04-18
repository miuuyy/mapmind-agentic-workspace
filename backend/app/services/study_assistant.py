from __future__ import annotations

from app.core.config import Settings
from app.llm import LLMProviderError, build_llm_provider
from app.llm.prompt_templates import study_assistant_system_instruction
from app.models.domain import StudyAssistantRequest, StudyAssistantResponse, StudyGraph

class StudyAssistantError(RuntimeError):
    pass


class StudyAssistantService:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._provider = build_llm_provider(settings)

    def answer(self, graph: StudyGraph, request: StudyAssistantRequest, *, persona_rules: str = "") -> StudyAssistantResponse:
        model_name = request.model or self._settings.default_model
        if self._provider is None:
            raise StudyAssistantError("The selected AI provider is unavailable: missing API key")
        try:
            prompt = self._build_prompt(graph, request)
            language_name = self._language_name(graph.language)
            text = self._provider.generate_text(
                model=model_name,
                system_instruction=study_assistant_system_instruction(
                    language_name=language_name,
                    persona_rules=persona_rules,
                    use_grounding=request.use_grounding,
                ),
                prompt=prompt,
                max_output_tokens=int(self._settings.assistant_max_output_tokens),
                temperature=0.35,
                use_grounding=request.use_grounding,
            ).strip()
            if not text:
                raise StudyAssistantError("assistant generation returned empty response")
            return StudyAssistantResponse(message=text, model=model_name, fallback_used=False)
        except LLMProviderError as exc:
            raise StudyAssistantError(f"assistant generation failed: {exc}") from exc
        except StudyAssistantError:
            raise
        except Exception as exc:
            raise StudyAssistantError(f"assistant generation failed: {exc}") from exc

    def _build_prompt(self, graph: StudyGraph, request: StudyAssistantRequest) -> str:
        selected_topic = next((topic for topic in graph.topics if topic.id == request.selected_topic_id), None)
        closed_topics = [topic.title for topic in graph.topics if topic.state in {"solid", "mastered"}]
        frontier_topics = [topic.title for topic in graph.topics if topic.state in {"learning", "needs_review", "shaky"}]
        return (
            f"User question: {request.prompt}\n\n"
            f"Graph title: {graph.title}\n"
            f"Graph preferred language: {self._language_name(graph.language)}\n"
            f"Grounding mode: {'web-enabled' if request.use_grounding else 'graph-local only'}\n"
            f"Selected topic: {selected_topic.title if selected_topic else 'none'}\n"
            f"Closed topics: {', '.join(closed_topics[:12]) or 'none'}\n"
            f"Active frontier: {', '.join(frontier_topics[:12]) or 'none'}\n"
            f"Advanced targets: {', '.join(topic.title for topic in graph.topics if topic.level >= 3) or 'none'}\n"
            "Give advice that is grounded in this current study graph. "
            "If the learner asks for next steps, mention concrete topics from the graph first."
        )

    def _language_name(self, language: str) -> str:
        return {"en": "English", "uk": "Ukrainian", "ru": "Russian"}.get(language, "English")
