from __future__ import annotations

import json
import logging
import re
from collections import Counter
from typing import Any, Iterable
from uuid import uuid4

from app.core.config import Settings
from app.llm import LLMProviderError, build_llm_provider
from app.llm.prompt_templates import planner_system_instruction
from app.llm.schemas import GeminiProposalDraft, planner_response_json_schema
from app.models.domain import GraphOperation, GraphProposalEnvelope, ProposalDisplay, ProposalGenerateRequest, ProposalGenerateResponse, ProposalIntent, ProposalOpenQuestion, ProposalProvenance, ProposalSourceBundle, ProposalTrace, StudyGraph
from app.services.proposal_normalizer import ProposalNormalizer
from app.services.proposal_repairer import ProposalRepairer
from app.services.proposal_validator import ProposalValidator

logger = logging.getLogger(__name__)


SEPARATOR_RE = re.compile(r"^\s*(?:---+|\*\*\*+|___+)\s*$", re.MULTILINE)
URL_RE = re.compile(r"https?://[^\s)>\]}]+", re.IGNORECASE)
MARKDOWN_LINK_URL_RE = re.compile(r"\[[^\]]+\]\((https?://[^)\s]+)\)", re.IGNORECASE)


class ProposalPlannerError(RuntimeError):
    def __init__(self, message: str, *, diagnostics: dict[str, Any] | None = None):
        super().__init__(message)
        self.diagnostics = diagnostics or {}

