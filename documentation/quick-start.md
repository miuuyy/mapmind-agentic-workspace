# Quick Start

Clew is for the moment when you know what you want to learn, but the path is too tangled to hold in your head.

The shortest version:

**Clew is roadmap.sh, but personalized and adaptive.**

It gives you a clear path to anything you want to learn, with AI doing the heavy structural work and you staying in control of what becomes part of the graph.

![Clew walkthrough](/docs-assets/walkthrough.gif)

## Start On The Website

Go to [clew.my](https://clew.my), open the app, and start with a graph.

You can:

- inspect a starter graph
- create a fresh subject graph
- paste a rough topic dump
- import an Obsidian vault
- ask AI to expand toward a target

The first screen is the graph because the graph is the product. Chat supports it. Settings support it. Import and export support it. The graph is where the path becomes visible.

## Run It Locally

Use the local edition if you want your own provider keys, local SQLite state, MCP, and graph files.

```bash
git clone https://github.com/miuuyy/mapmind-agentic-workspace.git
cd mapmind-agentic-workspace
cp .env.example .env
./scripts/dev.sh
```

Open:

- frontend: `http://127.0.0.1:5178`
- backend: `http://127.0.0.1:8787`

You only need one provider key:

- `KG_GEMINI_API_KEY`
- or `KG_OPENAI_API_KEY`

## The First Good Session

Do this once and you will understand the product:

1. open a graph
2. click a topic and look at the path around it
3. ask the assistant to expand toward a real target
4. review the proposal before applying it
5. apply it only if the structure makes sense
6. study one topic
7. close it with a quiz or mark it finished

That loop shows the core idea:

- AI makes the graph possible at useful scale
- the graph makes the subject legible
- review keeps the workspace yours
- progress stays attached to the structure

## Use Your Own Material

Clew is strongest when it is not starting from nothing.

Good inputs:

- a school syllabus
- an ML prerequisite list
- a course outline
- an Obsidian vault
- a messy list of things you know you need
- a target like "learn enough linear algebra for embeddings"

You do not need to prepare a perfect curriculum. Clew exists because perfect curriculum design is the expensive part.

## What To Try Next

- Import an Obsidian vault and see whether your notes form a real graph.
- Export a graph back to Obsidian as a markdown vault.
- Connect Clew Study Assist through MCP so Claude, Claude Code, or Cursor can read your current learning context.
- Switch between Midnight and Paper themes depending on whether you want the dark graph mood or a brighter daylight workspace.
- Tune memory, model, thinking budget, and persona rules when you want the AI to behave differently.
