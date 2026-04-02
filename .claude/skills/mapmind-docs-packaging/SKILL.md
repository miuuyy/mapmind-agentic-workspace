---
name: mapmind-docs-packaging
description: Documentation packaging skill for MapMind's public repository. Use when writing or revising README files, engineering docs, product docs, agent docs, or contributor-facing copy that shapes how the repo is understood in public.
---

# MapMind Docs Packaging

Use this skill when editing docs that change how contributors or users understand the project.

## Read first

- `docs/agents/PROJECT_CONTEXT.md`
- `docs/agents/WORKFLOW.md`
- `docs/README.md`
- `docs/ARCHITECTURE.md`
- `CLAUDE.md`
- `AGENTS.md`

Read `references/packaging-map.md` when deciding where content belongs or when reviewing docs for public-release quality.

## Goal

Make the repository read like a serious open-source product:

- clear entry point
- strong quick start
- visible trust surface
- honest architecture
- no filler or fake roadmap energy

## Non-negotiable doc split

- `README.md` is the public front door
- `documentation/` is product-facing source material
- `docs/` is engineering and repository documentation
- agent workflow material lives with agent docs and repo-local skill assets

Do not mix these casually.

## Workflow

1. Identify the primary audience for the doc: newcomer, contributor, local developer, or agent.
2. Choose the right surface before writing. If the destination is wrong, the wording will drift too.
3. Answer the core public-repo questions early:
   - What is this?
   - Why does it exist?
   - How do I run it quickly?
   - What are the hard product boundaries?
   - Where do I go deeper?
4. Keep claims honest about the local edition. Do not imply hosted capabilities that are not present in `main`.
5. Prefer short, concrete paragraphs over marketing abstractions.
6. Link to deeper docs instead of bloating entry docs.
7. After editing, verify that links, commands, and repo claims still match reality.

## Quality bar

Strong docs for this repo should:

- explain MapMind quickly without turning it into a generic AI app
- show why graph-first and proposal-based behavior matter
- help contributors find the right layer fast
- preserve the trust boundary between local `main` and hosted product ideas

## Red flags

- mixing engineering docs into product-facing pages
- describing speculative features as if they already exist
- README sections that bury the value proposition below setup noise
- vague AI language that hides the proposal and snapshot model
- copy that makes the product sound like a dashboard, note app, or agent swarm

## Output expectations

When using this skill, produce docs that are:

- specific
- navigable
- easy to extend
- explicit about where deeper material lives
