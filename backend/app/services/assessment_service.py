from __future__ import annotations

from app.models.domain import GraphAssessment, GraphAssessmentCard, StudyGraph


class AssessmentService:
    def assess_graph(self, graph: StudyGraph) -> GraphAssessment:
        topic_count = len(graph.topics)
        if topic_count == 0:
            return GraphAssessment(
                graph_id=graph.graph_id,
                cards=[
                    GraphAssessmentCard(
                        label="Roadmap",
                        value="Empty graph",
                        tone="warn",
                        rationale="This subject graph has no topics yet.",
                    ),
                    GraphAssessmentCard(
                        label="Level Achieved",
                        value="No baseline",
                        tone="warn",
                        rationale="No completed topics exist yet.",
                    ),
                ],
            )

        closed_count = sum(1 for topic in graph.topics if topic.state in {"solid", "mastered"})
        review_count = sum(1 for topic in graph.topics if topic.state in {"needs_review", "shaky"})
        max_level = max((topic.level for topic in graph.topics), default=0)
        closed_levels = [topic.level for topic in graph.topics if topic.state in {"solid", "mastered"}]
        achieved_level = max(closed_levels, default=-1)
        closure_ratio = closed_count / topic_count

        if topic_count >= 12 and max_level >= 5:
            roadmap_value = "Broad runway"
            roadmap_tone = "good"
            roadmap_reason = "The graph already spans multiple layers and has enough width for a longer track."
        elif topic_count >= 6 and max_level >= 3:
            roadmap_value = "Usable runway"
            roadmap_tone = "neutral"
            roadmap_reason = "The graph has enough structure to study and expand safely."
        else:
            roadmap_value = "Thin runway"
            roadmap_tone = "warn"
            roadmap_reason = "The graph still needs more breadth or depth before it feels like a full roadmap."

        if achieved_level >= 4:
            level_value = "ML-adjacent base"
            level_tone = "good"
        elif achieved_level >= 2:
            level_value = "Secondary-school core"
            level_tone = "neutral"
        elif achieved_level >= 0:
            level_value = "Early foundation"
            level_tone = "warn"
        else:
            level_value = "Not closed yet"
            level_tone = "warn"

        cards = [
            GraphAssessmentCard(
                label="Roadmap",
                value=roadmap_value,
                tone=roadmap_tone,
                rationale=roadmap_reason,
            ),
            GraphAssessmentCard(
                label="Level Achieved",
                value=level_value,
                tone=level_tone,
                rationale="This is estimated from the deepest layer whose prerequisite chain is already closed.",
            ),
            GraphAssessmentCard(
                label="Closure",
                value=f"{round(closure_ratio * 100)}%",
                tone="good" if closure_ratio >= 0.5 else "neutral" if closure_ratio >= 0.2 else "warn",
                rationale="Share of topics currently marked solid or mastered.",
            ),
        ]
        if review_count > 0:
            cards.append(
                GraphAssessmentCard(
                    label="Review Pressure",
                    value=str(review_count),
                    tone="warn",
                    rationale="Topics currently marked shaky or needing review.",
                )
            )
        return GraphAssessment(graph_id=graph.graph_id, cards=cards)
