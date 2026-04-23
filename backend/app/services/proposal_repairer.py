from __future__ import annotations

from collections import OrderedDict
import re

from app.models.domain import GraphOperation, GraphProposalEnvelope, ProposalZone, StudyGraph


_NON_ALNUM_RE = re.compile(r"[^a-zA-Z0-9]+")


class ProposalRepairer:
    """Deterministic structural repairs for provider-authored proposal envelopes.

    This layer is intentionally narrow. It can only materialize structural
    objects that the model already referenced verbatim, and must not invent new
    learning semantics. Today that means creating missing zones when proposed
    topics already point at explicit zone ids.
    """

    def materialize_missing_zones(self, envelope: GraphProposalEnvelope, graph: StudyGraph) -> None:
        # Keep repair structural-only: materialize only model-referenced zones and warn for review.
        existing_zone_ids = {zone.id for zone in graph.zones}
        proposed_zone_ids = {
            operation.zone.id
            for operation in envelope.operations
            if operation.zone is not None
        }
        known_zone_ids = existing_zone_ids | proposed_zone_ids

        topics_by_missing_zone: OrderedDict[str, list[str]] = OrderedDict()
        for operation in envelope.operations:
            if operation.topic is None:
                continue
            for zone_id in operation.topic.zones:
                if zone_id in known_zone_ids:
                    continue
                topic_ids = topics_by_missing_zone.setdefault(zone_id, [])
                if operation.topic.id not in topic_ids:
                    topic_ids.append(operation.topic.id)

        if not topics_by_missing_zone:
            return

        existing_op_ids = {operation.op_id for operation in envelope.operations}
        synthesized_operations: list[GraphOperation] = []
        created_zone_ids: list[str] = []

        for zone_id, topic_ids in topics_by_missing_zone.items():
            op_id = self._next_zone_op_id(zone_id, existing_op_ids)
            existing_op_ids.add(op_id)
            synthesized_operations.append(
                GraphOperation(
                    op_id=op_id,
                    op="upsert_zone",
                    entity_kind="zone",
                    rationale=(
                        "Auto-created because the model assigned proposed topics "
                        f"to zone {zone_id} without declaring that zone."
                    ),
                    zone=ProposalZone(
                        id=zone_id,
                        title=self._humanize_zone_id(zone_id),
                        kind="curriculum_phase",
                        color="#7c8798",
                        intensity=0.38,
                        topic_ids=list(topic_ids),
                    ),
                )
            )
            created_zone_ids.append(zone_id)

        envelope.operations.extend(synthesized_operations)
        if len(created_zone_ids) == 1:
            envelope.warnings.append(
                f"The model mentioned a new zone ({created_zone_ids[0]}) but did not create it, so a structural placeholder zone was added for review."
            )
        else:
            envelope.warnings.append(
                f"The model mentioned new zones ({', '.join(created_zone_ids)}) but did not create them, so structural placeholder zones were added for review."
            )

    def _humanize_zone_id(self, zone_id: str) -> str:
        cleaned = _NON_ALNUM_RE.sub(" ", (zone_id or "").strip()).strip()
        if not cleaned:
            return "Untitled zone"
        return " ".join(part.capitalize() for part in cleaned.split())

    def _next_zone_op_id(self, zone_id: str, existing_op_ids: set[str]) -> str:
        base = _NON_ALNUM_RE.sub("-", zone_id.strip().lower()).strip("-") or "zone"
        candidate = f"auto-zone-{base}"
        counter = 2
        while candidate in existing_op_ids:
            candidate = f"auto-zone-{base}-{counter}"
            counter += 1
        return candidate
