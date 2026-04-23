# Clew 0.2.0 Release Notes

0.2.0 takes Clew from a graph experiment to a product.

The release is built around one idea:

**a thread through anything you're learning.**

Builder shorthand: **roadmap.sh, but personalized and adaptive**.

## Product Positioning

- Renamed the product to Clew.
- Added the Clew mark, favicon set, loader, and new brand language.
- Reframed the product around personal adaptive learning paths instead of generic graph visualization.
- Updated the local edition story: hosted site for fastest trial, repo for full local control.

## Interface And Themes

- Added full light and dark theme support.
- Split theme CSS into core, overrides, workspace chat, dialog/canvas, and token files.
- Added the Paper light theme and refined the Midnight dark theme.
- Rebuilt large parts of the workspace shell.
- Added cleaner graph controls and a more coherent workspace shell.
- Added the Clew launch loader.
- Improved graph motion, curved edge stability, zone styling, and manual layout behavior.

## Obsidian

- Added Obsidian vault import.
- Added import preview and validation.
- Converts Markdown notes to topics.
- Converts wiki links and explicit relation hints into graph edges.
- Can create zones from folder paths.
- Can preserve note bodies as artifacts.
- Can create placeholder topics for missing links when enabled.
- Added Obsidian graph export.
- Exports Clew graphs as an Obsidian-ready folder with topic notes, resources, artifacts, zones, metadata, and optional progress.

## MCP

- Added `Clew Study Assist`, a read-only MCP stdio server.
- Added tools for listing graphs, reading current learning context, inspecting a node, and searching notes.
- Added setup docs for Claude Desktop, Claude Code, and Cursor.
- Kept MCP read-only so external assistants can use graph context without silently mutating the workspace.

## AI And Study Loop

- Refined planner prompts and proposal validation.
- Added provider/model configuration improvements.
- Added thinking, memory, grounding, persona, and token budget controls.
- Added graph-scoped chat model selection.
- Added chat sessions and proposal-applied sync.
- Improved inline quiz and closure quiz behavior.
- Added failed attempt surfacing.
- Added stricter proposal safety around graph mutation and completion state.

## Local Runtime And Architecture

- Added `.env.example` for faster local onboarding.
- Split backend route dependencies and route helpers.
- Split repository storage/config concerns.
- Added debug log capture for local frontend/API/backend failures.
- Added more tests around chat persistence, MCP tools, providers, proposals, repository behavior, and quiz routes.
- Added graph canvas core and interaction tests.
- Split frontend components and hooks across assistant, dialogs, shell overlays, graph core, settings, persistence, and layout helpers.

## Why This Release Matters

Clew 0.2.0 turns the product into a clearer promise:

You can start from a goal, notes, or messy topics; use AI to draft the structure; inspect the graph; study through it; and keep the path portable through Obsidian and MCP.

The product is still local-first and hackable, and the surface is closer to matching the product idea.
