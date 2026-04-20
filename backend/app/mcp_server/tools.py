"""Pure read-only tool implementations for the MapMind MCP server.

These functions take a WorkspaceDocument (loaded by server.py from the
repository) and return plain dicts. They do not touch the LLM layer and do
not mutate the workspace in any way.
"""
from __future__ import annotations

from typing import Any

from app.models.domain import (
    Edge,
    QuizAttempt,
    StudyGraph,
    Topic,
    WorkspaceDocument,
)


IN_PROGRESS_STATES = {"learning", "shaky", "needs_review"}
CLOSED_STATES = {"solid", "mastered"}


def _find_graph(workspace: WorkspaceDocument, graph_id: str | None) -> StudyGraph:
    if graph_id is None:
        if workspace.active_graph_id is not None:
            for graph in workspace.graphs:
                if graph.graph_id == workspace.active_graph_id:
                    return graph
        if workspace.graphs:
            return workspace.graphs[0]
        raise ValueError("workspace has no graphs")
    for graph in workspace.graphs:
        if graph.graph_id == graph_id:
            return graph
    raise ValueError(f"graph '{graph_id}' not found")


def _find_topic(graph: StudyGraph, node_id_or_slug: str) -> Topic:
    for topic in graph.topics:
        if topic.id == node_id_or_slug or topic.slug == node_id_or_slug:
            return topic
    raise ValueError(f"node '{node_id_or_slug}' not found in graph '{graph.graph_id}'")


def _prerequisite_parent_map(graph: StudyGraph) -> dict[str, list[str]]:
    parent_map: dict[str, list[str]] = {topic.id: [] for topic in graph.topics}
    for edge in graph.edges:
        if edge.relation == "requires":
            parent_map.setdefault(edge.target_topic_id, []).append(edge.source_topic_id)
    return parent_map


def _blocked_prerequisite_ids(graph: StudyGraph, topic_id: str) -> list[str]:
    topic_state_by_id = {topic.id: topic.state for topic in graph.topics}
    parent_map = _prerequisite_parent_map(graph)
    seen: set[str] = set()
    prerequisite_ids: list[str] = []
    stack = list(parent_map.get(topic_id, []))
    while stack:
        current = stack.pop()
        if current in seen:
            continue
        seen.add(current)
        prerequisite_ids.append(current)
        stack.extend(parent_map.get(current, []))
    return [pid for pid in prerequisite_ids if topic_state_by_id.get(pid) not in CLOSED_STATES]


def _progress_summary(graph: StudyGraph) -> dict[str, int]:
    summary = {"total": len(graph.topics)}
    counts: dict[str, int] = {}
    for topic in graph.topics:
        counts[topic.state] = counts.get(topic.state, 0) + 1
    summary["closed"] = counts.get("solid", 0) + counts.get("mastered", 0)
    summary["in_progress"] = sum(counts.get(s, 0) for s in IN_PROGRESS_STATES)
    summary["not_started"] = counts.get("not_started", 0)
    return summary


def _brief_topic(topic: Topic, graph_id: str, extras: dict[str, Any] | None = None) -> dict[str, Any]:
    brief = {
        "graph_id": graph_id,
        "node_id": topic.id,
        "slug": topic.slug,
        "title": topic.title,
        "state": topic.state,
        "level": topic.level,
    }
    if extras:
        brief.update(extras)
    return brief


def list_graphs(workspace: WorkspaceDocument) -> dict[str, Any]:
    """Return every graph in the workspace with light progress stats."""
    graphs = []
    for graph in workspace.graphs:
        progress = _progress_summary(graph)
        graphs.append(
            {
                "graph_id": graph.graph_id,
                "title": graph.title,
                "subject": graph.subject,
                "language": graph.language,
                "is_active": graph.graph_id == workspace.active_graph_id,
                "topic_count": progress["total"],
                "closed_count": progress["closed"],
                "in_progress_count": progress["in_progress"],
            }
        )
    return {
        "workspace_title": workspace.title,
        "active_graph_id": workspace.active_graph_id,
        "graphs": graphs,
    }


