# MapMind

<p>
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-111111?style=flat-square"></a>
  <a href="https://github.com/miuuyy/mapmind-agentic-workspace/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/miuuyy/mapmind-agentic-workspace/ci.yml?branch=main&style=flat-square&label=build"></a>
  <a href="https://mapmind.space/how-to-use"><img alt="Docs" src="https://img.shields.io/badge/docs-live-111111?style=flat-square"></a>
  <a href="https://app.mapmind.space"><img alt="Demo" src="https://img.shields.io/badge/demo-live-111111?style=flat-square"></a>
  <img alt="Python" src="https://img.shields.io/badge/Python-3.11%2B-111111?style=flat-square">
</p>

**MapMind is Obsidian for knowledge paths**: a graph-first agentic workspace for learning subjects with real dependency structure.

![MapMind walkthrough](.github/readme-assets/walkthrough.gif)

Most AI learning tools collapse into chat. MapMind keeps the dependency graph as the working surface: AI can expand, audit, and restructure the graph, but nothing mutates silently.

This repository is the local, hackable, agent-native edition of MapMind. If you want the fastest first look, try [mapmind.space](https://mapmind.space). If you want full control over providers, state, and graph packs, run this repo locally.

## Quick look

- `Try the hosted product first`: [mapmind.space](https://mapmind.space)
- `See the docs before cloning`: [mapmind.space/how-to-use](https://mapmind.space/how-to-use)
- `Run locally if you want full control`: clone this repo and use your own provider keys

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

## Features

- `Graph-first workspace`: subject graphs, visible prerequisites, manual layout, zones, topic resources, artifacts, and import/export.
- `AI proposals instead of silent edits`: ingest rough topic lists, expand toward a target, review changes before apply, and keep snapshots reversible.
- `Study loop that stays attached to structure`: topic sessions, assistant help, closure quizzes, and manual completion when quiz gating is disabled.
- `Local control`: SQLite workspace, provider ownership, persona/model/memory settings, and easier experimentation than a hosted-only tool.

## Example use cases

- Build a Python learning path with prerequisites, checkpoints, and attached study resources.
- Audit weak spots in a machine learning roadmap instead of relying on a vague note pile.
- Turn a rough systems or math topic dump into a structured graph you can actually study through.

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

- [Hosted docs](https://mapmind.space/how-to-use)
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
