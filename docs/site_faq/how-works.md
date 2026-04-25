# How It Works

Clew works by keeping learning structure as persistent state and letting AI operate inside that state.

## 1. The Graph Is The State

The graph is not a generated screenshot.

It stores:

- topics
- prerequisite edges
- zones
- resources
- artifacts
- progress
- quiz history
- snapshots

That is why a topic can have a real neighborhood, and why the assistant can answer from the path you are actually building.

## 2. AI Gets Context, Not A Blank Chat

When you ask for help, Clew can assemble context from:

- the current graph
- the selected topic
- nearby prerequisites and unlocks
- progress and closure state
- recent chat history
- provider/model settings
- memory and persona settings
- grounding preference

This is why Clew needs AI but does not collapse into chat. The model is working with a structured workspace.

## 3. Requests Become Action Shapes

The assistant can choose a small set of product actions:

- answer in context
- generate an inline quiz
- propose topic ingest
- propose graph expansion

The narrow action space is intentional. It keeps the model useful without pretending to be a general autonomous worker.

## 4. Graph Changes Are Proposals

AI-generated graph changes come back as proposals.

A proposal contains:

- topic operations
- edge operations
- zone operations
- assumptions
- warnings
- apply preview

You decide whether it lands. Clew does not silently rewrite the graph.

## 5. Accepted Changes Are Recoverable

Applied graph changes are persisted through the repository layer and snapshot history.

That gives you a practical safety loop:

- generate structure quickly
- inspect the result
- roll back if the shape was wrong

Without rollback, AI-assisted graph editing would be too fragile to trust.

## 6. Obsidian And MCP Are Bridges

Obsidian import/export moves learning structure between Clew and a Markdown vault.

MCP exposes the local graph as read-only context for external assistants.

Both integrations follow the same product rule: they support the graph, they do not replace it.

## 7. Local Control Stays Explicit

The local edition uses:

- SQLite for workspace state
- your provider keys
- Gemini or OpenAI/OpenAI-compatible providers
- local debug logs when enabled
- local graph packages

In one sentence:

**Clew uses AI to draft the path, the graph to make the path visible, and review/snapshots to keep the path trustworthy.**
