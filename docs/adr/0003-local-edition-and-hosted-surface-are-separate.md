# ADR 0003: The public local edition and hosted product stay split

- Status: Accepted
- Date: 2026-03-31

## Context

Clew currently has two distinct realities:

1. a public local edition meant to be runnable, inspectable, and modifiable as code
2. a hosted product meant to reduce setup friction and test product demand

Trying to collapse those two surfaces into one identical code and docs story would make both worse.

The public branch needs local control, provider ownership, and direct developer ergonomics. The hosted product needs simple onboarding, a cleaner path for non-technical users, and room to experiment with product packaging.

## Decision

Keep the public local edition and the hosted product explicitly separate in emphasis.

For `main`, optimize for:

- local setup
- provider ownership
- graph pack import/export
- engineering clarity
- public codebase legibility

For the hosted surface, optimize for:

- immediate product trial
- less setup friction
- library/discovery surfaces
- fast user feedback about whether the product is wanted

## Alternatives considered

### 1. Make the public repo mirror the hosted product exactly

Rejected.

That would either expose surfaces that do not belong in the public local branch or force the repo to carry product baggage that is not useful for local users.

### 2. Ignore the hosted product entirely in the public docs

Rejected.

That would hide an important part of the real product story and remove the easiest path for people who simply want to try Clew.

### 3. Treat the hosted product as the only real version

Rejected.

That would weaken the open-source and developer story of Clew, which matters for trust, contribution, and long-term architecture quality.

## Consequences

Positive:

- the public branch stays honest about what it is
- the hosted product can move faster on onboarding and presentation
- documentation can describe both surfaces without confusing their roles

Negative:

- docs and packaging need clearer wording
- some features exist in different forms or at different maturity levels
- contributors need to understand which surface they are touching

## Notes

This split is not a compromise born from mess. It is a deliberate product and repository boundary.
