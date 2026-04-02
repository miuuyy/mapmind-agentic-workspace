from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from app.core.config import Settings
from app.llm.contracts import QUIZ_ANSWER_HISTORY_TAG
from app.llm import LLMProviderError, build_llm_provider
from app.llm.prompt_templates import orchestrator_system_instruction
from app.llm.schemas import OrchestratorDecision
from app.models.domain import GraphChatRequest, GraphChatResponse, ProposalGenerateRequest, StudyGraph, WorkspaceConfig
from app.services.gemini_planner import GeminiPlanner, GeminiPlannerError
from app.services.quiz_service import is_prerequisite_relation

if TYPE_CHECKING:
    from google import genai as genai_module
    from google.genai import types as genai_types


class ChatOrchestratorError(RuntimeError):
    pass


class ChatOrchestratorService:
    def __init__(self, settings: Settings, planner: GeminiPlanner):
        self._settings = settings
        self._planner = planner
        self._provider = build_llm_provider(settings)
        self._client: genai_module.Client | None = getattr(self._provider, "_client", None)
        self._types: Any | None = getattr(self._provider, "_types", None)

    def has_live_provider(self) -> bool:
        return self._provider is not None

    def respond(self, graph: StudyGraph, request: GraphChatRequest, *, persona_rules: str = "", workspace_config: WorkspaceConfig | None = None) -> GraphChatResponse:
        model_name = request.model or self._settings.default_model
        if self._provider is None:
            raise ChatOrchestratorError("The selected AI provider is unavailable: missing API key")

        try:
            decision = self.decide(graph, request, persona_rules=persona_rules, workspace_config=workspace_config)
        except Exception as exc:
            raise ChatOrchestratorError(f"chat orchestration failed: {exc}") from exc

        if decision.action == "answer":
            return GraphChatResponse(
                session_id="",
                graph_id=graph.graph_id,
                message=self.reply_for_decision(decision),
                model=model_name,
                fallback_used=False,
                action="answer",
            )

        proposal_request = self.proposal_request_for_decision(decision, request, model_name=model_name)
        try:
            proposal = self._planner.generate_proposal(graph, proposal_request)
        except Exception as exc:
            raise ChatOrchestratorError(f"proposal generation failed: {exc}") from exc
        return GraphChatResponse(
            session_id="",
            graph_id=graph.graph_id,
            message=self.reply_for_decision(decision),
            model=model_name,
            fallback_used=False,
            action=decision.action,
            proposal=proposal,
        )

    def decide(self, graph: StudyGraph, request: GraphChatRequest, *, persona_rules: str = "", workspace_config: WorkspaceConfig | None = None) -> OrchestratorDecision:
        if self._provider is None:
            raise ChatOrchestratorError("The selected AI provider is unavailable: missing API key")
        model_name = request.model or self._settings.default_model
        return self._decide(graph, request, model_name=model_name, persona_rules=persona_rules, workspace_config=workspace_config)

    def proposal_request_for_decision(
        self,
        decision: OrchestratorDecision,
        request: GraphChatRequest,
        *,
        model_name: str,
    ) -> ProposalGenerateRequest:
        raw_text = (decision.proposal_raw_text or "").strip()
        if not raw_text or raw_text == "see_original_input":
            raw_text = request.prompt.strip()
        return ProposalGenerateRequest(
            mode="ingest_topics" if decision.action == "propose_ingest" else "expand_goal",
            raw_text=raw_text,
            target_goal=(decision.proposal_target_goal or request.prompt).strip(),
            instructions=decision.proposal_instructions.strip(),
            selected_topic_id=request.selected_topic_id,
            use_grounding=request.use_grounding,
            model=model_name,
        )

    def reply_for_decision(self, decision: OrchestratorDecision) -> str:
        if decision.action == "answer":
            return decision.reply_message.strip() or "I can help with this topic graph."
        return decision.reply_message.strip() or "Okay. I am turning this into a graph proposal now."

    def stream_proposal_result(self, graph: StudyGraph, request: ProposalGenerateRequest) -> dict[str, Any]:
        result_payload: dict[str, Any] | None = None
        try:
            for event in self._planner.stream_proposal(graph, request):
                if event.get("type") != "result":
                    continue
                candidate = event.get("result")
                if isinstance(candidate, dict):
                    result_payload = candidate
                    break
        except GeminiPlannerError as exc:
            raise ChatOrchestratorError(f"proposal generation failed: {exc}") from exc
        except Exception as exc:
            raise ChatOrchestratorError(f"proposal generation failed: {exc}") from exc
        if result_payload is None:
            raise ChatOrchestratorError("proposal generation failed: empty result")
        return result_payload

    def _decide(self, graph: StudyGraph, request: GraphChatRequest, *, model_name: str, persona_rules: str, workspace_config: WorkspaceConfig | None) -> OrchestratorDecision:
        prompt = self._build_prompt(graph, request, workspace_config=workspace_config)
        language_name = self._language_name(graph.language)
        if self._provider is None:
            raise ChatOrchestratorError("The selected AI provider is unavailable")
        try:
            response = self._provider.generate_structured(
                model=model_name,
                system_instruction=orchestrator_system_instruction(
                    language_name=language_name,
                    persona_rules=persona_rules,
                    use_grounding=request.use_grounding,
                ),
                prompt=prompt,
                schema=OrchestratorDecision,
                schema_name="orchestrator_decision",
                max_output_tokens=int(self._settings.orchestrator_max_output_tokens),
                temperature=0.1,
                use_grounding=request.use_grounding,
            )
            return response.parsed
        except LLMProviderError as exc:
            raise ChatOrchestratorError(f"chat orchestration failed: {exc}") from exc

    def _build_prompt(self, graph: StudyGraph, request: GraphChatRequest, *, workspace_config: WorkspaceConfig | None) -> str:
        selected_topic = next((topic for topic in graph.topics if topic.id == request.selected_topic_id), None)
        history_limit = workspace_config.memory_history_message_limit if workspace_config is not None else 50
        recent_messages = request.messages[-history_limit:]
        history_lines: list[str] = []
        for message in recent_messages:
            if message.role == "assistant" and message.action and message.action != "answer":
                applied_tag = ", APPLIED" if message.proposal_applied else ", NOT YET APPLIED"
                history_lines.append(f"assistant [ACTION: {message.action}{applied_tag}]: {message.content}")
            else:
                history_lines.append(f"{message.role}: {message.content}")
        history_text = "\n".join(history_lines) or "none"
        include_graph_context = workspace_config.memory_include_graph_context if workspace_config is not None else True
        include_progress_context = workspace_config.memory_include_progress_context if workspace_config is not None else True
        include_quiz_context = workspace_config.memory_include_quiz_context if workspace_config is not None else True
        include_frontier_context = workspace_config.memory_include_frontier_context if workspace_config is not None else True
        include_selected_topic_context = workspace_config.memory_include_selected_topic_context if workspace_config is not None else True
        selected_topic_context = self._selected_topic_context(graph, selected_topic.id) if selected_topic and include_selected_topic_context else "omitted"
        graph_context = self._graph_context(graph) if include_graph_context else "omitted"
        progress_context = self._progress_context(graph) if include_progress_context else "omitted"
        quiz_context = self._quiz_context(graph) if include_quiz_context else "omitted"
        frontier_context = self._frontier_context(graph) if include_frontier_context else "omitted"

        learning_session_directive = ""
        if request.session_id and selected_topic:
            learning_session_directive = (
                "\n\nLEARNING SESSION ACTIVE — FOCUSED ON THIS TOPIC.\n"
                f"The learner opened a dedicated session to study: \"{selected_topic.title}\".\n"
                "Behavioral rules for this session:\n"
                "- Do NOT try to teach everything about the topic in a single message. Keep responses concise.\n"
                "- Give brief, surface-level introductions. Spark curiosity, don't lecture.\n"
                "- Suggest the learner to look up specific materials, articles, docs, or examples on their own.\n"
                "- Ask follow-up questions to check understanding and keep the conversation going.\n"
                "- Be proactive and initiative-driven: guide the learner through the topic step by step across multiple messages.\n"
                "- Answer questions directly when asked, but don't over-explain.\n"
                "- Do NOT mention your role, do NOT say 'I am your tutor/assistant'. Just act naturally.\n"
                "- Do NOT suggest studying other topics or prerequisites. Stay on this topic.\n"
                "- Do NOT give a broad overview of the graph or recommend where to start.\n"
                "\n"
                "INLINE QUIZ RULES:\n"
                "- Inline quizzes are allowed only when action='answer'.\n"
                "- If action is propose_ingest or propose_expand, inline_quiz must be null.\n"
                "- Do not mix tutoring-with-quiz behavior into proposal actions.\n"
                "- After you've explained a concept and the learner confirms understanding, you MAY include a quiz.\n"
                "- If you emit an inline quiz, use the nested inline_quiz object.\n"
                "- Inline quizzes are rare checkpoints, not the default interaction style.\n"
                "- Do not offer or emit a quiz unless the learner explicitly asks for one, asks to be tested, or a short checkpoint is genuinely the most helpful next step after real explanation.\n"
                "- Questions MUST require thinking, applying concepts, or drawing analogies. Never ask something the learner can answer by scrolling up and copying text.\n"
                "- Vary difficulty. Some questions should be tricky with plausible distractors.\n"
                "- Randomize the position of the correct answer across quizzes.\n"
                "- Never spam quizzes. One occasional checkpoint is enough; default to normal conversation.\n"
                f"- If a {QUIZ_ANSWER_HISTORY_TAG} message appears in history, react to it naturally (praise if correct, explain if wrong).\n"
                "- Track what you've already quizzed in the chat history — don't repeat similar questions.\n"
            )

        return (
            f"Graph context:\n{graph_context}\n\n"
            f"Graph preferred language: {self._language_name(graph.language)}\n\n"
            f"Learner progress:\n{progress_context}\n\n"
            f"Recent quiz activity:\n{quiz_context}\n\n"
            f"Learning frontier (ready to study next):\n{frontier_context}\n\n"
            f"Grounding mode: {'web-enabled' if request.use_grounding else 'graph-local only'}\n\n"
            f"Selected topic context:\n{selected_topic_context}\n\n"
            f"Recent chat history:\n{history_text}\n\n"
            f"Latest user message:\n{request.prompt}\n\n"
            f"{learning_session_directive}"
            "Decision policy:\n"
            "- choose answer when the user mainly wants explanation, advice, or support\n"
            "- choose propose_ingest when the user pasted or described raw topic material to load into the graph\n"
            "- choose propose_expand when the user wants to grow the graph toward a target concept or field\n"
            "- if the latest user message is a short imperative request to add, expand, grow, extend, or flesh out the graph or the current topic area, treat it as a graph-mutation request rather than a normal chat reply\n"
            "- when the user is clearly asking for graph mutation, do not answer with options or a plan summary; emit the corresponding propose_* action directly\n"
            "- the final graph should represent concrete study units, not vague semester buckets\n"
            "- use the current graph structure, existing topics, zones, and prerequisites when deciding what kind of action this is\n"
            "- never say that topics were removed, deleted, or already changed unless a proposal was actually generated and later applied by the app\n"
            "- if action is propose_ingest or propose_expand, reply_message must sound like the next step is about to happen, not already completed\n"
            "- for propose_* actions, use wording like 'I'll prepare...', 'I'm turning this into...', 'Next I will...' and never 'I've prepared/generated/created...'\n"
            "- if the chat history shows a recent [ACTION: propose_ingest, APPLIED] or [ACTION: propose_expand, APPLIED], the graph already has those topics; do NOT re-propose the same content\n"
            "- if the user sends a casual or short follow-up after a proposal was applied, that is almost certainly a chat message (answer), not a new ingest request\n"
            "- if you choose propose_ingest, set proposal_raw_text to the exact string 'see_original_input' (do NOT copy the raw material); the backend will substitute the real input automatically\n"
            "- if you choose propose_expand, leave proposal_raw_text empty and fill proposal_target_goal and proposal_instructions instead\n"
            "- if action is propose_ingest or propose_expand, inline_quiz must be null\n"
            "- do not use inline_quiz by default; only emit it when the learner explicitly wants testing or when a single brief checkpoint is clearly more useful than another plain reply\n"
            "- you have full context about the learner's progress, quiz results, and current frontier; use it to give personalized study advice when answering\n"
            "Return JSON with action, reply_message, proposal_target_goal, proposal_raw_text, proposal_instructions, and optional inline_quiz."
        )

    def _language_name(self, language: str) -> str:
        return {"en": "English", "uk": "Ukrainian", "ru": "Russian"}.get(language, "English")

    def _progress_context(self, graph: StudyGraph) -> str:
        total = len(graph.topics)
        if total == 0:
            return "empty graph, no topics yet"
        by_state: dict[str, int] = {}
        remaining_minutes = 0
        for topic in graph.topics:
            by_state[topic.state] = by_state.get(topic.state, 0) + 1
            if topic.state not in ("solid", "mastered"):
                remaining_minutes += topic.estimated_minutes
        completed = by_state.get("solid", 0) + by_state.get("mastered", 0)
        pct = round(100 * completed / total) if total else 0
        hours_remaining = round(remaining_minutes / 60, 1)
        state_summary = ", ".join(f"{state}={count}" for state, count in sorted(by_state.items()))
        return (
            f"total_topics={total} completed={completed} ({pct}%)\n"
            f"by_state: {state_summary}\n"
            f"estimated_remaining={hours_remaining}h"
        )

    def _quiz_context(self, graph: StudyGraph) -> str:
        topics_by_id = {topic.id: topic for topic in graph.topics}
        closed_ids = {t.id for t in graph.topics if t.state in ("solid", "mastered")}
        attempts = sorted(
            graph.quiz_attempts,
            key=lambda a: a.created_at,
            reverse=True,
        )
        if not attempts:
            return "no quizzes taken yet"

        # Section 1: Attempt summary (all, last 15)
        lines: list[str] = ["## Recent attempts"]
        for attempt in attempts[:15]:
            topic_title = self._topic_title(topics_by_id, attempt.topic_id)
            status = "PASSED" if attempt.passed else f"FAILED (fail #{attempt.fail_count})"
            score_pct = round(attempt.score * 100)
            date_str = attempt.created_at.strftime("%Y-%m-%d %H:%M")
            lines.append(
                f"- [{date_str}] {topic_title}: {score_pct}% ({attempt.question_count}q) {status}"
                + (" → closure awarded" if attempt.closure_awarded else "")
            )

        # Section 2: Missed questions from unclosed topics only (smart filtering)
        missed_by_topic: dict[str, list[str]] = {}
        for attempt in attempts:
            if attempt.topic_id in closed_ids:
                continue  # topic is closed, skip — learner already mastered it
            if not attempt.missed_questions:
                continue
            topic_title = self._topic_title(topics_by_id, attempt.topic_id)
            if topic_title not in missed_by_topic:
                missed_by_topic[topic_title] = []
            for q in attempt.missed_questions:
                if q not in missed_by_topic[topic_title]:  # deduplicate
                    missed_by_topic[topic_title].append(q)

        if missed_by_topic:
            lines.append("\n## Missed questions (unclosed topics only)")
            total_missed = 0
            for topic_title, questions in sorted(missed_by_topic.items()):
                if total_missed >= 30:
                    lines.append(f"... (truncated, {sum(len(q) for q in missed_by_topic.values()) - total_missed} more)")
                    break
                lines.append(f"### {topic_title}")
                for q in questions[:10]:  # max 10 per topic
                    lines.append(f"  - {q}")
                    total_missed += 1

        return "\n".join(lines)

    def _frontier_context(self, graph: StudyGraph) -> str:
        topics_by_id = {topic.id: topic for topic in graph.topics}
        closed_ids: set[str] = set()
        for topic in graph.topics:
            if topic.state in ("solid", "mastered"):
                closed_ids.add(topic.id)
        prereqs_by_topic: dict[str, list[str]] = {topic.id: [] for topic in graph.topics}
        for edge in graph.edges:
            if not is_prerequisite_relation(edge.relation):
                continue
            prereqs_by_topic.setdefault(edge.target_topic_id, []).append(edge.source_topic_id)
        frontier: list[str] = []
        for topic in graph.topics:
            if topic.id in closed_ids:
                continue
            prereqs = prereqs_by_topic.get(topic.id, [])
            if all(pid in closed_ids for pid in prereqs):
                frontier.append(topic.title)
        if not frontier:
            return "no frontier topics (all topics either mastered/solid or have unclosed prerequisites)"
        return "\n".join(f"- {title}" for title in sorted(frontier))

    def _graph_context(self, graph: StudyGraph) -> str:
        parents_by_child: dict[str, list[str]] = {topic.id: [] for topic in graph.topics}
        topics_by_id = {topic.id: topic for topic in graph.topics}
        for edge in graph.edges:
            if not is_prerequisite_relation(edge.relation):
                continue
            parents_by_child.setdefault(edge.target_topic_id, []).append(edge.source_topic_id)

        root_titles = sorted(
            topics_by_id[topic_id].title
            for topic_id, parents in parents_by_child.items()
            if not parents and topic_id in topics_by_id
        )
        zone_lines = [
            f"- {zone.title} [{zone.kind}] color={zone.color} topics={', '.join(self._topic_title(topics_by_id, topic_id) for topic_id in zone.topic_ids) or 'none'}"
            for zone in graph.zones
        ] or ["- none"]
        topic_lines = [
            (
                f"- {topic.title} | level={topic.level} | state={topic.state}"
                f" | zones={', '.join(topic.zones) or 'none'}"
                f" | resources={len(topic.resources)} | artifacts={len(topic.artifacts)}"
            )
            for topic in sorted(graph.topics, key=lambda item: (item.level, item.title.lower()))
        ] or ["- none"]
        edge_lines = [
            f"- {self._topic_title(topics_by_id, edge.source_topic_id)}"
            f" -> {self._topic_title(topics_by_id, edge.target_topic_id)}"
            f" [{edge.relation}]"
            for edge in graph.edges
        ] or ["- none"]
        return (
            f"title={graph.title}\n"
            f"subject={graph.subject}\n"
            f"topic_count={len(graph.topics)} edge_count={len(graph.edges)} zone_count={len(graph.zones)}\n"
            f"root_topics={', '.join(root_titles) or 'none'}\n"
            f"zones:\n" + "\n".join(zone_lines) + "\n"
            f"topics:\n" + "\n".join(topic_lines) + "\n"
            f"edges:\n" + "\n".join(edge_lines)
        )

    def _selected_topic_context(self, graph: StudyGraph, selected_topic_id: str) -> str:
        topics_by_id = {topic.id: topic for topic in graph.topics}
        selected = topics_by_id.get(selected_topic_id)
        if selected is None:
            return "none"
        parents_by_child: dict[str, list[str]] = {topic.id: [] for topic in graph.topics}
        for edge in graph.edges:
            if not is_prerequisite_relation(edge.relation):
                continue
            parents_by_child.setdefault(edge.target_topic_id, []).append(edge.source_topic_id)
        chain_ids: list[str] = []
        stack = list(parents_by_child.get(selected_topic_id, []))
        seen: set[str] = set()
        while stack:
            topic_id = stack.pop()
            if topic_id in seen:
                continue
            seen.add(topic_id)
            chain_ids.append(topic_id)
            stack.extend(parents_by_child.get(topic_id, []))
        chain_titles = [self._topic_title(topics_by_id, topic_id) for topic_id in chain_ids]
        return (
            f"title={selected.title}\n"
            f"description={selected.description or 'none'}\n"
            f"state={selected.state} level={selected.level} estimated_minutes={selected.estimated_minutes}\n"
            f"zones={', '.join(selected.zones) or 'none'}\n"
            f"resources={', '.join(resource.label for resource in selected.resources) or 'none'}\n"
            f"artifacts={', '.join(artifact.title for artifact in selected.artifacts) or 'none'}\n"
            f"prerequisite_chain={', '.join(chain_titles) or 'none'}"
        )

    def _topic_title(self, topics_by_id: dict[str, object], topic_id: str) -> str:
        topic = topics_by_id.get(topic_id)
        return getattr(topic, "title", topic_id)
