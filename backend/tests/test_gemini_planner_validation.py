from __future__ import annotations

import unittest

from app.models.domain import GraphOperation, GraphProposalEnvelope, ProposalEdge, ProposalIntent, ProposalSourceBundle, ProposalZone
from app.services.bootstrap import build_seed_workspace
from app.services.gemini_planner import GeminiPlanner, GeminiPlannerError


class GeminiPlannerValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.graph = next(graph for graph in build_seed_workspace().graphs if graph.graph_id == "mathematics-demo")
        self.planner = GeminiPlanner.__new__(GeminiPlanner)

    def _proposal(self, *operations: GraphOperation) -> GraphProposalEnvelope:
        return GraphProposalEnvelope(
            graph_id=self.graph.graph_id,
            mode="expand_goal",
            intent=ProposalIntent(user_prompt="test"),
            source_bundle=ProposalSourceBundle(),
            summary="test",
            assistant_message="test",
            operations=list(operations),
        )

    def test_connected_proposal_is_allowed(self) -> None:
        proposal = self._proposal(
            GraphOperation(
                op_id="edge_1",
                op="upsert_edge",
                entity_kind="edge",
                rationale="connect vectors to embeddings",
                edge=ProposalEdge(
                    id="edge-extra-connected",
                    source_topic_id="vectors-geometry",
                    target_topic_id="embeddings",
                    relation="supports",
                ),
            )
        )

        self.planner._validate_proposal_envelope(self.graph, proposal)

    def test_system_instruction_mentions_disconnected_islands_error(self) -> None:
        instruction = self.planner._build_system_instruction()

        self.assertIn(
            'proposal would create disconnected graph islands; link new topics through meaningful prerequisites',
            instruction,
        )

    def test_disconnected_edge_is_rejected(self) -> None:
        proposal = self._proposal(
            GraphOperation(
                op_id="topic_1",
                op="upsert_topic",
                entity_kind="topic",
                rationale="new isolated topic",
                topic={
                    "id": "isolated-topic",
                    "title": "Isolated topic",
                    "slug": "isolated-topic",
                    "description": "should not float alone",
                    "level": 2,
                    "state": "not_started",
                    "zones": [],
                    "resources": [],
                },
            )
        )

        with self.assertRaisesRegex(GeminiPlannerError, "disconnected graph islands"):
            self.planner._validate_proposal_envelope(self.graph, proposal)

    def test_singleton_new_zone_becomes_warning(self) -> None:
        proposal = self._proposal(
            GraphOperation(
                op_id="zone_1",
                op="upsert_zone",
                entity_kind="zone",
                rationale="too narrow",
                zone=ProposalZone(
                    id="new-single-zone",
                    title="Tiny zone",
                    kind="review",
                    color="#ffd166",
                    topic_ids=["functions"],
                ),
            )
        )

        self.planner._validate_proposal_envelope(self.graph, proposal)
        self.assertTrue(any("only cover one topic" in warning for warning in proposal.warnings))

    def test_zone_with_unknown_topic_is_rejected(self) -> None:
        proposal = self._proposal(
            GraphOperation(
                op_id="zone_2",
                op="upsert_zone",
                entity_kind="zone",
                rationale="bad references",
                zone=ProposalZone(
                    id="new-zone",
                    title="Bad zone",
                    kind="review",
                    color="#ffd166",
                    topic_ids=["functions", "missing-topic"],
                ),
            )
        )

        with self.assertRaisesRegex(GeminiPlannerError, "unknown topics"):
            self.planner._validate_proposal_envelope(self.graph, proposal)

    def test_topic_with_unknown_zone_is_rejected(self) -> None:
        proposal = self._proposal(
            GraphOperation(
                op_id="topic_2",
                op="upsert_topic",
                entity_kind="topic",
                rationale="bad zone reference",
                topic={
                    "id": "limits",
                    "title": "Limits",
                    "slug": "limits",
                    "zones": ["missing-zone"],
                },
            )
        )

        with self.assertRaisesRegex(GeminiPlannerError, "unknown zones"):
            self.planner._validate_proposal_envelope(self.graph, proposal)

    def test_remove_operation_is_rejected(self) -> None:
        proposal = self._proposal(
            GraphOperation(
                op_id="remove_1",
                op="remove_topic",
                entity_kind="topic",
                rationale="should not be allowed through proposal envelopes",
                topic_id="functions",
            )
        )

        with self.assertRaisesRegex(GeminiPlannerError, "not allowed in proposal envelopes"):
            self.planner._validate_proposal_envelope(self.graph, proposal)


if __name__ == "__main__":
    unittest.main()
