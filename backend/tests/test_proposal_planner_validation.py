from __future__ import annotations

import unittest

from app.models.domain import GraphOperation, GraphProposalEnvelope, ProposalEdge, ProposalIntent, ProposalSourceBundle, ProposalZone
from app.services.bootstrap import build_seed_workspace
from app.services.proposal_planner import ProposalPlanner, ProposalPlannerError
from app.services.proposal_validator import ProposalValidator


class ProposalPlannerValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.graph = next(graph for graph in build_seed_workspace().graphs if graph.graph_id == "mathematics-demo")
        self.planner = ProposalPlanner.__new__(ProposalPlanner)
        self.validator = ProposalValidator()

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

        with self.assertRaisesRegex(ProposalPlannerError, "disconnected graph islands"):
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

        with self.assertRaisesRegex(ProposalPlannerError, "unknown topics"):
            self.planner._validate_proposal_envelope(self.graph, proposal)

    def test_topic_with_unknown_zone_is_materialized_as_zone_with_warning(self) -> None:
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
            ),
            GraphOperation(
                op_id="edge_2",
                op="upsert_edge",
                entity_kind="edge",
                rationale="connect limits into the existing graph",
                edge=ProposalEdge(
                    id="edge-limits-functions",
                    source_topic_id="functions",
                    target_topic_id="limits",
                    relation="requires",
                ),
            )
        )

        self.planner._validate_proposal_envelope(self.graph, proposal)
        self.assertTrue(any("mentioned a new zone" in warning or "mentioned new zones" in warning for warning in proposal.warnings))
        created_zone = next(
            operation.zone for operation in proposal.operations if operation.zone is not None and operation.zone.id == "missing-zone"
        )
        self.assertEqual(created_zone.title, "Missing Zone")
        self.assertEqual(created_zone.topic_ids, ["limits"])

    def test_raw_validator_still_rejects_unknown_zone_without_repair(self) -> None:
        proposal = self._proposal(
            GraphOperation(
                op_id="topic_3",
                op="upsert_topic",
                entity_kind="topic",
                rationale="bad zone reference",
                topic={
                    "id": "integrals",
                    "title": "Integrals",
                    "slug": "integrals",
                    "zones": ["missing-zone"],
                },
            )
        )

        validation = self.validator.validate(proposal, self.graph)
        self.assertFalse(validation.ok)
        self.assertTrue(any("unknown zones" in error for error in validation.errors))

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

        with self.assertRaisesRegex(ProposalPlannerError, "not allowed in proposal envelopes"):
            self.planner._validate_proposal_envelope(self.graph, proposal)


if __name__ == "__main__":
    unittest.main()
