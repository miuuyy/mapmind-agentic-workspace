from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator
import re
import uuid

from app.llm.catalog import provider_default_model, provider_model_options, supported_provider_ids
from app.models.api import GraphExportPackage
from app.models.domain import Artifact, ChatMessage, CreateGraphRequest, Edge, GraphChatThread, GraphProposal, GraphSummary, MEMORY_MODE_PRESETS, PatchOperation, QuizAttempt, ResourceLink, THINKING_MODE_TOKEN_PRESETS, TopicQuizSession, SnapshotRecord, StudyGraph, Topic, UpdateWorkspaceConfigRequest, WorkspaceDocument, WorkspaceEnvelope, Zone
from app.services.bootstrap import build_seed_workspace


class ChatSessionNotFoundError(KeyError):
    def __init__(self, graph_id: str, session_id: str):
        super().__init__(f"session {session_id} not found in graph {graph_id}")
        self.graph_id = graph_id
        self.session_id = session_id


class ChatSessionDeletionError(ValueError):
    pass


class GraphRepository:
    def __init__(self, db_path: Path):
        self._db_path = db_path
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
        self._ensure_seed()

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS graph_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    source TEXT NOT NULL,
                    reason TEXT,
                    parent_snapshot_id INTEGER,
                    payload_json TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS graph_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS quiz_sessions (
                    session_id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    graph_id TEXT NOT NULL,
                    topic_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS chat_sessions (
                    session_id TEXT PRIMARY KEY,
                    graph_id TEXT NOT NULL,
                    topic_id TEXT,
                    title TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS chat_messages (
                    ordinal INTEGER PRIMARY KEY AUTOINCREMENT,
                    message_id TEXT NOT NULL UNIQUE,
                    session_id TEXT NOT NULL,
                    graph_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    role TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    FOREIGN KEY(session_id) REFERENCES chat_sessions(session_id)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS workspace_secrets (
                    workspace_id TEXT PRIMARY KEY,
                    gemini_api_key TEXT,
                    openai_api_key TEXT,
                    updated_at TEXT NOT NULL
                )
                """
            )
            # Rebuild chat_sessions if an old schema still enforces one session per graph.
            schema_sql = conn.execute(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='chat_sessions'"
            ).fetchone()
            if schema_sql and "UNIQUE" in str(schema_sql[0]):
                conn.execute("ALTER TABLE chat_sessions RENAME TO _chat_sessions_old")
                conn.execute("""
                    CREATE TABLE chat_sessions (
                        session_id TEXT PRIMARY KEY,
                        graph_id TEXT NOT NULL,
                        topic_id TEXT,
                        title TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                """)
                conn.execute("""
                    INSERT INTO chat_sessions (session_id, graph_id, topic_id, title, created_at, updated_at)
                    SELECT session_id, graph_id, NULL, NULL, created_at, updated_at
                    FROM _chat_sessions_old
                """)
                conn.execute("DROP TABLE _chat_sessions_old")
            else:
                cols = {row[1] for row in conn.execute("PRAGMA table_info(chat_sessions)").fetchall()}
                if "topic_id" not in cols:
                    conn.execute("ALTER TABLE chat_sessions ADD COLUMN topic_id TEXT")
                if "title" not in cols:
                    conn.execute("ALTER TABLE chat_sessions ADD COLUMN title TEXT")
            self._migrate_workspace_secrets(conn)

    def _ensure_seed(self) -> None:
        with self._connect() as conn:
            row = conn.execute("SELECT id FROM graph_snapshots ORDER BY id DESC LIMIT 1").fetchone()
            if row is None:
                self._insert_snapshot(conn, build_seed_workspace(), source="seed", reason="bootstrap workspace", parent_snapshot_id=None)

    def _insert_snapshot(
        self,
        conn: sqlite3.Connection,
        workspace: WorkspaceDocument,
        *,
        source: str,
        reason: str | None,
        parent_snapshot_id: int | None,
    ) -> int:
        payload_json = self._snapshot_workspace_document(workspace).model_dump_json()
        cursor = conn.execute(
            """
            INSERT INTO graph_snapshots (created_at, source, reason, parent_snapshot_id, payload_json)
            VALUES (?, ?, ?, ?, ?)
            """,
            (datetime.now(timezone.utc).isoformat(), source, reason, parent_snapshot_id, payload_json),
        )
        return int(cursor.lastrowid)

    def current(self) -> WorkspaceEnvelope:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, created_at, source, reason, parent_snapshot_id, payload_json
                FROM graph_snapshots
                ORDER BY id DESC
                LIMIT 1
                """
            ).fetchone()
            if row is None:
                raise RuntimeError("graph snapshot missing")
            workspace = self._workspace_document_from_snapshot_row(conn, row)
        snapshot = SnapshotRecord(
            id=int(row["id"]),
            created_at=datetime.fromisoformat(row["created_at"]),
            source=str(row["source"]),
            reason=row["reason"],
            parent_snapshot_id=row["parent_snapshot_id"],
        )
        return WorkspaceEnvelope(snapshot=snapshot, workspace=workspace)

    def graph(self, graph_id: str) -> StudyGraph:
        workspace = self.current().workspace
        for graph in workspace.graphs:
            if graph.graph_id == graph_id:
                return graph
        raise KeyError(graph_id)

    def graph_summaries(self) -> list[GraphSummary]:
        workspace = self.current().workspace
        return [
            GraphSummary(
                graph_id=graph.graph_id,
                subject=graph.subject,
                title=graph.title,
                topic_count=len(graph.topics),
                edge_count=len(graph.edges),
                zone_count=len(graph.zones),
                version=graph.version,
            )
            for graph in workspace.graphs
        ]

    def list_snapshots(self, limit: int = 20) -> list[SnapshotRecord]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, created_at, source, reason, parent_snapshot_id
                FROM graph_snapshots
                ORDER BY id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [
            SnapshotRecord(
                id=int(row["id"]),
                created_at=datetime.fromisoformat(row["created_at"]),
                source=str(row["source"]),
                reason=row["reason"],
                parent_snapshot_id=row["parent_snapshot_id"],
            )
            for row in rows
        ]

    def append_event(self, event_type: str, payload: dict) -> int:
        with self._connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO graph_events (created_at, event_type, payload_json)
                VALUES (?, ?, ?)
                """,
                (datetime.now(timezone.utc).isoformat(), event_type, json.dumps(payload)),
            )
            return int(cursor.lastrowid)

    def save_quiz_session(self, session: TopicQuizSession) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO quiz_sessions (session_id, created_at, graph_id, topic_id, payload_json)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    session.session_id,
                    session.created_at.isoformat(),
                    session.graph_id,
                    session.topic_id,
                    session.model_dump_json(),
                ),
            )

    def quiz_session(self, session_id: str) -> TopicQuizSession:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT payload_json
                FROM quiz_sessions
                WHERE session_id = ?
                """,
                (session_id,),
            ).fetchone()
        if row is None:
            raise KeyError(session_id)
        return TopicQuizSession.model_validate_json(row["payload_json"])

    def latest_quiz_session_for_topic(self, graph_id: str, topic_id: str) -> TopicQuizSession | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT payload_json
                FROM quiz_sessions
                WHERE graph_id = ? AND topic_id = ?
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (graph_id, topic_id),
            ).fetchone()
        if row is None:
            return None
        return TopicQuizSession.model_validate_json(row["payload_json"])

    def delete_quiz_session(self, session_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM quiz_sessions WHERE session_id = ?", (session_id,))

    def _resolve_session(self, conn: sqlite3.Connection, graph_id: str, session_id: str | None) -> sqlite3.Row:
        """Look up a specific chat session or ensure the general one exists."""
        if session_id:
            row = conn.execute(
                "SELECT session_id, graph_id, topic_id, title, created_at, updated_at "
                "FROM chat_sessions WHERE session_id = ? AND graph_id = ?",
                (session_id, graph_id),
            ).fetchone()
            if row is None:
                raise ChatSessionNotFoundError(graph_id, session_id)
            return row
        return self._ensure_chat_session(conn, graph_id)

    @staticmethod
    def _thread_from_session(session_row: sqlite3.Row, graph_id: str, messages: list[ChatMessage]) -> GraphChatThread:
        return GraphChatThread(
            session_id=str(session_row["session_id"]),
            graph_id=graph_id,
            topic_id=session_row["topic_id"],
            title=session_row["title"],
            created_at=datetime.fromisoformat(str(session_row["created_at"])),
            updated_at=datetime.fromisoformat(str(session_row["updated_at"])),
            messages=messages,
        )

    def chat_thread(self, graph_id: str, session_id: str | None = None) -> GraphChatThread:
        with self._connect() as conn:
            session_row = self._resolve_session(conn, graph_id, session_id)
            sid = str(session_row["session_id"])
            rows = conn.execute(
                "SELECT payload_json FROM chat_messages WHERE session_id = ? ORDER BY ordinal ASC",
                (sid,),
            ).fetchall()
        messages = [ChatMessage.model_validate_json(row["payload_json"]) for row in rows]
        return self._thread_from_session(session_row, graph_id, messages)

    def list_chat_sessions(self, graph_id: str) -> list["ChatSessionSummary"]:
        from app.models.domain import ChatSessionSummary
        with self._connect() as conn:
            self._ensure_chat_session(conn, graph_id)
            rows = conn.execute(
                """
                SELECT s.session_id, s.graph_id, s.topic_id, s.title, s.created_at, s.updated_at,
                       (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.session_id) as message_count
                FROM chat_sessions s
                WHERE s.graph_id = ?
                ORDER BY s.topic_id IS NOT NULL, s.updated_at DESC
                """,
                (graph_id,),
            ).fetchall()
        return [
            ChatSessionSummary(
                session_id=str(row["session_id"]),
                graph_id=graph_id,
                topic_id=row["topic_id"],
                title=row["title"],
                created_at=datetime.fromisoformat(str(row["created_at"])),
                updated_at=datetime.fromisoformat(str(row["updated_at"])),
                message_count=row["message_count"],
            )
            for row in rows
        ]

    def create_chat_session(self, graph_id: str, topic_id: str | None = None, title: str | None = None) -> "ChatSessionSummary":
        from app.models.domain import ChatSessionSummary
        normalized_topic_id = self._normalize_session_topic_id(graph_id, topic_id)
        created_at = datetime.now(timezone.utc).isoformat()
        session_id = f"chat_{uuid.uuid4().hex[:12]}"
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO chat_sessions (session_id, graph_id, topic_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (session_id, graph_id, normalized_topic_id, title, created_at, created_at),
            )
        return ChatSessionSummary(
            session_id=session_id,
            graph_id=graph_id,
            topic_id=normalized_topic_id,
            title=title,
            created_at=datetime.fromisoformat(created_at),
            updated_at=datetime.fromisoformat(created_at),
            message_count=0,
        )

    def delete_chat_session(self, graph_id: str, session_id: str) -> None:
        with self._connect() as conn:
            session_row = self._resolve_session(conn, graph_id, session_id)
            if str(session_row["topic_id"] or "") == "":
                raise ChatSessionDeletionError("default graph thread cannot be deleted")
            conn.execute("DELETE FROM chat_messages WHERE session_id = ?", (session_id,))
            conn.execute("DELETE FROM chat_sessions WHERE session_id = ?", (session_id,))

    def append_chat_message(self, graph_id: str, message: ChatMessage, session_id: str | None = None) -> GraphChatThread:
        persisted_message = ChatMessage.model_validate(
            {
                **message.model_dump(mode="json"),
                "id": message.id or f"msg_{uuid.uuid4().hex[:12]}",
            }
        )
        with self._connect() as conn:
            session_row = self._resolve_session(conn, graph_id, session_id)
            sid = str(session_row["session_id"])
            conn.execute(
                """
                INSERT INTO chat_messages (message_id, session_id, graph_id, created_at, role, payload_json)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    persisted_message.id,
                    sid,
                    graph_id,
                    persisted_message.created_at.isoformat(),
                    persisted_message.role,
                    persisted_message.model_dump_json(),
                ),
            )
            conn.execute(
                "UPDATE chat_sessions SET updated_at = ? WHERE session_id = ?",
                (datetime.now(timezone.utc).isoformat(), sid),
            )
            rows = conn.execute(
                "SELECT payload_json FROM chat_messages WHERE session_id = ? ORDER BY ordinal ASC",
                (sid,),
            ).fetchall()
            refreshed = conn.execute(
                "SELECT session_id, graph_id, topic_id, title, created_at, updated_at "
                "FROM chat_sessions WHERE session_id = ?",
                (sid,),
            ).fetchone()
        messages = [ChatMessage.model_validate_json(row["payload_json"]) for row in rows]
        return self._thread_from_session(refreshed, graph_id, messages)

    def update_chat_message(self, graph_id: str, message: ChatMessage, session_id: str | None = None) -> GraphChatThread:
        if not message.id:
            raise ValueError("chat message id is required for update")
        with self._connect() as conn:
            session_row = self._resolve_session(conn, graph_id, session_id)
            sid = str(session_row["session_id"])
            cursor = conn.execute(
                "UPDATE chat_messages SET payload_json = ?, created_at = ?, role = ? WHERE session_id = ? AND message_id = ?",
                (
                    message.model_dump_json(),
                    message.created_at.isoformat(),
                    message.role,
                    sid,
                    message.id,
                ),
            )
            if cursor.rowcount == 0:
                raise KeyError(message.id)
            conn.execute(
                "UPDATE chat_sessions SET updated_at = ? WHERE session_id = ?",
                (datetime.now(timezone.utc).isoformat(), sid),
            )
            rows = conn.execute(
                "SELECT payload_json FROM chat_messages WHERE session_id = ? ORDER BY ordinal ASC",
                (sid,),
            ).fetchall()
            refreshed = conn.execute(
                "SELECT session_id, graph_id, topic_id, title, created_at, updated_at "
                "FROM chat_sessions WHERE session_id = ?",
                (sid,),
            ).fetchone()
        messages = [ChatMessage.model_validate_json(row["payload_json"]) for row in rows]
        return self._thread_from_session(refreshed, graph_id, messages)

    def apply_proposal(self, proposal: GraphProposal) -> WorkspaceEnvelope:
        current = self.current()
        workspace = WorkspaceDocument.model_validate(deepcopy(current.workspace.model_dump()))
        graph_map = {graph.graph_id: graph for graph in workspace.graphs}
        graph = graph_map.get(proposal.graph_id)
        if graph is None:
            raise ValueError(f"graph {proposal.graph_id} not found")

        topic_map = {topic.id: topic for topic in graph.topics}
        edge_map = {edge.id: edge for edge in graph.edges}
        zone_map = {zone.id: zone for zone in graph.zones}

        for operation in proposal.operations:
            self._apply_operation(operation, topic_map, edge_map, zone_map)

        self._synchronize_zone_memberships(topic_map, zone_map)
        graph.topics = list(topic_map.values())
        graph.edges = list(edge_map.values())
        graph.zones = list(zone_map.values())
        graph.version += 1
        workspace.active_graph_id = graph.graph_id
        graph_map[graph.graph_id] = graph
        workspace.graphs = list(graph_map.values())

        with self._connect() as conn:
            snapshot_id = self._insert_snapshot(
                conn,
                workspace,
                source="proposal.apply",
                reason=proposal.summary,
                parent_snapshot_id=current.snapshot.id,
            )

        return self.snapshot(snapshot_id)

    def snapshot(self, snapshot_id: int) -> WorkspaceEnvelope:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, created_at, source, reason, parent_snapshot_id, payload_json
                FROM graph_snapshots
                WHERE id = ?
                """,
                (snapshot_id,),
            ).fetchone()
            if row is None:
                raise KeyError(snapshot_id)
            workspace = self._workspace_document_from_snapshot_row(conn, row)
        snapshot = SnapshotRecord(
            id=int(row["id"]),
            created_at=datetime.fromisoformat(row["created_at"]),
            source=str(row["source"]),
            reason=row["reason"],
            parent_snapshot_id=row["parent_snapshot_id"],
        )
        return WorkspaceEnvelope(snapshot=snapshot, workspace=workspace)

    def rollback_to(self, snapshot_id: int) -> WorkspaceEnvelope:
        target = self.snapshot(snapshot_id)
        current = self.current()
        workspace = WorkspaceDocument.model_validate(deepcopy(target.workspace.model_dump()))
        for graph in workspace.graphs:
            graph.version += 1
        with self._connect() as conn:
            new_snapshot_id = self._insert_snapshot(
                conn,
                workspace,
                source="rollback",
                reason=f"rollback to snapshot {snapshot_id}",
                parent_snapshot_id=current.snapshot.id,
            )
        return self.snapshot(new_snapshot_id)

    def record_quiz_attempt(self, graph_id: str, attempt: QuizAttempt, awarded_state: str | None) -> WorkspaceEnvelope:
        current = self.current()
        workspace = WorkspaceDocument.model_validate(deepcopy(current.workspace.model_dump()))
        graph_map = {graph.graph_id: graph for graph in workspace.graphs}
        graph = graph_map.get(graph_id)
        if graph is None:
            raise ValueError(f"graph {graph_id} not found")

        topic_map = {topic.id: topic for topic in graph.topics}
        topic = topic_map.get(attempt.topic_id)
        if topic is None:
            raise ValueError(f"topic {attempt.topic_id} not found")

        graph.quiz_attempts = [item for item in graph.quiz_attempts if item.topic_id != attempt.topic_id]
        graph.quiz_attempts.append(attempt)

        if awarded_state is not None:
            topic.state = awarded_state
        elif not attempt.passed:
            topic.state = "needs_review"
        elif topic.state == "not_started":
            topic.state = "learning"

        graph.topics = list(topic_map.values())
        graph.version += 1
        workspace.active_graph_id = graph.graph_id
        graph_map[graph.graph_id] = graph
        workspace.graphs = list(graph_map.values())

        with self._connect() as conn:
            snapshot_id = self._insert_snapshot(
                conn,
                workspace,
                source="quiz.submit",
                reason=f"quiz attempt for {attempt.topic_id}",
                parent_snapshot_id=current.snapshot.id,
            )

        return self.snapshot(snapshot_id)

    def mark_topic_finished(self, graph_id: str, topic_id: str) -> WorkspaceEnvelope:
        current = self.current()
        workspace = WorkspaceDocument.model_validate(deepcopy(current.workspace.model_dump()))
        graph = next((item for item in workspace.graphs if item.graph_id == graph_id), None)
        if graph is None:
            raise ValueError(f"graph {graph_id} not found")
        topic = next((item for item in graph.topics if item.id == topic_id), None)
        if topic is None:
            raise ValueError(f"topic {topic_id} not found")
        parents_by_child: dict[str, list[str]] = {item.id: [] for item in graph.topics}
        for edge in graph.edges:
            if edge.relation != "requires":
                continue
            parents_by_child.setdefault(edge.target_topic_id, []).append(edge.source_topic_id)

        topic_ids_to_close: list[str] = []
        visited: set[str] = set()
        stack = [topic_id]
        while stack:
            current_topic_id = stack.pop()
            if current_topic_id in visited:
                continue
            visited.add(current_topic_id)
            topic_ids_to_close.append(current_topic_id)
            stack.extend(parents_by_child.get(current_topic_id, []))

        topic_map = {item.id: item for item in graph.topics}
        graph.quiz_attempts = [item for item in graph.quiz_attempts if item.topic_id not in visited]
        for current_topic_id in topic_ids_to_close:
            current_topic = topic_map.get(current_topic_id)
            if current_topic is None:
                continue
            current_topic.state = "solid"
            graph.quiz_attempts.append(
                QuizAttempt(
                    id=f"manual-{uuid.uuid4().hex[:12]}",
                    topic_id=current_topic_id,
                    passed=True,
                    score=1.0,
                    question_count=max(1, workspace.config.quiz_question_count),
                    closure_awarded=True,
                )
            )
        graph.version += 1
        workspace.active_graph_id = graph.graph_id

        with self._connect() as conn:
            snapshot_id = self._insert_snapshot(
                conn,
                workspace,
                source="topic.mark_finished",
                reason=f"mark topic {topic.title} finished with prerequisite closure",
                parent_snapshot_id=current.snapshot.id,
            )

        return self.snapshot(snapshot_id)

    def create_graph(self, request: CreateGraphRequest) -> WorkspaceEnvelope:
        current = self.current()
        workspace = WorkspaceDocument.model_validate(deepcopy(current.workspace.model_dump()))
        normalized_title = request.title.strip()
        normalized_subject = request.subject.strip().lower()
        if not normalized_title:
            raise ValueError("graph title is required")
        if not normalized_subject:
            raise ValueError("graph subject is required")

        graph_id = self._unique_graph_id(normalized_title, existing_ids={graph.graph_id for graph in workspace.graphs})
        graph = StudyGraph(
            graph_id=graph_id,
            subject=normalized_subject,
            title=normalized_title,
            language=request.language,
            topics=[],
            edges=[],
            zones=[],
            metadata={"description": request.description.strip()},
        )
        workspace.graphs.append(graph)
        workspace.active_graph_id = graph.graph_id

        with self._connect() as conn:
            self._purge_graph_runtime_state(conn, graph.graph_id)
            snapshot_id = self._insert_snapshot(
                conn,
                workspace,
                source="graph.create",
                reason=f"create graph {graph.title}",
                parent_snapshot_id=current.snapshot.id,
            )
        return self.snapshot(snapshot_id)

    def delete_graph(self, graph_id: str) -> WorkspaceEnvelope:
        current = self.current()
        workspace = WorkspaceDocument.model_validate(deepcopy(current.workspace.model_dump()))
        graph = next((g for g in workspace.graphs if g.graph_id == graph_id), None)
        if graph is None:
            raise ValueError(f"graph {graph_id} not found")
        workspace.graphs = [g for g in workspace.graphs if g.graph_id != graph_id]
        if workspace.active_graph_id == graph_id:
            workspace.active_graph_id = workspace.graphs[0].graph_id if workspace.graphs else None
        with self._connect() as conn:
            self._purge_graph_runtime_state(conn, graph_id)
            snapshot_id = self._insert_snapshot(
                conn,
                workspace,
                source="graph.delete",
                reason=f"delete graph {graph.title}",
                parent_snapshot_id=current.snapshot.id,
            )
        return self.snapshot(snapshot_id)

    def export_graph_package(self, graph_id: str, *, title: str | None = None, include_progress: bool = True) -> GraphExportPackage:
        graph = StudyGraph.model_validate(deepcopy(self.graph(graph_id).model_dump()))
        export_title = (title or graph.title).strip() or graph.title
        if not include_progress:
            for topic in graph.topics:
                topic.state = "not_started"
            graph.quiz_attempts = []
        return GraphExportPackage(
            exported_at=datetime.now(timezone.utc).isoformat(),
            source_graph_id=graph.graph_id,
            title=export_title,
            include_progress=include_progress,
            graph=graph.model_copy(update={"title": export_title}, deep=True),
        )

    def import_graph_package(
        self,
        package: GraphExportPackage,
        *,
        title: str | None = None,
        include_progress: bool = True,
    ) -> WorkspaceEnvelope:
        current = self.current()
        workspace = WorkspaceDocument.model_validate(deepcopy(current.workspace.model_dump()))
        import_title = (title or package.title or package.graph.title).strip()
        if not import_title:
            raise ValueError("graph title is required")

        graph = StudyGraph.model_validate(deepcopy(package.graph.model_dump()))
        graph.title = import_title
        graph.graph_id = self._unique_graph_id(import_title, existing_ids={item.graph_id for item in workspace.graphs})
        graph.generated_at = datetime.now(timezone.utc)
        graph.version = 1
        if not include_progress:
            for topic in graph.topics:
                topic.state = "not_started"
            graph.quiz_attempts = []
        graph.metadata = {
            **graph.metadata,
            "imported_from_graph_id": package.source_graph_id,
            "imported_from_package_kind": package.kind,
            "imported_with_progress": include_progress,
        }

        workspace.graphs.append(graph)
        workspace.active_graph_id = graph.graph_id
        with self._connect() as conn:
            self._purge_graph_runtime_state(conn, graph.graph_id)
            snapshot_id = self._insert_snapshot(
                conn,
                workspace,
                source="graph.import",
                reason=f"import graph {graph.title}",
                parent_snapshot_id=current.snapshot.id,
            )
        return self.snapshot(snapshot_id)

    def rename_graph(self, graph_id: str, title: str) -> WorkspaceEnvelope:
        current = self.current()
        workspace = WorkspaceDocument.model_validate(deepcopy(current.workspace.model_dump()))
        normalized_title = title.strip()
        if not normalized_title:
            raise ValueError("graph title is required")
        graph = next((item for item in workspace.graphs if item.graph_id == graph_id), None)
        if graph is None:
            raise ValueError(f"graph {graph_id} not found")
        graph.title = normalized_title
        with self._connect() as conn:
            snapshot_id = self._insert_snapshot(
                conn,
                workspace,
                source="graph.rename",
                reason=f"rename graph {normalized_title}",
                parent_snapshot_id=current.snapshot.id,
            )
        return self.snapshot(snapshot_id)

    def update_graph_layout(self, graph_id: str, positions: dict[str, dict[str, float]]) -> WorkspaceEnvelope:
        current = self.current()
        workspace = WorkspaceDocument.model_validate(deepcopy(current.workspace.model_dump()))
        graph = next((item for item in workspace.graphs if item.graph_id == graph_id), None)
        if graph is None:
            raise ValueError(f"graph {graph_id} not found")
        graph.metadata["manual_layout_positions"] = {
            topic_id: {"x": float(value["x"]), "y": float(value["y"])}
            for topic_id, value in positions.items()
        }
        graph.metadata["manual_layout_version"] = 2
        with self._connect() as conn:
            snapshot_id = self._insert_snapshot(
                conn,
                workspace,
                source="graph.layout",
                reason=f"update layout for {graph.title}",
                parent_snapshot_id=current.snapshot.id,
            )
        return self.snapshot(snapshot_id)

    def append_topic_resource(self, graph_id: str, topic_id: str, resource: ResourceLink) -> WorkspaceEnvelope:
        current = self.current()
        workspace = WorkspaceDocument.model_validate(deepcopy(current.workspace.model_dump()))
        graph = next((item for item in workspace.graphs if item.graph_id == graph_id), None)
        if graph is None:
            raise ValueError(f"graph {graph_id} not found")
        topic = next((item for item in graph.topics if item.id == topic_id), None)
        if topic is None:
            raise ValueError(f"topic {topic_id} not found")
        topic.resources = self._merge_resources(topic.resources, [resource])
        with self._connect() as conn:
            snapshot_id = self._insert_snapshot(
                conn,
                workspace,
                source="topic.resource",
                reason=f"append resource to {topic.title}",
                parent_snapshot_id=current.snapshot.id,
            )
        return self.snapshot(snapshot_id)

    def append_topic_artifact(self, graph_id: str, topic_id: str, artifact: Artifact) -> WorkspaceEnvelope:
        current = self.current()
        workspace = WorkspaceDocument.model_validate(deepcopy(current.workspace.model_dump()))
        graph = next((item for item in workspace.graphs if item.graph_id == graph_id), None)
        if graph is None:
            raise ValueError(f"graph {graph_id} not found")
        topic = next((item for item in graph.topics if item.id == topic_id), None)
        if topic is None:
            raise ValueError(f"topic {topic_id} not found")
        topic.artifacts = [*topic.artifacts, artifact]
        with self._connect() as conn:
            snapshot_id = self._insert_snapshot(
                conn,
                workspace,
                source="topic.artifact",
                reason=f"append artifact to {topic.title}",
                parent_snapshot_id=current.snapshot.id,
            )
        return self.snapshot(snapshot_id)

    def update_workspace_config(self, request: UpdateWorkspaceConfigRequest) -> WorkspaceEnvelope:
        current = self.current()
        workspace = WorkspaceDocument.model_validate(deepcopy(current.workspace.model_dump()))
        reasons: list[str] = []
        provider_options = supported_provider_ids()
        workspace.config.provider_options = provider_options
        provider_changed = False
        if request.ai_provider is not None:
            provider_id = request.ai_provider.strip().lower()
            if provider_id not in provider_options:
                raise ValueError(f"unsupported provider {request.ai_provider}")
            workspace.config.ai_provider = provider_id
            workspace.config.model_options = provider_model_options(provider_id)
            provider_changed = True
            reasons.append(f"ai provider {provider_id}")
        if request.default_model is not None:
            model_options = provider_model_options(workspace.config.ai_provider)
            workspace.config.model_options = model_options
            normalized_model = request.default_model.strip()
            if not normalized_model:
                raise ValueError("default_model cannot be empty")
            workspace.config.default_model = normalized_model
            reasons.append(f"default model {request.default_model}")
        elif provider_changed:
            model_options = provider_model_options(workspace.config.ai_provider)
            workspace.config.model_options = model_options
            if workspace.config.default_model not in model_options:
                workspace.config.default_model = provider_default_model(workspace.config.ai_provider)
                reasons.append(f"default model {workspace.config.default_model}")
        if request.use_google_search_grounding is not None:
            workspace.config.use_google_search_grounding = request.use_google_search_grounding
            reasons.append(
                "google grounding on" if request.use_google_search_grounding else "google grounding off"
            )
        if request.disable_idle_animations is not None:
            workspace.config.disable_idle_animations = request.disable_idle_animations
            reasons.append("idle animations disabled" if request.disable_idle_animations else "idle animations enabled")
        if request.thinking_mode is not None:
            workspace.config.thinking_mode = request.thinking_mode
            if request.thinking_mode != "custom":
                presets = THINKING_MODE_TOKEN_PRESETS[request.thinking_mode]
                workspace.config.planner_max_output_tokens = presets["planner_max_output_tokens"]
                workspace.config.planner_thinking_budget = presets["planner_thinking_budget"]
                workspace.config.orchestrator_max_output_tokens = presets["orchestrator_max_output_tokens"]
                workspace.config.quiz_max_output_tokens = presets["quiz_max_output_tokens"]
                workspace.config.assistant_max_output_tokens = presets["assistant_max_output_tokens"]
            reasons.append(f"thinking mode {request.thinking_mode}")
        if request.memory_mode is not None:
            workspace.config.memory_mode = request.memory_mode
            if request.memory_mode != "custom":
                memory_preset = MEMORY_MODE_PRESETS[request.memory_mode]
                workspace.config.memory_history_message_limit = int(memory_preset["memory_history_message_limit"])
                workspace.config.memory_include_graph_context = bool(memory_preset["memory_include_graph_context"])
                workspace.config.memory_include_progress_context = bool(memory_preset["memory_include_progress_context"])
                workspace.config.memory_include_quiz_context = bool(memory_preset["memory_include_quiz_context"])
                workspace.config.memory_include_frontier_context = bool(memory_preset["memory_include_frontier_context"])
                workspace.config.memory_include_selected_topic_context = bool(memory_preset["memory_include_selected_topic_context"])
            reasons.append(f"memory mode {request.memory_mode}")
        if request.persona_rules is not None:
            workspace.config.persona_rules = request.persona_rules.strip()
            reasons.append("persona rules updated")
        if request.quiz_question_count is not None:
            if request.quiz_question_count < 6 or request.quiz_question_count > 12:
                raise ValueError("quiz_question_count must be between 6 and 12")
            workspace.config.quiz_question_count = request.quiz_question_count
            reasons.append(f"quiz question count {request.quiz_question_count}")
        if request.pass_threshold is not None:
            if request.pass_threshold <= 0 or request.pass_threshold > 1:
                raise ValueError("pass_threshold must be between 0 and 1")
            workspace.config.pass_threshold = request.pass_threshold
            reasons.append(f"pass threshold {request.pass_threshold:.3f}")
        if request.enable_closure_tests is not None:
            workspace.config.enable_closure_tests = request.enable_closure_tests
            reasons.append("closure tests enabled" if request.enable_closure_tests else "closure tests disabled")
        if request.debug_mode_enabled is not None:
            workspace.config.debug_mode_enabled = request.debug_mode_enabled
            reasons.append("debug mode enabled" if request.debug_mode_enabled else "debug mode disabled")
        memory_fields = [
            ("memory_history_message_limit", request.memory_history_message_limit),
            ("memory_include_graph_context", request.memory_include_graph_context),
            ("memory_include_progress_context", request.memory_include_progress_context),
            ("memory_include_quiz_context", request.memory_include_quiz_context),
            ("memory_include_frontier_context", request.memory_include_frontier_context),
            ("memory_include_selected_topic_context", request.memory_include_selected_topic_context),
        ]
        for field_name, value in memory_fields:
            if value is None:
                continue
            if field_name == "memory_history_message_limit":
                if value < 4 or value > 120:
                    raise ValueError("memory_history_message_limit must be between 4 and 120")
                setattr(workspace.config, field_name, int(value))
            else:
                setattr(workspace.config, field_name, bool(value))
            reasons.append(f"{field_name} updated")
        token_limit_fields = [
            ("planner_max_output_tokens", request.planner_max_output_tokens),
            ("planner_thinking_budget", request.planner_thinking_budget),
            ("orchestrator_max_output_tokens", request.orchestrator_max_output_tokens),
            ("quiz_max_output_tokens", request.quiz_max_output_tokens),
            ("assistant_max_output_tokens", request.assistant_max_output_tokens),
        ]
        for field_name, value in token_limit_fields:
            if value is not None:
                if value < 100:
                    raise ValueError(f"{field_name} must be at least 100")
                setattr(workspace.config, field_name, value)
                reasons.append(f"{field_name}={value}")
        if request.gemini_api_key is not None:
            workspace.config.gemini_api_key = request.gemini_api_key.strip() or None
            reasons.append("gemini api key updated")
        if request.openai_api_key is not None:
            workspace.config.openai_api_key = request.openai_api_key.strip() or None
            reasons.append("openai api key updated")
        if request.openai_base_url is not None:
            normalized = request.openai_base_url.strip().rstrip("/")
            if not normalized:
                raise ValueError("openai_base_url cannot be empty")
            workspace.config.openai_base_url = normalized
            reasons.append("openai base url updated")
        if not reasons:
            raise ValueError("no config fields provided")

        with self._connect() as conn:
            self._save_workspace_secrets(conn, workspace)
            snapshot_id = self._insert_snapshot(
                conn,
                workspace,
                source="workspace.config",
                reason=f"set {'; '.join(reasons)}",
                parent_snapshot_id=current.snapshot.id,
            )
        return self.snapshot(snapshot_id)

    def _unique_graph_id(self, title: str, *, existing_ids: set[str]) -> str:
        slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "graph"
        candidate = slug
        index = 2
        while candidate in existing_ids:
            candidate = f"{slug}-{index}"
            index += 1
        return candidate

    def _ensure_chat_session(self, conn: sqlite3.Connection, graph_id: str) -> sqlite3.Row:
        row = conn.execute(
            """
            SELECT session_id, graph_id, topic_id, title, created_at, updated_at
            FROM chat_sessions
            WHERE graph_id = ? AND topic_id IS NULL
            """,
            (graph_id,),
        ).fetchone()
        if row is not None:
            return row

        created_at = datetime.now(timezone.utc).isoformat()
        session_id = f"thread_{graph_id}"
        conn.execute(
            """
            INSERT OR IGNORE INTO chat_sessions (session_id, graph_id, topic_id, title, created_at, updated_at)
            VALUES (?, ?, NULL, NULL, ?, ?)
            """,
            (session_id, graph_id, created_at, created_at),
        )
        return conn.execute(
            """
            SELECT session_id, graph_id, topic_id, title, created_at, updated_at
            FROM chat_sessions
            WHERE session_id = ?
            """,
            (session_id,),
        ).fetchone()

    def _normalize_session_topic_id(self, graph_id: str, topic_id: str | None) -> str | None:
        if topic_id is None:
            return None
        normalized = topic_id.strip()
        if not normalized:
            raise ValueError("topic_id cannot be empty")
        graph = self.graph(graph_id)
        if not any(topic.id == normalized for topic in graph.topics):
            raise ValueError(f"topic {normalized} not found in graph {graph_id}")
        return normalized

    @staticmethod
    def _purge_graph_runtime_state(conn: sqlite3.Connection, graph_id: str) -> None:
        conn.execute("DELETE FROM chat_messages WHERE graph_id = ?", (graph_id,))
        conn.execute("DELETE FROM chat_sessions WHERE graph_id = ?", (graph_id,))
        conn.execute("DELETE FROM quiz_sessions WHERE graph_id = ?", (graph_id,))

    @staticmethod
    def _snapshot_workspace_document(workspace: WorkspaceDocument) -> WorkspaceDocument:
        sanitized = WorkspaceDocument.model_validate(deepcopy(workspace.model_dump()))
        sanitized.config.gemini_api_key = None
        sanitized.config.openai_api_key = None
        return sanitized

    def _workspace_document_from_snapshot_row(self, conn: sqlite3.Connection, row: sqlite3.Row) -> WorkspaceDocument:
        workspace = WorkspaceDocument.model_validate_json(row["payload_json"])
        self._apply_workspace_secrets(conn, workspace)
        return workspace

    def _apply_workspace_secrets(self, conn: sqlite3.Connection, workspace: WorkspaceDocument) -> None:
        row = conn.execute(
            """
            SELECT gemini_api_key, openai_api_key
            FROM workspace_secrets
            WHERE workspace_id = ?
            """,
            (workspace.workspace_id,),
        ).fetchone()
        if row is None:
            return
        workspace.config.gemini_api_key = row["gemini_api_key"]
        workspace.config.openai_api_key = row["openai_api_key"]

    def _save_workspace_secrets(self, conn: sqlite3.Connection, workspace: WorkspaceDocument) -> None:
        conn.execute(
            """
            INSERT INTO workspace_secrets (workspace_id, gemini_api_key, openai_api_key, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(workspace_id) DO UPDATE SET
                gemini_api_key = excluded.gemini_api_key,
                openai_api_key = excluded.openai_api_key,
                updated_at = excluded.updated_at
            """,
            (
                workspace.workspace_id,
                workspace.config.gemini_api_key,
                workspace.config.openai_api_key,
                datetime.now(timezone.utc).isoformat(),
            ),
        )

    def _migrate_workspace_secrets(self, conn: sqlite3.Connection) -> None:
        rows = conn.execute(
            """
            SELECT id, payload_json
            FROM graph_snapshots
            ORDER BY id ASC
            """
        ).fetchall()
        latest_secrets_by_workspace: dict[str, dict[str, str | None]] = {}
        snapshot_updates: list[tuple[str, int]] = []

        for row in rows:
            try:
                payload = json.loads(row["payload_json"])
            except json.JSONDecodeError:
                continue
            if not isinstance(payload, dict):
                continue
            workspace_id = str(payload.get("workspace_id") or "default")
            config = payload.get("config")
            if not isinstance(config, dict):
                continue

            gemini_api_key = self._normalized_secret_value(config.get("gemini_api_key"))
            openai_api_key = self._normalized_secret_value(config.get("openai_api_key"))
            if gemini_api_key is not None or openai_api_key is not None:
                latest_secrets_by_workspace[workspace_id] = {
                    "gemini_api_key": gemini_api_key,
                    "openai_api_key": openai_api_key,
                }

            changed = False
            if config.get("gemini_api_key") is not None:
                config["gemini_api_key"] = None
                changed = True
            if config.get("openai_api_key") is not None:
                config["openai_api_key"] = None
                changed = True
            if changed:
                snapshot_updates.append((json.dumps(payload, ensure_ascii=False, separators=(",", ":")), int(row["id"])))

        for workspace_id, secrets in latest_secrets_by_workspace.items():
            conn.execute(
                """
                INSERT INTO workspace_secrets (workspace_id, gemini_api_key, openai_api_key, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(workspace_id) DO UPDATE SET
                    gemini_api_key = COALESCE(excluded.gemini_api_key, workspace_secrets.gemini_api_key),
                    openai_api_key = COALESCE(excluded.openai_api_key, workspace_secrets.openai_api_key),
                    updated_at = excluded.updated_at
                """,
                (
                    workspace_id,
                    secrets["gemini_api_key"],
                    secrets["openai_api_key"],
                    datetime.now(timezone.utc).isoformat(),
                ),
            )

        for payload_json, snapshot_id in snapshot_updates:
            conn.execute(
                """
                UPDATE graph_snapshots
                SET payload_json = ?
                WHERE id = ?
                """,
                (payload_json, snapshot_id),
            )

    @staticmethod
    def _normalized_secret_value(value: Any) -> str | None:
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None

    def _apply_operation(
        self,
        operation: PatchOperation,
        topic_map,
        edge_map,
        zone_map,
    ) -> None:
        if operation.op == "upsert_topic":
            if operation.topic is None:
                raise ValueError("upsert_topic requires topic")
            existing_topic = topic_map.get(operation.topic.id)
            merged_zones = self._merge_unique_strings(
                existing_topic.zones if existing_topic else [],
                operation.topic.zones,
            )
            merged_resources = self._merge_resources(
                existing_topic.resources if existing_topic else [],
                operation.topic.resources,
            )
            if existing_topic is not None:
                topic_map[operation.topic.id] = existing_topic.model_copy(
                    update={
                        "title": operation.topic.title,
                        "slug": operation.topic.slug,
                        "description": operation.topic.description,
                        "difficulty": operation.topic.difficulty,
                        "estimated_minutes": operation.topic.estimated_minutes,
                        "level": operation.topic.level,
                        # Topic state is controlled by quizzes and explicit mastery updates.
                        "zones": merged_zones,
                        "resources": merged_resources,
                    },
                    deep=True,
                )
                return
            topic_map[operation.topic.id] = Topic(
                id=operation.topic.id,
                title=operation.topic.title,
                slug=operation.topic.slug,
                description=operation.topic.description,
                difficulty=operation.topic.difficulty,
                estimated_minutes=operation.topic.estimated_minutes,
                level=operation.topic.level,
                state=operation.topic.state,
                zones=merged_zones,
                resources=merged_resources,
            )
            return

        if operation.op == "remove_topic":
            topic_id = operation.topic_id or (operation.topic.id if operation.topic else None)
            if not topic_id:
                raise ValueError("remove_topic requires topic_id")
            topic_map.pop(topic_id, None)
            edge_ids = [edge_id for edge_id, edge in edge_map.items() if edge.source_topic_id == topic_id or edge.target_topic_id == topic_id]
            for edge_id in edge_ids:
                edge_map.pop(edge_id, None)
            for zone in zone_map.values():
                zone.topic_ids = [existing_id for existing_id in zone.topic_ids if existing_id != topic_id]
            return

        if operation.op == "upsert_edge":
            if operation.edge is None:
                raise ValueError("upsert_edge requires edge")
            edge_map[operation.edge.id] = Edge.model_validate(operation.edge.model_dump())
            return

        if operation.op == "remove_edge":
            edge_id = operation.edge_id or (operation.edge.id if operation.edge else None)
            if not edge_id:
                raise ValueError("remove_edge requires edge_id")
            edge_map.pop(edge_id, None)
            return

        if operation.op == "upsert_zone":
            if operation.zone is None:
                raise ValueError("upsert_zone requires zone")
            zone_map[operation.zone.id] = Zone.model_validate(operation.zone.model_dump())
            return

        if operation.op == "set_mastery":
            topic_id = operation.topic_id or (operation.topic.id if operation.topic else None)
            if not topic_id or operation.state is None:
                raise ValueError("set_mastery requires topic_id and state")
            topic = topic_map.get(topic_id)
            if topic is None:
                raise ValueError(f"topic {topic_id} not found")
            topic.state = operation.state
            return

        raise ValueError(f"unsupported operation {operation.op}")

    def _merge_unique_strings(self, existing: list[str], incoming: list[str]) -> list[str]:
        merged: list[str] = []
        seen: set[str] = set()
        for item in [*existing, *incoming]:
            if item in seen:
                continue
            seen.add(item)
            merged.append(item)
        return merged

    def _merge_resources(self, existing: list[ResourceLink], incoming: list[ResourceLink]) -> list[ResourceLink]:
        merged: list[ResourceLink] = []
        seen_keys: set[tuple[str, str, str]] = set()
        for resource in [*existing, *incoming]:
            key = (resource.id, resource.label, resource.url)
            if key in seen_keys:
                continue
            seen_keys.add(key)
            merged.append(resource)
        return merged

    def _synchronize_zone_memberships(self, topic_map: dict[str, Topic], zone_map: dict[str, Zone]) -> None:
        topic_zone_ids = {topic_id: [] for topic_id in topic_map}
        zone_topic_ids = {zone_id: [] for zone_id in zone_map}

        for topic_id, topic in topic_map.items():
            for zone_id in topic.zones:
                if zone_id not in zone_map:
                    raise ValueError(f"topic {topic_id} references unknown zone {zone_id}")
                if zone_id not in topic_zone_ids[topic_id]:
                    topic_zone_ids[topic_id].append(zone_id)
                if topic_id not in zone_topic_ids[zone_id]:
                    zone_topic_ids[zone_id].append(topic_id)

        for zone_id, zone in zone_map.items():
            for topic_id in zone.topic_ids:
                if topic_id not in topic_map:
                    raise ValueError(f"zone {zone_id} references unknown topic {topic_id}")
                if topic_id not in zone_topic_ids[zone_id]:
                    zone_topic_ids[zone_id].append(topic_id)
                if zone_id not in topic_zone_ids[topic_id]:
                    topic_zone_ids[topic_id].append(zone_id)

        for topic_id, topic in topic_map.items():
            topic.zones = topic_zone_ids[topic_id]
        for zone_id, zone in zone_map.items():
            zone.topic_ids = zone_topic_ids[zone_id]