class ProposalPlanner:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._provider = build_llm_provider(settings)
        if self._provider is None:
            provider_name = (settings.ai_provider or "gemini").upper()
            raise ProposalPlannerError(f"{provider_name}_API_KEY is not configured")
        self._normalizer = ProposalNormalizer()
        self._repairer = ProposalRepairer()

    def generate_proposal(self, graph: StudyGraph, request: ProposalGenerateRequest) -> ProposalGenerateResponse:
        model_name = request.model or self._settings.default_model
        sanitized_raw_text = self._sanitize_raw_text(request.raw_text)
        prompt = self._build_prompt(graph, request, sanitized_raw_text=sanitized_raw_text)
        system_instruction = self._build_system_instruction()
        draft, usage_metadata = self._generate_draft_with_provider(
            system_instruction=system_instruction,
            prompt=prompt,
            request=request,
            model_name=model_name,
        )
        try:
            return self._finalize_proposal(
                graph=graph,
                request=request,
                model_name=model_name,
                sanitized_raw_text=sanitized_raw_text,
                draft=draft,
                usage_metadata=usage_metadata,
            )
        except ProposalPlannerError as exc:
            diagnostics = dict(getattr(exc, "diagnostics", {}) or {})
            diagnostics.setdefault("planner_system_instruction", system_instruction)
            diagnostics.setdefault("planner_prompt", prompt)
            diagnostics.setdefault("draft_payload", draft.model_dump(mode="json"))
            raise ProposalPlannerError(str(exc), diagnostics=diagnostics) from exc

    def stream_proposal(
        self,
        graph: StudyGraph,
        request: ProposalGenerateRequest,
    ) -> Iterable[dict[str, Any]]:
        model_name = request.model or self._settings.default_model
        sanitized_raw_text = self._sanitize_raw_text(request.raw_text)
        prompt = self._build_prompt(graph, request, sanitized_raw_text=sanitized_raw_text)
        system_instruction = self._build_system_instruction()
        yield {"type": "status", "stage": "started", "model": model_name}
        collected_text = ""
        usage_metadata: Any = None
        finish_reason = ""
        stream = self._provider.stream_structured(
            model=model_name,
            system_instruction=system_instruction,
            prompt=prompt,
            schema=GeminiProposalDraft,
            schema_name="graph_proposal_draft",
            response_json_schema=self._proposal_response_schema(),
            max_output_tokens=int(self._settings.planner_max_output_tokens),
            temperature=0.0,
            use_grounding=request.use_grounding,
        )
        for chunk in stream:
            usage_metadata = chunk.usage or usage_metadata
            finish_reason = chunk.finish_reason or finish_reason
            chunk_text = chunk.text
            delta = self._stream_delta(previous_text=collected_text, current_text=chunk_text)
            if delta:
                collected_text += delta
                yield {"type": "delta", "text": delta}
        draft = self._coerce_proposal_draft_from_text(collected_text, finish_reason=finish_reason)
        self._log_stream_diagnostics(collected_text, usage_metadata)
        try:
            result = self._finalize_proposal(
                graph=graph,
                request=request,
                model_name=model_name,
                sanitized_raw_text=sanitized_raw_text,
                draft=draft,
                usage_metadata=usage_metadata,
            )
        except ProposalPlannerError as exc:
            diagnostics = dict(getattr(exc, "diagnostics", {}) or {})
            diagnostics.setdefault("planner_system_instruction", system_instruction)
            diagnostics.setdefault("planner_prompt", prompt)
            diagnostics.setdefault("raw_model_response_text", collected_text[:12000] or None)
            diagnostics.setdefault("draft_payload", draft.model_dump(mode="json"))
            raise ProposalPlannerError(str(exc), diagnostics=diagnostics) from exc
        yield {"type": "result", "result": result.model_dump(mode="json")}

    def _generate_draft_with_provider(
        self,
        *,
        system_instruction: str,
        prompt: str,
        request: ProposalGenerateRequest,
        model_name: str,
    ) -> tuple[GeminiProposalDraft, Any]:
        if self._provider is None:
            raise ProposalPlannerError("AI provider is not configured")
        try:
            response = self._provider.generate_structured(
                model=model_name,
                system_instruction=system_instruction,
                prompt=prompt,
                schema=GeminiProposalDraft,
                schema_name="graph_proposal_draft",
                response_json_schema=self._proposal_response_schema(),
                max_output_tokens=int(self._settings.planner_max_output_tokens),
                temperature=0.0,
                use_grounding=request.use_grounding,
            )
            return response.parsed, response.usage
        except LLMProviderError as exc:
            diagnostics = dict(getattr(exc, "diagnostics", {}) or {})
            diagnostics.setdefault("planner_system_instruction", system_instruction)
            diagnostics.setdefault("planner_prompt", prompt)
            raise ProposalPlannerError(str(exc), diagnostics=diagnostics) from exc
        except Exception as exc:
            raise ProposalPlannerError(
                str(exc),
                diagnostics={
                    "provider": getattr(self._provider, "provider_id", None),
                    "model": model_name,
                    "mode": request.mode,
                    "target_goal": request.target_goal,
                    "selected_topic_id": request.selected_topic_id,
                    "use_grounding": request.use_grounding,
                    "planner_system_instruction": system_instruction,
                    "planner_prompt": prompt,
                },
            ) from exc

    def _build_system_instruction(self) -> str:
        instruction = (
            "You are a curriculum graph planner for a local study graph application. "
            "Return valid JSON only. No markdown fences, comments, or trailing prose. "
            "Return only the proposal body fields; the server attaches envelope metadata. "
            "\n\nHARD RULES (violation = rejected proposal):\n"
            "1. CONNECTIVITY: The graph MUST be one connected network. "
            "For EVERY new topic you propose, you MUST also propose at least one edge connecting it to either an existing graph topic or another proposed topic that itself connects back to the existing graph. "
            "Emit all upsert_topic operations first, then all upsert_edge operations, then upsert_zone operations. "
            "Before writing the final JSON, mentally verify: can you walk from every new topic to at least one existing topic through proposed + existing edges? If not, add the missing edges. "
            'The validator will reject this exact failure with: "proposal would create disconnected graph islands; link new topics through meaningful prerequisites". Do not trigger that error.\n'
            "2. ZONE INTEGRITY: Every topic_id in a zone's topic_ids MUST exist in the graph or be created by upsert_topic in the SAME proposal. "
            "If you reference a topic_id in a zone but do not propose that topic, the proposal fails. "
            "If any topic.zones entry uses a zone id that does not already exist in the graph, you MUST include an upsert_zone for that exact zone id in the SAME proposal. "
            "Never reference a new zone id from topic.zones without also creating that zone.\n"
            "3. FIDELITY: For ingest mode, proposed topic count MUST be >= 80% of the source item count. "
            "Do not collapse 60 source items into 13 topics. Preserve user-provided URLs as resource links; do not replace them.\n"
            "4. NO DELETIONS: Do not remove topics or edges. Graph proposals are additive.\n"
            "5. NO COMPLETION STATES: Default new topics to not_started.\n"
            "6. EDGE RELATION ENUM: edge.relation MUST be exactly one of "
            '"requires", "supports", "bridges", "extends", or "reviews". '
            'Never output "prerequisite" or any synonym; use "requires" for prerequisite edges.\n'
            "\nGENERAL GUIDELINES:\n"
            "- This is a study plan, not a semester outline. Produce concrete study units.\n"
            "- Build prerequisite chains toward the user's target, reusing existing topics when possible. "
            "- Canonical language is the graph preferred language. Translate source material if needed. "
            "- Prefer concise titles, slug-like ids, sparse direct edges (nearest prerequisites, not every ancestor). "
            "- When the graph is not empty, every new branch must attach back into the existing graph through prerequisite edges. Add bridge topics/edges if the target area is far away. "
            "- Zones are soft macro regions, not per-topic tags. "
            "- Each topic should be a concrete learnable unit (mechanism, method, theorem, tool pattern), not a vague umbrella label. "
            "- For ingest mode, preserve the granularity of distinct source items; only merge exact duplicates. "
            "- For expand mode, remember this graph is not decoration — it is a real self-study tracker where the user takes closure quizzes on each topic individually. "
            "Each topic must be a concrete, testable concept that a learner can realistically sit down and study in one session. "
            "If a topic is too broad to quiz on meaningfully (like 'Linear Algebra' or 'Neural Networks'), it is too broad — break it into its actual components. "
            "Be honest about how much prerequisite knowledge a target actually requires. Do not simplify the path just to keep the proposal short. "
            "- Time estimates must be realistic for self-study. "
            "- Each operation must have op_id, entity_kind, and rationale. "
            "- If you mention coverage in the summary, it must match actual proposed operations."
        )
        return instruction

    def _build_prompt(
        self,
        graph: StudyGraph,
        request: ProposalGenerateRequest,
        *,
        sanitized_raw_text: str,
    ) -> str:
        source_item_count = self._request_source_item_count(request, sanitized_raw_text)
        selected_topic = next((topic for topic in graph.topics if topic.id == request.selected_topic_id), None)
        graph_context = {
            "graph_id": graph.graph_id,
            "subject": graph.subject,
            "title": graph.title,
            "topics": [
                {
                    "id": topic.id,
                    "title": topic.title,
                    "level": topic.level,
                    "state": topic.state,
                    "zones": topic.zones,
                }
                for topic in graph.topics
            ],
            "edges": [
                {
                    "source_topic_id": edge.source_topic_id,
                    "target_topic_id": edge.target_topic_id,
                    "relation": edge.relation,
                }
                for edge in graph.edges
            ],
            "zones": [
                {
                    "id": zone.id,
                    "title": zone.title,
                    "kind": zone.kind,
                    "topic_ids": zone.topic_ids,
                }
                for zone in graph.zones
            ],
        }
        raw_input_excerpt = sanitized_raw_text[:100000]
        return json.dumps(
            {
                "task": {
                    "mode": request.mode,
                    "graph_id": graph.graph_id,
                    "graph_language": graph.language,
                    "target_goal": request.target_goal,
                    "instructions": request.instructions,
                    "use_grounding": request.use_grounding,
                },
            "source_facts": {
                    "source_item_count": source_item_count,
                    "graph_is_empty": len(graph.topics) == 0,
                    "existing_topic_count": len(graph.topics),
                "existing_edge_count": len(graph.edges),
            },
            "attachment_context": {
                "selected_topic": (
                    {
                        "id": selected_topic.id,
                        "title": selected_topic.title,
                        "level": selected_topic.level,
                        "state": selected_topic.state,
                        "zones": selected_topic.zones,
                    }
                    if selected_topic is not None
                    else None
                ),
                "attach_near_selected_topic": bool(selected_topic is not None),
            },
            "source_items": [item.model_dump(mode="json") for item in request.source_items],
                "requirements": {
                    "proposal_shape": "GeminiProposalDraft",
                    "graph_id_must_match": graph.graph_id,
                    "canonical_language": self._language_name(graph.language),
                    "connectivity_execution_policy": "every new branch must attach back into the existing graph through prerequisite edges or explicit bridge topics",
                    "operation_order": "emit upsert_topic ops first, then upsert_edge ops, then upsert_zone ops; this ensures every topic exists before edges reference it and every edge exists before zones assume connectivity",
                    "edge_policy": "for each new topic, emit at least one edge connecting it to the existing graph or to another new topic that connects back; prefer nearest prerequisites, avoid redundant transitive edges",
                    "topic_policy": "topic is the primary entity; resources and artifacts attach to topics; each topic must be a concrete study unit",
                    "zone_policy": "zones group related topics into macro regions; all topic_ids in a zone must exist in graph or be proposed; if topic.zones references a new zone id, include an upsert_zone for that exact id in the same proposal",
                    "scope_policy": "be honest about prerequisite breadth; do not compress large source into a tiny graph",
                    "mode_specific_policy": {
                        "ingest_topics": "preserve most distinct source items as distinct study units; only merge exact duplicates; proposed topic count MUST be >= 80% of source_item_count; preserve user-provided URLs as topic resources",
                        "expand_goal": "this graph is the learner's real study plan with per-topic quizzes; produce a prerequisite path where every topic is a single testable concept, not a chapter heading; be honest about the full prerequisite breadth of the target; do not compress weeks of material into a handful of umbrella topics",
                    },
                },
                "existing_graph": graph_context,
                "raw_input": raw_input_excerpt,
                "output_expectations": {
                    "summary": "brief factual summary of the proposal",
                    "assistant_message": "brief explanation for the user without invented counts",
                    "quality_bar": [
                        "topic titles should read like specific things to study",
                        "the graph should look traversable step by step",
                        "broad target concepts should be decomposed into concrete intermediate topics",
                        "new branches should visibly connect back into the existing graph instead of floating as isolated islands",
                    ],
                    "operations": [
                        "upsert_topic",
                        "upsert_edge",
                        "upsert_zone",
                        "set_mastery",
                    ],
                },
            },
            ensure_ascii=True,
        )

    def _language_name(self, language: str) -> str:
        return {"en": "English", "uk": "Ukrainian", "ru": "Russian"}.get(language, "English")

    def _coerce_proposal_draft_from_text(self, text: str, *, finish_reason: str = "") -> GeminiProposalDraft:
        try:
            return GeminiProposalDraft.model_validate_json(text)
        except Exception as exc:
            candidate = self._extract_json_candidate(text)
            if candidate:
                try:
                    return GeminiProposalDraft.model_validate_json(candidate)
                except Exception as candidate_exc:
                    raise self._invalid_json_error(
                        finish_reason=finish_reason,
                        raw_text=text,
                        json_candidate=candidate,
                        cause=exc,
                    ) from candidate_exc
            raise self._invalid_json_error(
                finish_reason=finish_reason,
                raw_text=text,
                json_candidate=None,
                cause=exc,
            )

    def _sanitize_raw_text(self, raw_text: str) -> str:
        collapsed = SEPARATOR_RE.sub("", raw_text)
        return re.sub(r"\n{3,}", "\n\n", collapsed).strip()

    def _request_source_item_count(self, request: ProposalGenerateRequest, sanitized_raw_text: str) -> int:
        if request.source_items:
            return len(request.source_items)
        return self._count_source_items(sanitized_raw_text)

    def _count_source_items(self, sanitized_raw_text: str) -> int:
        lines = [line.strip() for line in sanitized_raw_text.splitlines()]
        bullet_like = sum(1 for line in lines if re.match(r"^(?:[-*+]|\d+[.)])\s+\S", line))
        if bullet_like > 0:
            return bullet_like
        blocks = [block.strip() for block in re.split(r"\n\s*\n", sanitized_raw_text) if block.strip()]
        return len(blocks)

    def _extract_json_candidate(self, text: str) -> str | None:
        cleaned = text.strip()
        fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", cleaned, re.DOTALL)
        if fenced:
            return fenced.group(1).strip()
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            return cleaned[start : end + 1]
        return None

    def _stream_delta(self, *, previous_text: str, current_text: str) -> str:
        if not current_text:
            return ""
        if previous_text and current_text.startswith(previous_text):
            return current_text[len(previous_text) :]
        return current_text

    def _log_stream_diagnostics(self, collected_text: str, usage_metadata: Any) -> None:
        op_count = collected_text.count('"op_id"')
        if hasattr(usage_metadata, "model_dump"):
            usage_str = str(usage_metadata.model_dump(mode="json"))
        elif usage_metadata:
            usage_str = str(usage_metadata)
        else:
            usage_str = ""
        logger.info(f"Stream summary: {len(collected_text)} chars, ~{op_count} operations")
        logger.info(f"Stream usage: {usage_str}")
        op_ids = re.findall(r'"op_id"\s*:\s*"([^"]+)"', collected_text)
        dupes = {op_id: count for op_id, count in Counter(op_ids).items() if count > 2}
        if dupes:
            logger.warning(f"Stream repetition detected! Duplicate op_ids: {dupes}")

    def _invalid_json_error(
        self,
        *,
        finish_reason: str = "",
        raw_text: str = "",
        json_candidate: str | None = None,
        cause: Exception | None = None,
    ) -> ProposalPlannerError:
        finish_reason = str(finish_reason or "").upper()
        if "MAX_TOKENS" in finish_reason:
            return ProposalPlannerError(
                f"Proposal generation hit the output token limit ({int(self._settings.planner_max_output_tokens)}) before closing JSON",
                diagnostics={
                    "finish_reason": finish_reason,
                    "raw_model_response_text": raw_text[:12000] or None,
                    "json_candidate": json_candidate[:12000] if json_candidate else None,
                    "parse_error": str(cause) if cause else None,
                },
            )
        return ProposalPlannerError(
            "Provider returned invalid proposal JSON",
            diagnostics={
                "finish_reason": finish_reason or None,
                "raw_model_response_text": raw_text[:12000] or None,
                "json_candidate": json_candidate[:12000] if json_candidate else None,
                "parse_error": str(cause) if cause else None,
            },
        )

    def _coerce_operation(self, payload: dict[str, Any], *, index: int) -> GraphOperation:
        if isinstance(payload, GraphOperation):
            data = payload.model_dump(mode="json")
        elif hasattr(payload, "model_dump"):
            data = payload.model_dump(mode="json")
        else:
            data = dict(payload or {})
        data.setdefault("status", "proposed")
        topic_payload = data.get("topic")
        if isinstance(topic_payload, dict):
            topic_id = str(topic_payload.get("id") or f"topic_{index + 1}")
            resources = topic_payload.get("resources")
            if isinstance(resources, list):
                for resource_index, resource in enumerate(resources):
                    if not isinstance(resource, dict):
                        continue
                    if not resource.get("id"):
                        resource["id"] = f"{topic_id}_res_{resource_index + 1}"
                    resource.setdefault("kind", "reference")
        return GraphOperation.model_validate(data)

    def _repair_zone_topic_refs(self, envelope: GraphProposalEnvelope, graph: StudyGraph) -> None:
        """Strip zone references to topics that were not proposed or already in graph.

        This runs after Gemini output is coerced but before validation.
        Gemini sometimes generates zones referencing topic_ids it intended
        to create but either forgot or lost due to output truncation.
        Instead of failing the entire proposal, we strip the orphan refs,
        leave the rest of the proposal untouched, and add a warning so the
        review surface shows exactly what structural cleanup was applied.
        """
        existing_topic_ids = {t.id for t in graph.topics}
        proposed_topic_ids = {
            op.topic.id for op in envelope.operations if op.topic is not None
        }
        known = existing_topic_ids | proposed_topic_ids

        for op in envelope.operations:
            if op.op != "upsert_zone" or op.zone is None:
                continue
            orphans = [tid for tid in op.zone.topic_ids if tid not in known]
            if not orphans:
                continue
            op.zone.topic_ids = [tid for tid in op.zone.topic_ids if tid in known]
            envelope.warnings.append(
                f"zone {op.zone.id}: stripped {len(orphans)} orphaned topic ref(s) "
                f"during structural cleanup before review because the model did not propose them: {', '.join(sorted(orphans))}"
            )

    def _proposal_response_schema(self) -> dict[str, Any]:
        return planner_response_json_schema()

    def _finalize_proposal(
        self,
        *,
        graph: StudyGraph,
        request: ProposalGenerateRequest,
        model_name: str,
        sanitized_raw_text: str,
        draft: GeminiProposalDraft,
        usage_metadata: Any,
    ) -> ProposalGenerateResponse:
        proposal_envelope = GraphProposalEnvelope(
            graph_id=graph.graph_id,
            proposal_id=f"prop_{uuid4().hex[:10]}",
            mode=request.mode,
            intent=ProposalIntent(
                user_prompt=request.raw_text.strip() or request.target_goal.strip() or request.instructions.strip(),
                target_goal=request.target_goal,
                instructions=request.instructions,
            ),
            source_bundle=ProposalSourceBundle(
                raw_text=sanitized_raw_text,
                source_items=list(request.source_items),
                grounding_enabled=bool(request.use_grounding),
            ),
            summary=draft.summary,
            assistant_message=draft.assistant_message,
            assumptions=draft.assumptions,
            warnings=draft.warnings,
            open_questions=[ProposalOpenQuestion.model_validate(item) for item in draft.open_questions],
            operations=[self._coerce_operation(item, index=i) for i, item in enumerate(draft.operations)],
            provenance=ProposalProvenance(
                model=model_name,
                grounding_used=bool(request.use_grounding),
            ),
        )
        self._repairer.materialize_missing_zones(proposal_envelope, graph)
        self._repair_zone_topic_refs(proposal_envelope, graph)
        apply_plan = self._normalizer.normalize(proposal_envelope, graph=graph)
        proposal_envelope.warnings = list(apply_plan.validation.warnings)
        apply_plan.normalized_proposal.warnings = list(apply_plan.validation.warnings)
        if not apply_plan.validation.ok:
            raise ProposalPlannerError("; ".join(apply_plan.validation.errors))
        display = self._build_display(apply_plan)
        return ProposalGenerateResponse(
            proposal_envelope=proposal_envelope,
            apply_plan=apply_plan,
            trace=ProposalTrace(
                model=model_name,
                mode=request.mode,
                used_grounding=bool(request.use_grounding),
                raw_text_present=bool(request.raw_text.strip()),
                source_item_count=self._request_source_item_count(request, sanitized_raw_text),
                usage_metadata=self._serialize_usage(usage_metadata),
            ),
            display=display,
        )

    def _validate_proposal_envelope(
        self,
        graph: StudyGraph,
        proposal: GraphProposalEnvelope,
    ) -> None:
        self._repairer.materialize_missing_zones(proposal, graph)
        apply_plan = self._normalizer.normalize(proposal, graph=graph)
        proposal.warnings = list(apply_plan.validation.warnings)
        if not apply_plan.validation.ok:
            diagnostics: dict[str, Any] = {
                "validation_errors": list(apply_plan.validation.errors),
                "validation_warnings": list(apply_plan.validation.warnings),
                "proposal_operation_count": len(proposal.operations),
                "proposal_payload": proposal.model_dump(mode="json"),
            }
            if any("disconnected graph islands" in error for error in apply_plan.validation.errors):
                diagnostics["connectivity"] = ProposalValidator().connectivity_diagnostics(graph, proposal)
            raise ProposalPlannerError("; ".join(apply_plan.validation.errors), diagnostics=diagnostics)

    def _build_display(self, apply_plan) -> ProposalDisplay:
        preview = apply_plan.preview
        parts: list[str] = []
        if preview.topic_add_count:
            parts.append(self._count_label(preview.topic_add_count, "topic"))
        if preview.edge_add_count:
            parts.append(self._count_label(preview.edge_add_count, "edge"))
        if preview.zone_add_count or preview.zone_update_count:
            zone_total = preview.zone_add_count + preview.zone_update_count
            parts.append(self._count_label(zone_total, "zone change"))
        if preview.mastery_update_count:
            parts.append(self._count_label(preview.mastery_update_count, "mastery update"))
        summary = ", ".join(parts) if parts else "No structural changes"

        highlights: list[str] = []
        for group in apply_plan.patch_groups:
            for operation in group.operations:
                if len(highlights) >= 5:
                    break
                target = None
                if operation.topic and operation.topic.title:
                    target = operation.topic.title
                elif operation.zone and operation.zone.title:
                    target = operation.zone.title
                elif operation.edge:
                    target = f"{operation.edge.source_topic_id} -> {operation.edge.target_topic_id}"
                if target:
                    highlights.append(target)
            if len(highlights) >= 5:
                break

        return ProposalDisplay(summary=summary, highlights=highlights)

    def _count_label(self, value: int, noun: str) -> str:
        suffix = "" if value == 1 else "s"
        return f"{value} {noun}{suffix}"

    def _serialize_usage(self, usage_metadata: Any) -> dict[str, Any]:
        if usage_metadata is None:
            return {}
        if hasattr(usage_metadata, "model_dump"):
            return usage_metadata.model_dump(mode="json")
        if isinstance(usage_metadata, dict):
            return usage_metadata
        return {"value": str(usage_metadata)}
