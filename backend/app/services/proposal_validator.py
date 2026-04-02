from __future__ import annotations

from urllib.parse import urlparse

from app.models.domain import ApplyValidation, GraphProposalEnvelope, ResourceLink, StudyGraph


ALLOWED_PROPOSAL_OPERATIONS = {
    "upsert_topic",
    "upsert_edge",
    "upsert_zone",
    "set_mastery",
}


class ProposalValidator:
    def validate(self, envelope: GraphProposalEnvelope, graph: StudyGraph) -> ApplyValidation:
        errors: list[str] = []
        warnings: list[str] = list(envelope.warnings)

        if envelope.graph_id != graph.graph_id:
            errors.append("Gemini returned proposal for the wrong graph")

        existing_topic_ids = {topic.id for topic in graph.topics}
        proposed_topic_ids = {
            operation.topic.id
            for operation in envelope.operations
            if operation.topic is not None
        }
        known_topic_ids = existing_topic_ids | proposed_topic_ids
        existing_zone_ids = {zone.id for zone in graph.zones}
        proposed_zone_ids = {
            operation.zone.id
            for operation in envelope.operations
            if operation.zone is not None
        }
        known_zone_ids = existing_zone_ids | proposed_zone_ids

        for operation in envelope.operations:
            if operation.op not in ALLOWED_PROPOSAL_OPERATIONS:
                errors.append(f"{operation.op_id}: operation {operation.op} is not allowed in proposal envelopes")
                continue

            if operation.op == "upsert_topic":
                if operation.topic is None:
                    errors.append(f"{operation.op_id}: upsert_topic missing topic payload")
                    continue
                operation.topic.resources = self._sanitize_resources(operation.topic.resources)
                unknown_topic_zone_ids = [zone_id for zone_id in operation.topic.zones if zone_id not in known_zone_ids]
                if unknown_topic_zone_ids:
                    errors.append(
                        f"{operation.op_id}: topic {operation.topic.id} references unknown zones: {', '.join(sorted(unknown_topic_zone_ids))}"
                    )
                continue

            if operation.op == "upsert_edge":
                if operation.edge is None:
                    errors.append(f"{operation.op_id}: upsert_edge missing edge payload")
                    continue
                if operation.edge.source_topic_id not in known_topic_ids:
                    errors.append(f"{operation.op_id}: edge source topic {operation.edge.source_topic_id} is unknown")
                if operation.edge.target_topic_id not in known_topic_ids:
                    errors.append(f"{operation.op_id}: edge target topic {operation.edge.target_topic_id} is unknown")
                continue

            if operation.op == "upsert_zone":
                if operation.zone is None:
                    errors.append(f"{operation.op_id}: upsert_zone missing zone payload")
                    continue
                unknown_zone_topic_ids = [topic_id for topic_id in operation.zone.topic_ids if topic_id not in known_topic_ids]
                if unknown_zone_topic_ids:
                    errors.append(
                        f"{operation.op_id}: zone {operation.zone.id} references unknown topics: {', '.join(sorted(unknown_zone_topic_ids))}"
                    )
                if len(operation.zone.topic_ids) < 2 and operation.zone.id not in existing_zone_ids:
                    warnings.append(
                        "Some proposed zones only cover one topic; zones should usually represent larger learning regions."
                    )
                continue

            if operation.op == "set_mastery":
                if not (operation.topic_id and operation.state):
                    errors.append(f"{operation.op_id}: set_mastery missing topic_id or state")
                    continue
                if operation.topic_id not in known_topic_ids:
                    errors.append(f"{operation.op_id}: mastery topic {operation.topic_id} is unknown")
                if operation.state == "mastered":
                    errors.append(f"{operation.op_id}: proposal generation cannot directly master topics")

        if not errors and not self._is_connected_after_apply(graph, envelope):
            errors.append("proposal would create disconnected graph islands; link new topics through meaningful prerequisites")

        return ApplyValidation(ok=not errors, errors=errors, warnings=self._dedupe_preserving_order(warnings))

    def _sanitize_resources(self, resources: list[ResourceLink]) -> list[ResourceLink]:
        sanitized: list[ResourceLink] = []
        for resource in resources:
            if not resource.label:
                continue
            if not self._is_safe_resource_url(resource.url):
                continue
            sanitized.append(resource)
        return sanitized

    def _is_safe_resource_url(self, value: str) -> bool:
        normalized = (value or "").strip()
        if not normalized:
            return False
        try:
            parsed = urlparse(normalized)
        except Exception:
            return False
        if parsed.scheme.lower() not in {"http", "https"}:
            return False
        if not parsed.netloc:
            return False
        return True

    def _is_connected_after_apply(self, graph: StudyGraph, proposal: GraphProposalEnvelope) -> bool:
        topic_ids = {topic.id for topic in graph.topics}
        adjacency: dict[str, set[str]] = {topic.id: set() for topic in graph.topics}

        for operation in proposal.operations:
            if operation.topic is not None:
                topic_ids.add(operation.topic.id)
                adjacency.setdefault(operation.topic.id, set())

        for edge in graph.edges:
            if edge.source_topic_id in topic_ids and edge.target_topic_id in topic_ids:
                adjacency.setdefault(edge.source_topic_id, set()).add(edge.target_topic_id)
                adjacency.setdefault(edge.target_topic_id, set()).add(edge.source_topic_id)

        for operation in proposal.operations:
            if operation.edge is None:
                continue
            adjacency.setdefault(operation.edge.source_topic_id, set()).add(operation.edge.target_topic_id)
            adjacency.setdefault(operation.edge.target_topic_id, set()).add(operation.edge.source_topic_id)

        if len(topic_ids) <= 1:
            return True

        start_topic_id = next(iter(topic_ids))
        visited: set[str] = set()
        stack = [start_topic_id]
        while stack:
            current = stack.pop()
            if current in visited:
                continue
            visited.add(current)
            stack.extend(adjacency.get(current, set()) - visited)
        return visited == topic_ids

    def _dedupe_preserving_order(self, items: list[str]) -> list[str]:
        seen: set[str] = set()
        deduped: list[str] = []
        for item in items:
            if item in seen:
                continue
            seen.add(item)
            deduped.append(item)
        return deduped
