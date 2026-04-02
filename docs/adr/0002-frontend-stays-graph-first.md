# ADR 0002: The frontend stays graph-first instead of dashboard-first

- Status: Accepted
- Date: 2026-03-31

## Context

Many productivity and AI products eventually drift into dashboard behavior:

- cards everywhere
- analytics chrome
- side panels competing for attention
- the core object reduced to a widget inside a management shell

For MapMind, that would be the wrong direction.

The graph is not an illustration layer. It is the main working surface. The UI has to preserve that feeling even as more features are added.

## Decision

The frontend should remain graph-first.

In practice that means:

- the graph canvas remains the visual center of the app
- overlays and controls should support the graph, not dominate it
- study, proposal, and closure flows should still feel attached to the graph state
- visual polish should improve readability and atmosphere, not replace structure

## Alternatives considered

### 1. Dashboard-first shell with a smaller graph widget

Rejected.

It would make the app easier to grow mechanically, but weaker as a product. The graph would stop feeling like the workspace itself.

### 2. Chat-first layout

Rejected.

That would collapse the product toward “LLM plus some graph context” instead of “graph workspace with an agent layer”.

### 3. Pure canvas with almost no supporting UI

Rejected.

The graph alone is not enough. Users still need inspector, settings, proposal review, snapshots, and study controls. The point is not minimalism for its own sake, but keeping the center of gravity on the graph.

## Consequences

Positive:

- the product identity stays clear
- graph scale and dependency structure remain readable
- new features are forced to justify how they relate to the graph

Negative:

- overlay layout is more demanding on narrow screens
- visual decisions must be made more carefully
- some generic admin-style UI patterns cannot be reused blindly

## Notes

This decision protects the strongest part of the product: the feeling that the learner is operating on a live knowledge graph, not managing a dashboard.
