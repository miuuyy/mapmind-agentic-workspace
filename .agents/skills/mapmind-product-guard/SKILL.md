---
name: mapmind-product-guard
description: Product and UX guardrail skill for MapMind. Use when changing frontend surfaces, graph interactions, proposal review UX, learning flows, topic closure logic, or any feature that affects what the product feels like.
---

# MapMind Product Guard

Use this skill when changing product behavior, UX, graph flows, or any surface that affects MapMind's identity.

## Read first

- `docs/agents/PROJECT_CONTEXT.md`
- `docs/agents/WORKFLOW.md`
- `docs/ARCHITECTURE.md`
- `docs/adr/0001-graph-mutations-must-be-reviewable-and-reversible.md`
- `docs/adr/0002-frontend-stays-graph-first.md`
- `docs/adr/0003-local-edition-and-hosted-surface-are-separate.md`

Read `references/review-checklist.md` when you need the deeper review prompts, frontend file map, or anti-pattern checklist.

## Product law

MapMind is a graph-first learning workspace.

If a change makes the repository easier to extend but weakens that identity, reject it or redesign it.

## Protect these invariants

- the graph is the center of truth
- AI proposes changes instead of silently applying them
- accepted graph changes stay reversible through snapshots
- closure logic stays tied to meaningful topic completion
- the UI remains graph-first instead of drifting into admin-dashboard chrome
- local `main` stays honest about being a local edition

## Use this skill for

- graph canvas behavior
- workspace shell layout and hierarchy
- proposal review surfaces
- topic progression and closure flows
- feature ideas that may add new overlays, panes, or AI affordances

## Review workflow

1. Name the user path this change is trying to improve.
2. Check whether the graph becomes more legible, more central, or more actionable after the change.
3. Confirm that important state changes still pass through visible review and reversible persistence.
4. Ask whether the feature strengthens structured learning or merely adds generic productivity noise.
5. Compare the resulting surface against the product boundary: graph workspace, not note app, not dashboard, not autonomous-agent theater.
6. Verify the touched UI path and run the relevant checks before finalizing.

## Red flags

- overlays that replace the graph instead of supporting it
- AI actions that skip proposal review or hide assumptions
- completion mechanics reduced to shallow status toggles
- dashboard cards becoming more important than graph structure
- hosted-product framing leaking into the public local edition

## Good output

- concrete product critique tied to repository truth
- clear redesign guidance when a change weakens the product
- implementation advice that preserves visible control and reversibility
- no generic UX boilerplate
