# MapMind

<p>
  <img alt="MIT" src="https://img.shields.io/badge/MIT-licensed-111111?style=flat-square">
  <img alt="Python" src="https://img.shields.io/badge/Python-3.11%2B-111111?style=flat-square">
  <img alt="Agentic Workspace" src="https://img.shields.io/badge/Agentic-Workspace-111111?style=flat-square">
  <img alt="Obsidian-like" src="https://img.shields.io/badge/Obsidian-like-111111?style=flat-square">
  <img alt="Knowledge Graph" src="https://img.shields.io/badge/Knowledge-Graph-111111?style=flat-square">
  <img alt="AI powered" src="https://img.shields.io/badge/AI-powered-111111?style=flat-square">
</p>

**MapMind is Obsidian for knowledge paths**: a graph-first agentic workspace for learning subjects with real dependency structure.

![MapMind walkthrough](.github/readme-assets/walkthrough.gif)

Most AI learning tools collapse into chat. MapMind keeps the dependency graph as the working surface: AI can expand, audit, and restructure the graph, but nothing mutates silently.

This repository is the local, hackable, agent-native edition of MapMind. If you want the fastest first look, try [mapmind.space](https://mapmind.space). If you want full control over providers, state, and graph packs, run this repo locally.

## Quick start

```bash
git clone https://github.com/miuuyy/mapmind-agentic-workspace.git
cd mapmind-agentic-workspace
cp .env.example .env
./scripts/dev.sh
```

Set one provider key in `.env`:

- `KG_GEMINI_API_KEY=...`
- `KG_OPENAI_API_KEY=...`

Then open:

- frontend: `http://127.0.0.1:5178`
- backend: `http://127.0.0.1:8787`

Choose your path:

- `Try the hosted product`: [mapmind.space](https://mapmind.space)
- `Open the app directly`: [app.mapmind.space](https://app.mapmind.space)
- `See how it works before cloning`: [mapmind.space/how-to-use](https://mapmind.space/how-to-use)

## Features

- `Graph-first workspace`: subject graphs, visible prerequisites, manual layout, zones, topic resources, artifacts, and import/export.
- `AI proposals instead of silent edits`: ingest rough topic lists, expand toward a target, review changes before apply, and keep snapshots reversible.
- `Study loop that stays attached to structure`: topic sessions, assistant help, closure quizzes, and manual completion when quiz gating is disabled.
- `Local control`: SQLite workspace, provider ownership, persona/model/memory settings, and easier experimentation than a hosted-only tool.

## Why it stands out

- It is not a note vault with no operational model.
- It is a workspace where the path stays visible while AI helps reshape it.

## Visuals

![MapMind workspace overview](.github/readme-assets/asset2.jpeg)

<table>
  <tr>
    <td width="50%">
      <img alt="MapMind topic view" src=".github/readme-assets/asset3.png">
    </td>
    <td width="50%">
      <img alt="MapMind proposal flow" src=".github/readme-assets/asset4.png">
    </td>
  </tr>
</table>

## Docs

- [Documentation index](documentation/README.md)
- [Quick start](documentation/quick-start.md)
- [Features](documentation/features.md)
- [How to use](documentation/how-to-use.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Engineering docs index](docs/README.md)

## Repository map

| Path | Role |
| --- | --- |
| `frontend/` | React workspace UI, graph canvas, settings, dialogs, debug surfaces |
| `backend/` | FastAPI app, repository, domain model, provider layer, planner, tests |
| `contracts/` | JSON contracts and transport surfaces used by graph mutation flows |
| `documentation/` | product-facing markdown source for hosted docs |
| `docs/` | engineering docs for local development, architecture, providers, and workflows |
| `scripts/` | local development helpers such as boot, stop, and reset |

## Development checks

```bash
cd frontend && npm run typecheck && npm run build
PYTHONPATH=backend ./.venv/bin/python -m unittest discover -s backend/tests -v
```

Useful helpers:

```bash
./scripts/dev.sh
./scripts/stop_dev.sh
./scripts/reset_db.sh
```

## Open-source surfaces

- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Support guide](SUPPORT.md)
- [MIT License](LICENSE)
