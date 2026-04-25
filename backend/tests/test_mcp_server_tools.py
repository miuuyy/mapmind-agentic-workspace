from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.mcp_server import tools
from app.services.repository import GraphRepository


class MpcServerToolsTests(unittest.TestCase):
    def setUp(self) -> None:
        tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(tempdir.cleanup)
        self.repository = GraphRepository(Path(tempdir.name) / "state.sqlite3")
        self.workspace = self.repository.current().workspace

    def test_list_graphs_returns_seeded_graph(self) -> None:
        result = tools.list_graphs(self.workspace)

        self.assertEqual(result["active_graph_id"], "mathematics-demo")
        self.assertEqual(len(result["graphs"]), 1)
        self.assertEqual(result["graphs"][0]["graph_id"], "mathematics-demo")

    def test_get_current_context_aggregates_active_graph(self) -> None:
        result = tools.get_current_context(self.workspace)

        self.assertEqual(result["active_graph_id"], "mathematics-demo")
        self.assertEqual(len(result["graphs"]), 1)
        self.assertIn("in_progress_topics", result["graphs"][0])

    def test_get_node_returns_neighbors_and_blockers(self) -> None:
        result = tools.get_node(self.workspace, graph_id="mathematics-demo", node_id="functions")

        self.assertEqual(result["node_id"], "functions")
        self.assertTrue(any(item["relation"] == "requires" for item in result["neighbors"]))
        self.assertIn("blocked_by", result)

    def test_search_notes_matches_title_and_description(self) -> None:
        result = tools.search_nodes(self.workspace, query="functions")

        self.assertGreaterEqual(result["total_matches"], 1)
        self.assertEqual(result["results"][0]["node_id"], "functions")
