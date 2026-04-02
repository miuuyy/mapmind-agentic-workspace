# Agent Workflow Layer

This directory contains the shared workflow layer for coding agents working in MapMind.

MapMind uses two main agent surfaces:

- `Codex`, which reads [AGENTS.md](../../AGENTS.md)
- `Claude Code`, which reads [CLAUDE.md](../../CLAUDE.md) and repo-local `.claude/` assets

The goal is not to create “agent magic”. The goal is to make the repository easier to work on without losing product truth.

## Files

- [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md): shared product and architecture truth for both agents
- [WORKFLOW.md](WORKFLOW.md): how agents should approach implementation, verification, and quality

## Related repo surfaces

- [AGENTS.md](../../AGENTS.md)
- [CLAUDE.md](../../CLAUDE.md)
- [Architecture](../ARCHITECTURE.md)
- [ADR index](../adr/README.md)

## Claude-specific assets

Repo-local Claude assets live here:

- `../../.claude/skills/`

They exist to reduce repetitive prompt setup for common MapMind work, especially:

- graph/product reviews
- docs work
- agent-boundary work

Current repo-local skills:

- `mapmind-product-guard`: protects graph-first product and UX decisions
- `mapmind-agent-boundaries`: protects model primacy, proposal review, and explicit validation boundaries

Each skill is intentionally compact and may point to local `references/` files for deeper checklists so contributors can extend the guidance without turning the main skill file into a wall of text.

## What this layer is not

It is not:

- a hidden runtime for the product
- a fallback system that bypasses model decisions
- a pile of magic prompts with no relation to repository truth

It is a **repository working layer**: context, instructions, and reusable workflows for the people and agents building MapMind.
