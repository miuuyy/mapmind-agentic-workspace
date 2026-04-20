# Quick start

If Obsidian is where you collect notes, **Clew is where you operate on a learning graph**.

Clew is a graph-first workspace for structured study, with an AI agent layer that can expand, audit, and reshape your path without silently rewriting your state.

![Clew walkthrough](/docs-assets/walkthrough.gif)

## Two entry paths

You can approach Clew in two ways:

- use the **hosted site** if you want to try it immediately
- run the **local edition** if you want full control over providers, data, and graph packs

## Hosted route

Go to [mapmind.space](https://mapmind.space), sign in, and open the app.

The hosted route is the fastest way to understand the product shape:

- open the starter graph
- inspect a few topics
- ask the assistant to expand a target
- review the proposal
- apply it or reject it

The hosted product also includes a library surface for shared graphs and discovery.
It is also the easier route if you want to use Clew on a phone or tablet instead of staying at a desktop-only local setup.

## Local route

Clone the repository, copy the environment example, and run the development script.

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

## What you see first

The first thing you see is a graph.

That is intentional. The graph is not a decoration and not a background effect. It is the working surface of the product.

By default, the local edition starts with a starter graph so you can inspect:

- topic structure
- prerequisite flow
- visual zones
- closure behavior
- the assistant panel

You can keep it, modify it, delete it, export it, or use it as a template for your own graphs.

## The shortest useful first session

If you want the fastest honest tour of Clew, do this:

1. open the starter graph
2. inspect a few topics and their attached resources
3. ask the assistant to expand toward a target
4. review the proposal before applying it
5. apply it, study a topic, and try a closure quiz

That single loop shows what makes the product different:

- graph as state
- AI as proposer
- user as reviewer
- progress as visible structure

## What to do next

After that first run, the best next steps are usually:

- create a graph from your own goal
- ingest your own messy topic list
- import a graph pack from disk
- customize the graph until it matches how you actually think

Clew is intentionally flexible here. It is a generative graph workspace, not a fixed curriculum player.
