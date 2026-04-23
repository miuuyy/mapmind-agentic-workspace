# Architecture

This file explains how the public `main` branch is shaped as a codebase and as a product boundary.

Clew is not a generic note system and not a broad autonomous agent platform. It is a graph-first learning workspace with a deliberately narrow AI loop.

## Product boundary

The local edition keeps a few hard guarantees:

1. `Topic` is the core study unit.
2. The graph is the center of truth.
3. AI does not silently mutate the graph.
4. Accepted changes become snapshot history.
5. Completion is attached to closure logic, not just visual toggles.

These guarantees matter more than convenience hacks.

## Repository architecture

The repository is compact, but the responsibilities are intentionally split.

```text
mapmind-agentic-workspace/
├── backend/         FastAPI app, domain model, repository, providers, tests
├── frontend/        React workspace, graph canvas, dialogs, settings, logs
├── contracts/       JSON transport files used by graph flows
├── docs/            Engineering docs, ADRs, release notes, site FAQ source
└── scripts/         Local development helpers
```

## Package responsibilities

### Backend

`backend/` contains the FastAPI app for the local edition.

It is responsible for:

- exposing API routes for graph, chat, quiz, snapshots, and settings
- persisting workspace state in local SQLite
- running orchestrator and planner flows
- holding the provider seam for Gemini, OpenAI, and OpenAI-compatible endpoints
- validating proposals before they can be applied
- supporting local debug logging in `main`

The backend should fail honestly: if a provider cannot satisfy a contract, or a proposal cannot be validated safely, it should reject explicitly instead of inventing a fake success path.

### Frontend

`frontend/` contains the React graph workspace.

It is responsible for:

- rendering the graph canvas
- hosting assistant and proposal review flows
- exposing settings for provider, model, memory, closure behavior, and local debug surfaces
- keeping graph mutation visible and reviewable
- preserving the graph as the main surface instead of drifting into dashboard or chat-first UI

### Contracts

`contracts/` contains transport-facing JSON contracts used by graph mutation flows.

These files are not the whole domain model. They are explicit exchange surfaces that make proposal handling inspectable, tool-friendly, and separate from ad-hoc runtime code.

### Scripts

`scripts/` contains small local helpers:

- `dev.sh` bootstraps dependencies and starts the backend and frontend
- `stop_dev.sh` stops local listeners on known dev ports
- `reset_db.sh` deletes and recreates the local SQLite seed workspace

The scripts should stay small, explicit, and boring.

## Frontend structure

| Area | Responsibility |
| --- | --- |
| `frontend/src/App.tsx` | top-level app state, modal orchestration, request wiring |
| `frontend/src/components/WorkspaceShell.tsx` | sidebar, graph chrome, workspace-level navigation |
| `frontend/src/components/GraphCanvas.tsx` | graph rendering, layout interaction, pan and zoom behavior |
| `frontend/src/components/SettingsModal.tsx` | provider, model, memory, thinking, debug settings |
| `frontend/src/components/AppDialogs.tsx` | proposal, import/export, and workspace modal surfaces |
| `frontend/src/lib/` | contracts, API helpers, graph transforms, copy, debug instrumentation |

The frontend is intentionally graph-first. It should read like a workspace, not like a dashboard with a graph widget pasted in.

## Backend structure

| Area | Responsibility |
| --- | --- |
| `backend/app/api/routes.py` | HTTP transport and request/response mapping |
| `backend/app/models/domain.py` | persistent workspace and graph domain model |
| `backend/app/models/api.py` | API payload models |
| `backend/app/services/repository.py` | SQLite persistence, snapshots, workspace config, graph state |
| `backend/app/services/chat_orchestrator.py` | action choice for answer, quiz, or proposal |
| `backend/app/services/proposal_planner.py` | proposal generation, coercion, validation bridge |
| `backend/app/services/quiz_service.py` | quiz generation and closure attempts |
| `backend/app/llm/` | provider seam, model catalog, prompts, contracts, schemas |

## Separation of concerns

Clew uses a few simple but important separations:

### Domain state

Persistent workspace state lives in SQLite and includes:

- graphs
- topics
- edges
- zones
- resources and artifacts
- snapshots
- quiz state
- workspace configuration

### Runtime state

Runtime state includes:

- recent chat exchanges
- current UI selection
- in-flight requests
- temporary proposal review state

Some runtime state is persisted, but it is not the same thing as snapshot history.

### Provider seam

The model layer is not hard-coded to one provider. Providers implement the same high-level interface and are selected through workspace config.

### Proposal boundary

Graph mutation is proposal-based:

- raw source comes in
- a provider produces structured output
- the planner coerces it into a draft
- validation runs
- the user reviews
- the repository applies accepted state

## Core loop

The most important product path is:

1. user sends a request
2. context is assembled from the graph, topic, history, and config
3. orchestrator chooses an action shape
4. planner or assistant returns typed output
5. user reviews if mutation is involved
6. repository persists accepted change into snapshot history

The graph stays visible through the whole process.

## Domain model at a glance

### Topic

A topic is the canonical study unit.

It can carry:

- title
- description
- duration estimate
- resources
- artifacts
- progress state
- closure state

### Edge

A directed relationship between topics, usually expressing dependency.

### Zone

A visual grouping layer used to make large graphs readable without turning them into rigid folders.

### Snapshot

An immutable saved workspace state used for rollback and audit.

### Workspace

The top-level container for:

- many subject graphs
- shared settings
- provider and model config
- memory and persona settings

## What is local-only in `main`

The public branch is the local developer edition.

That means:

- SQLite is local
- provider keys are local
- import/export is local
- debugging surfaces exist for the local workspace

It does **not** try to replicate every hosted surface.

## Non-goals

This branch is not trying to ship:

- broad team collaboration
- hidden background orchestration
- silent AI writes
- generic productivity surfaces disconnected from the graph

Those non-goals keep the architecture sharp.
