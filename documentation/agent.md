# Agent

MapMind uses a **narrow learning agent**, not a pseudo-general assistant that claims to automate everything.

## The shortest definition

MapMind is a graph-first learning workspace with an AI agent layer operating inside a persistent study state.

The agent does not act on an empty prompt. It acts on a workspace that already contains:

- graph structure
- selected topic context
- progress and closure state
- recent chat history
- role and persona rules
- provider and model settings
- language and memory preferences

## Why it is fair to call it agentic

This is more than “LLM answers user”.

The system has:

- persistent world state
- dynamic context assembly
- multiple action paths
- typed outputs
- human review before graph mutation
- rollback after accepted changes

That is enough to describe MapMind honestly as an **agentic learning loop** without pretending it is a broad autonomous agent platform.

## What the agent can do

At a high level, the agent can:

- answer in context
- generate an inline quiz
- propose a graph ingest
- propose a graph expansion

When the action affects the graph, the system returns a typed proposal instead of silently rewriting the workspace.

## Why the scope is intentionally narrow

A lot of “agents” in 2026 are broad in ambition and weak in truth.

MapMind takes the opposite stance:

- one domain
- one strong surface
- one persistent state model

That narrower scope is exactly why the product can be useful. It is built to help a learner build, inspect, and evolve a structured path, not to cosplay as a universal autonomous system.

## Memory and behavior

The assistant does not have one fixed memory mode.

MapMind lets the workspace shape the agent through:

- chat history depth
- graph-context inclusion
- quiz-context inclusion
- frontier and progress inclusion
- persona rules
- provider and model choice

That makes behavior part of the workspace, not a hidden constant.
