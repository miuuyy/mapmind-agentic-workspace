---
name: mapmind-agent-boundaries
description: Guardrail skill for MapMind agent, planner, provider, and model-contract work. Use when changing orchestrator logic, proposal generation, quiz flows, provider/model selection, LLM schemas, prompts, or validation around model output.
---

# MapMind Agent Boundaries

Use this skill when touching the parts of MapMind that decide, validate, or apply AI behavior.

## Read first

- `docs/agents/PROJECT_CONTEXT.md`
- `docs/agents/WORKFLOW.md`
- `docs/AGENTIC_LOOP.md`
- `docs/ARCHITECTURE.md`
- `docs/adr/0001-graph-mutations-must-be-reviewable-and-reversible.md`

Read `references/audit-checklist.md` when you need the concrete review checklist, search commands, or file map.

## Use this skill for

- `backend/app/services/chat_orchestrator.py`
- `backend/app/services/gemini_planner.py`
- `backend/app/services/quiz_service.py`
- `backend/app/llm/`
- action contracts, prompt contracts, schemas, provider seams, and review gates

## Core law

Treat the selected model as the decision engine.

If behavior is weak, improve:

- role
- context pack
- typed output contract
- examples
- validation boundary

Do not improve it with:

- keyword routers
- semantic hardcodes
- hidden provider switching
- hand-written model overrides
- fallback logic that impersonates understanding

## Protect these boundaries

- The graph stays the center of truth.
- AI can propose graph mutation, not silently perform it.
- Accepted graph changes stay reversible through snapshots.
- Deterministic code validates structure, policy, permissions, and evidence only.
- If a provider cannot satisfy the contract, the system fails explicitly instead of pretending success.

## Workflow

1. Map the requested change to the loop step it affects: context assembly, action choice, proposal generation, review, apply, or rollback.
2. Identify the explicit contract that should own the behavior: prompt, schema, validator, repository boundary, or API response model.
3. Check whether the change preserves model primacy or sneaks in semantic control from code.
4. Prefer better context, clearer schemas, and stricter validation over special-case branching.
5. Keep mutation review legible. If the user cannot inspect or reject the effect, the design is wrong for MapMind.
6. Run targeted verification for the touched path before calling the work done.

## Allowed deterministic code

- validate JSON structure and typed payloads
- enforce policy and permission boundaries
- reject invalid proposals and malformed output
- manage retries, timeouts, and idempotent side effects
- persist evidence, traces, snapshots, and workspace state

## Red flags

- code that decides the semantic answer before the model does
- silent fallback from one provider or model to another
- planner patches that rewrite intent instead of rejecting bad output
- hidden auto-apply behavior for graph mutations
- branch tables that special-case brands, keywords, or prompt phrases

## Output expectations

When using this skill, explain the change in terms of:

- which contract now owns the behavior
- which invariant is being protected
- how the failure mode stays explicit
- what verification was run
