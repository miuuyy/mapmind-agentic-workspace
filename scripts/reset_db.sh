#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB_PATH="$ROOT_DIR/backend/data/knowledge_graph.sqlite3"

rm -f "$DB_PATH" "$DB_PATH"-shm "$DB_PATH"-wal

PYTHON_BIN="$ROOT_DIR/.venv/bin/python"
if [[ ! -x "$PYTHON_BIN" ]]; then
  PYTHON_BIN="$(command -v python3)"
fi

PYTHONPATH="$ROOT_DIR/backend" "$PYTHON_BIN" - <<'PY'
from pathlib import Path

from app.services.repository import GraphRepository

root = Path.cwd()
db_path = root / "backend" / "data" / "knowledge_graph.sqlite3"
GraphRepository(db_path)
print(f"Reset local SQLite workspace at {db_path}")
PY
