# Local Quickstart

This guide is for developers and advanced users who want to run the public `main` branch locally.

If you only want to try the product, the faster path is the hosted site:

- [clew.my](https://clew.my)

If you want local control over the workspace, providers, and graph packs, use this guide.

## Requirements

- macOS or Linux shell environment
- Python 3.11+
- Node 20+ or Node 22
- one provider key:
  - `KG_GEMINI_API_KEY`
  - or `KG_OPENAI_API_KEY`

## Start the app

```bash
git clone https://github.com/miuuyy/mapmind-agentic-workspace.git
cd mapmind-agentic-workspace
cp .env.example .env
./scripts/dev.sh
```

Open:

- frontend: `http://127.0.0.1:5178`
- backend: `http://127.0.0.1:8787`

## Deploy note

The frontend supports two runtime shapes:

- same-origin: frontend and backend are served from the same origin
- split-origin: frontend and backend are deployed to different origins

For split-origin deploys, set both sides explicitly:

```bash
VITE_API_BASE=https://api.example.com
KG_FRONTEND_ORIGIN=https://app.example.com
```

If you skip those values, the frontend falls back to its own origin and backend CORS stays on the local default.

## What the dev script does

`./scripts/dev.sh` is the intended entry path. It:

- creates `.venv` when needed
- installs backend dependencies in editable mode
- installs frontend dependencies
- starts FastAPI with reload
- starts Vite with strict port handling

If Vite cannot bind normally, the script falls back to a static frontend server.

## Provider setup

You only need one configured provider to use the workspace.

### Gemini

```bash
KG_GEMINI_API_KEY=...
```

### OpenAI

```bash
KG_OPENAI_API_KEY=...
```

Optional:

```bash
KG_OPENAI_BASE_URL=https://api.openai.com/v1
```

## Local data

The local workspace database lives here:

```text
backend/data/knowledge_graph.sqlite3
```

It stores:

- graphs
- snapshots
- chat state
- quiz state
- workspace configuration

## Reset the database

If you want to wipe the local workspace and go back to the seed state:

```bash
./scripts/reset_db.sh
```

## Stop local listeners

```bash
./scripts/stop_dev.sh
```

That stops listeners on:

- `8787`
- `5178`
- `5179`

## Common checks

```bash
cd frontend && npm run typecheck
cd frontend && npm run build
PYTHONPATH=backend ./.venv/bin/python -m unittest discover -s backend/tests -v
```

## Recommended first run

1. boot the workspace
2. open the starter graph
3. configure your provider in settings
4. ask for a focused expansion
5. review the proposal
6. apply it and try a closure quiz

That gives you the shortest honest tour of the product.

## Troubleshooting

### The backend or frontend port is already in use

Run:

```bash
./scripts/stop_dev.sh
```

Then start again.

### The workspace feels broken after experiments

Reset the local SQLite state:

```bash
./scripts/reset_db.sh
```

### You want raw local error traces

Enable **Debug mode** in settings. That exposes a `Logs` surface in the local shell and writes debug output to:

```text
logs/logs.log
```
