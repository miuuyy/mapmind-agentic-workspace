# Clew

<p>
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-111111?style=flat-square"></a>
  <a href="https://github.com/miuuyy/Clew/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/miuuyy/Clew/ci.yml?branch=main&style=flat-square&label=build"></a>
  <a href="https://clew.my/how-to-use"><img alt="Docs" src="https://img.shields.io/badge/docs-live-111111?style=flat-square"></a>
  <a href="https://clew.my"><img alt="Demo" src="https://img.shields.io/badge/demo-live-111111?style=flat-square"></a>
</p>
<p>
  <img alt="Generative Roadmap" src="https://img.shields.io/badge/generative-roadmap-111111?style=flat-square">
  <img alt="Agentic Workspace" src="https://img.shields.io/badge/agentic-workspace-111111?style=flat-square">
  <img alt="Knowledge Graph" src="https://img.shields.io/badge/knowledge-graph-111111?style=flat-square">
  <img alt="AI powered" src="https://img.shields.io/badge/AI-powered-111111?style=flat-square">
</p>
<p>
  <img alt="Python" src="https://img.shields.io/badge/Python-3.11%2B-111111?style=flat-square">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-111111?style=flat-square">
</p>
<p>
  <a href="https://github.com/miuuyy/Clew/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/miuuyy/Clew?style=flat-square&label=stars&color=111111"></a>
  <img alt="Obsidian integration" src="https://img.shields.io/badge/Obsidian-integration-111111?style=flat-square">
</p>

**Clew gives you a thread through anything you're learning.**

It is the thing I wanted when I was trying to understand which parts of a huge school/math/programming curriculum actually mattered for machine learning. Not another note app. Not another chat tab. A clear, visual path through a subject, shaped around your goal.

The quick builder benchmark is: **roadmap.sh, but personalized and adaptive**.

You can ask AI to turn a messy topic dump, an Obsidian vault, or a goal like "get me ready for transformers" into a real dependency graph. Good models can add serious breadth in one pass. You still review what changes before it lands, because the graph is your workspace, not a place where AI silently rewrites the map.

![Clew walkthrough](.github/readme-assets/walkthrough.gif)

This repository is the local, hackable edition of Clew. If you want the fastest first look, start at [clew.my](https://clew.my). If you want provider control, local state, MCP, and graph import/export, run this repo.

## Quick Look

- `The product idea`: a clear path to anything you want to learn
- `The builder shorthand`: roadmap.sh, but personalized and adaptive
- `The AI role`: generate, expand, audit, and reshape the learning graph
- `The trust boundary`: AI proposes; you review; snapshots let you roll back
- `The local edition`: SQLite, your provider keys, Obsidian import/export, MCP server

## Quick Start

```bash
git clone https://github.com/miuuyy/Clew.git
cd Clew
cp .env.example .env
./scripts/dev.sh
```

Set one provider key in `.env`:

- `KG_GEMINI_API_KEY=...`
- `KG_OPENAI_API_KEY=...`

Then open:

- frontend: `http://127.0.0.1:5178`
- backend: `http://127.0.0.1:8787`

## Why It Exists

Learning a big field is mostly a structure problem.

If you want machine learning, you do not need every math topic equally. You need to see which ideas unlock the path, which ones can wait, where the foundations are, and what the next useful edge is. A static public roadmap helps, but it cannot know your current graph, your goal, your notes, or the branch you are actually taking.

Clew uses AI because building that graph manually is too expensive. The model does the heavy structural drafting. The product keeps the draft visible, editable, reviewable, and reversible.

## Features

- `Personal adaptive roadmaps`: generate a learning graph from a goal, a messy topic list, or existing notes.
- `Graph-first workspace`: topics, dependencies, zones, resources, artifacts, manual layout, and progress live on the same surface.
- `AI proposals instead of silent edits`: ingest, expand, audit, review, apply, and roll back through snapshots.
- `Obsidian bridge`: import a vault into a graph, or export a graph back into an Obsidian-ready folder.
- `Obsidian-to-Clew import skill`: a packaged skill for Claude Code and Codex that audits an Obsidian vault, flags what blocks a clean import, and shapes the vault into a validated Clew package.
- `MCP context bridge`: let an external assistant read your Clew graphs and progress without copy-paste.
- `Study loop`: topic sessions, assistant help, inline quizzes, closure quizzes, and manual completion when strict gating is disabled.
- `Local control`: SQLite workspace, provider keys, Gemini/OpenAI support, OpenAI-compatible endpoint option, memory/persona/thinking settings.

## Example Use Cases

- Turn a giant math syllabus into the parts that matter for ML.
- Skip ahead in a school subject by following only the prerequisite chain that actually leads to your target (exam topic, course goal, olympiad).
- Build a Python or cybersecurity path with visible prerequisites instead of a vague checklist.
- Import an Obsidian vault and see whether your notes actually form a usable learning structure.
- Ask Claude/Cursor about your current learning path through MCP without pasting graph state.
- Export a finished path back to Obsidian as a readable vault.

## Visuals

![Clew workspace overview](.github/readme-assets/asset11.png)

<table>
  <tr>
    <td width="33%">
      <img alt="Clew topic view" src=".github/readme-assets/asset12.png">
    </td>
    <td width="33%">
      <img alt="Clew proposal flow" src=".github/readme-assets/asset13.png">
    </td>
    <td width="33%">
      <img alt="Clew path highlight" src=".github/readme-assets/asset14.png">
    </td>
  </tr>
</table>

## Docs

- [Hosted docs](https://clew.my/how-to-use)
- [Quick start](docs/site_faq/quick-start.md)
- [Features](docs/site_faq/features.md)
- [How to use](docs/site_faq/how-to-use.md)
- [Why special](docs/site_faq/why-special.md)
- [Obsidian and MCP integrations](docs/site_faq/integrations.md)
- [Latest release notes](docs/RELEASE_0_2_0.md)
- [Connect to Claude Desktop / Claude Code / Cursor (MCP)](docs/MCP_SETUP.md)
- [Obsidian-to-Clew import skill (Claude Code / Codex)](.claude/skills/obsidian-to-clew-import/SKILL.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Engineering docs index](docs/README.md)

## Repository Map

| Path | Role |
| --- | --- |
| `frontend/` | React workspace UI, graph canvas, themes, settings, dialogs, debug surfaces |
| `backend/` | FastAPI app, repository, domain model, provider layer, planner, MCP server, tests |
| `contracts/` | JSON contracts and transport surfaces used by graph mutation flows |
| `docs/` | engineering docs, ADRs, release notes, and site FAQ source |
| `scripts/` | local development helpers such as boot, stop, and reset |
| `.claude/skills/obsidian-to-clew-import/`, `.agents/skills/obsidian-to-clew-import/` | packaged agent skill that shapes an Obsidian vault into a validated Clew import package (Claude Code and Codex) |

## Development Checks

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

## Open Source Surfaces

- [Contributing guide](CONTRIBUTING.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [MIT License](LICENSE)

## Contact

- Email: [johnymaarrete@gmail.com](mailto:johnymaarrete@gmail.com)
- LinkedIn: [aleksandr-vechenkov-037b00377](https://www.linkedin.com/in/aleksandr-vechenkov-037b00377/)
- Security-sensitive bugs: email privately instead of opening a public issue.