def _single_graph_context(
    workspace: WorkspaceDocument,
    graph: StudyGraph,
    recent_quiz_limit: int,
) -> dict[str, Any]:
    topic_by_id = {topic.id: topic for topic in graph.topics}

    in_progress = [
        _brief_topic(topic, graph.graph_id)
        for topic in graph.topics
        if topic.state in IN_PROGRESS_STATES
    ]

    blocked: list[dict[str, Any]] = []
    for topic in graph.topics:
        if topic.state in CLOSED_STATES:
            continue
        blocked_ids = _blocked_prerequisite_ids(graph, topic.id)
        if not blocked_ids:
            continue
        blocked.append(
            _brief_topic(
                topic,
                graph.graph_id,
                extras={
                    "blocked_by": [
                        {
                            "node_id": pid,
                            "title": topic_by_id[pid].title if pid in topic_by_id else pid,
                            "state": topic_by_id[pid].state if pid in topic_by_id else "unknown",
                        }
                        for pid in blocked_ids
                    ]
                },
            )
        )

    sorted_attempts = sorted(
        graph.quiz_attempts,
        key=lambda attempt: attempt.created_at,
        reverse=True,
    )[:recent_quiz_limit]
    recent_quizzes = [
        {
            "node_id": attempt.topic_id,
            "title": topic_by_id[attempt.topic_id].title
            if attempt.topic_id in topic_by_id
            else attempt.topic_id,
            "passed": attempt.passed,
            "score": round(attempt.score, 3),
            "closure_awarded": attempt.closure_awarded,
            "created_at": attempt.created_at.isoformat(),
        }
        for attempt in sorted_attempts
    ]

    return {
        "graph_id": graph.graph_id,
        "graph_title": graph.title,
        "subject": graph.subject,
        "is_active_graph": graph.graph_id == workspace.active_graph_id,
        "progress": _progress_summary(graph),
        "in_progress_topics": in_progress,
        "blocked_topics": blocked,
        "recent_quizzes": recent_quizzes,
    }


def get_current_context(
    workspace: WorkspaceDocument,
    graph_id: str | None = None,
    recent_quiz_limit: int = 5,
) -> dict[str, Any]:
    """Summarize what the user is currently working on.

    When graph_id is given, returns detail for that one graph.
    When graph_id is omitted, returns a per-graph summary for the active
    graph plus every other graph that has at least one in-progress topic
    or recent quiz attempt, so the caller sees the full picture across
    the user's multiple graphs (for example math, projects, languages).
    Empty graphs that are not active are skipped.
    """
    if graph_id is not None:
        graph = _find_graph(workspace, graph_id)
        return _single_graph_context(workspace, graph, recent_quiz_limit)

    if not workspace.graphs:
        return {
            "active_graph_id": None,
            "workspace_title": workspace.title,
            "graphs": [],
            "note": "workspace has no graphs",
        }

    per_graph: list[dict[str, Any]] = []
    for graph in workspace.graphs:
        summary = _single_graph_context(workspace, graph, recent_quiz_limit)
        has_activity = bool(
            summary["in_progress_topics"]
            or summary["recent_quizzes"]
        )
        is_active = graph.graph_id == workspace.active_graph_id
        if is_active or has_activity:
            per_graph.append(summary)

    return {
        "active_graph_id": workspace.active_graph_id,
        "workspace_title": workspace.title,
        "graphs": per_graph,
        "note": (
            "Returned active graph and every other graph with learning "
            "activity. Pass graph_id to drill into one specific graph."
        ),
    }


def _neighbor_info(edge: Edge, from_topic_id: str, topic_by_id: dict[str, Topic]) -> dict[str, Any] | None:
    if edge.source_topic_id == from_topic_id:
        other_id = edge.target_topic_id
        direction = "outgoing"
    elif edge.target_topic_id == from_topic_id:
        other_id = edge.source_topic_id
        direction = "incoming"
    else:
        return None
    other = topic_by_id.get(other_id)
    if other is None:
        return None
    return {
        "node_id": other.id,
        "title": other.title,
        "state": other.state,
        "relation": edge.relation,
        "direction": direction,
        "rationale": edge.rationale or None,
    }


