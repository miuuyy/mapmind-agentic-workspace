# ADR 0001: Graph mutations must be reviewable and reversible

- Status: Accepted
- Date: 2026-03-31

## Context

MapMind is built around a graph that represents an actual learning path.

If AI is allowed to mutate that graph silently, two bad things happen quickly:

1. the graph stops being trustworthy
2. the user loses the feeling that the workspace belongs to them

This risk is even higher in a study product, because prerequisite structure and completion state are not decorative. They directly affect how the learner decides what to study next.

## Decision

Graph mutation in MapMind must be proposal-based.

That means:

- AI can suggest graph changes
- the user reviews those changes before apply
- accepted changes create snapshot history
- rollback remains available after acceptance

The model is not allowed to silently rewrite the graph behind the scenes.

## Alternatives considered

### 1. Silent AI mutation

Rejected.

It is faster in the short term, but it destroys trust and makes the graph feel like unstable AI output instead of persistent workspace state.

### 2. Manual-only graph editing

Rejected as the only path.

It keeps control high, but it gives up too much of the value of an AI-assisted graph workspace.

### 3. Proposal review without rollback

Rejected.

Review alone is not enough for a system that is meant to be exploratory. Users need a way to move forward quickly without treating each apply as irreversible.

## Consequences

Positive:

- the graph stays trustworthy
- AI assistance feels powerful without becoming opaque
- experimentation becomes safer
- snapshots become a real product guarantee, not a decorative feature

Negative:

- proposal generation and apply flows are more complex
- the UI needs explicit review surfaces
- storage and snapshot handling become first-class architecture concerns

## Notes

This is one of the core decisions that makes MapMind feel like a controlled workspace instead of a generic AI wrapper.
