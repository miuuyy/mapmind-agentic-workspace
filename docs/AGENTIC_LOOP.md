# Agentic Loop

MapMind is not a generic autonomous agent. It is a **stateful learning workspace with an explicit decision-and-review loop**.

The point of this file is to show where the agentic behavior actually lives:

- context is assembled from workspace state
- the model chooses an action shape
- graph mutation stays proposal-based
- accepted changes become rollbackable history

## At a glance

```mermaid
flowchart TD
    A["User message"] --> B["Context assembly"]

    B --> B1["Workspace config\nprovider, model, thinking mode, persona rules"]
    B --> B2["Graph state\nnodes, edges, zones, selected topic"]
    B --> B3["Learning state\ntopic mastery, closure status, quiz history"]
    B --> B4["Session state\nchat history, active learning session (not rollbacked)"]
    B --> B5["System state\ngraph/workspace snapshots, rollbackable history"]

    B --> C["Orchestrator decision model"]

    C --> D1["Answer path"]
    C --> D2["Inline quiz path"]
    C --> D3["Propose ingest path"]
    C --> D4["Propose expand path"]

    D1 --> E1["Assistant response"]
    D2 --> E2["Quiz card + later grading"]
    E2 --> F2["Update learning state"]
    F2 --> G["Persist to workspace state"]

    D3 --> P["Planner"]
    D4 --> P

    P --> P1["Proposal envelope"]
    P --> P2["Apply plan"]
    P --> P3["Warnings / assumptions / open questions"]

    P1 --> H["Human review gate"]
    P2 --> H
    P3 --> H

    H -->|Approve| I["Apply state transition"]
    H -->|Reject / ignore| J["Keep current state"]

    I --> K["Snapshot commit"]
    K --> G

    G --> L["Updated graph + updated context"]

    K --> M["Graph/workspace rollback path"]
    M --> G
```

## Why this qualifies as agentic

The product is more than “user sends prompt, model returns text”.

It has:

- persistent world state
- dynamic context assembly
- multiple action paths
- typed outputs
- review before graph mutation
- rollback after accepted changes

That is enough to describe MapMind honestly as an **agentic learning loop** without pretending it is a broad autonomous agent platform.

## The five most important invariants

1. The graph stays the center of truth.
2. The model can propose mutation, not silently perform it.
3. Accepted graph changes stay recoverable through snapshots.
4. Runtime chat state and snapshot state are related but not identical.
5. Completion is attached to topics and closure logic, not only to chat.

## Action shapes

At the orchestrator level the agent can choose among a small set of action families:

- answer in context
- emit an inline quiz
- propose a graph ingest
- propose a graph expansion

That narrow action space is intentional. It keeps the model inside a legible product surface.

## Where the loop lives in code

| Area | Responsibility |
| --- | --- |
| `backend/app/services/chat_orchestrator.py` | builds context and chooses action shape |
| `backend/app/services/gemini_planner.py` | generates proposal drafts and applies validation bridges |
| `backend/app/services/repository.py` | persists workspace, graph, snapshots, and config |
| `backend/app/llm/contracts.py` | action-level contract layer |
| `backend/app/llm/schemas.py` | structured generation schemas and planner draft shapes |

## What this loop is not trying to do

It is not trying to become:

- a background worker swarm
- a hidden supervisor mesh
- a fake autonomous curriculum oracle

The loop exists to make one thing work well: **help a learner build and evolve a structured graph without losing control of the workspace**.