def get_node(
    workspace: WorkspaceDocument,
    graph_id: str,
    node_id: str,
) -> dict[str, Any]:
    """Return full content of one topic + its neighbors and blockers."""
    graph = _find_graph(workspace, graph_id)
    topic = _find_topic(graph, node_id)
    topic_by_id = {item.id: item for item in graph.topics}

    neighbors: list[dict[str, Any]] = []
    for edge in graph.edges:
        info = _neighbor_info(edge, topic.id, topic_by_id)
        if info is not None:
            neighbors.append(info)

    blocked_ids = _blocked_prerequisite_ids(graph, topic.id)
    blocked_by = [
        {
            "node_id": pid,
            "title": topic_by_id[pid].title if pid in topic_by_id else pid,
            "state": topic_by_id[pid].state if pid in topic_by_id else "unknown",
        }
        for pid in blocked_ids
    ]

    return {
        "graph_id": graph.graph_id,
        "node_id": topic.id,
        "slug": topic.slug,
        "title": topic.title,
        "description": topic.description,
        "state": topic.state,
        "difficulty": topic.difficulty,
        "estimated_minutes": topic.estimated_minutes,
        "level": topic.level,
        "zones": topic.zones,
        "resources": [
            {"label": r.label, "url": r.url, "kind": r.kind} for r in topic.resources
        ],
        "artifacts": [
            {"title": a.title, "kind": a.kind, "body": a.body} for a in topic.artifacts
        ],
        "neighbors": neighbors,
        "blocked_by": blocked_by,
        "can_close": len(blocked_by) == 0 and topic.state not in CLOSED_STATES,
    }


def _snippet(text: str, needle: str, radius: int = 80) -> str:
    if not text:
        return ""
    lowered = text.lower()
    idx = lowered.find(needle.lower())
    if idx < 0:
        return text[: 2 * radius].strip()
    start = max(0, idx - radius)
    end = min(len(text), idx + len(needle) + radius)
    prefix = "..." if start > 0 else ""
    suffix = "..." if end < len(text) else ""
    return f"{prefix}{text[start:end].strip()}{suffix}"


def _score_match(topic: Topic, needle: str) -> float:
    needle_lower = needle.lower()
    title_lower = topic.title.lower()
    if title_lower == needle_lower:
        return 3.0
    if needle_lower in title_lower:
        return 2.0 + (1.0 if title_lower.startswith(needle_lower) else 0.0)
    if needle_lower in topic.slug.lower():
        return 1.5
    if needle_lower in topic.description.lower():
        return 1.0
    return 0.0


def search_nodes(
    workspace: WorkspaceDocument,
    query: str,
    graph_id: str | None = None,
    limit: int = 12,
) -> dict[str, Any]:
    """Case-insensitive substring search over titles, slugs, and descriptions.

    If graph_id is omitted, searches across every graph in the workspace.
    """
    normalized = query.strip()
    if not normalized:
        return {"query": query, "results": []}

    graphs_to_search: list[StudyGraph]
    if graph_id is None:
        graphs_to_search = list(workspace.graphs)
    else:
        graphs_to_search = [_find_graph(workspace, graph_id)]

    scored: list[tuple[float, dict[str, Any]]] = []
    for graph in graphs_to_search:
        for topic in graph.topics:
            score = _score_match(topic, normalized)
            if score <= 0:
                continue
            scored.append(
                (
                    score,
                    {
                        "graph_id": graph.graph_id,
                        "graph_title": graph.title,
                        "node_id": topic.id,
                        "slug": topic.slug,
                        "title": topic.title,
                        "state": topic.state,
                        "snippet": _snippet(topic.description, normalized),
                        "score": score,
                    },
                )
            )

    scored.sort(key=lambda pair: pair[0], reverse=True)
    results = [item for _, item in scored[:limit]]
    return {"query": query, "results": results, "total_matches": len(scored)}
