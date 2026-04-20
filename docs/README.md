# Engineering Docs

This directory contains the engineering-facing markdown for the public `main` branch.

These docs are for people who want to run, inspect, modify, or extend the local edition. They are not the same thing as the product-facing docs in [`documentation/`](../documentation/README.md).

## Recommended reading order

1. [Local Quickstart](LOCAL_QUICKSTART.md)
2. [Architecture](ARCHITECTURE.md)
3. [Agentic Loop](AGENTIC_LOOP.md)
4. [Provider Guide](PROVIDER_GUIDE.md)
5. [Usage Guide](USAGE_GUIDE.md)
6. [MCP Setup](MCP_SETUP.md)
7. [Architecture Decision Records](adr/README.md)

## What each file is for

- [Local Quickstart](LOCAL_QUICKSTART.md): exact setup, reset, and local runtime workflow
- [Architecture](ARCHITECTURE.md): repository structure, boundaries, domain model, and service layout
- [Agentic Loop](AGENTIC_LOOP.md): the decision and apply loop behind chat, proposals, quizzes, and rollback
- [Provider Guide](PROVIDER_GUIDE.md): built-in providers, model config, and how to add another provider cleanly
- [Usage Guide](USAGE_GUIDE.md): source-material guidance for generating high-quality ingest input
- [MCP Setup](MCP_SETUP.md): connect Clew to Claude Desktop, Claude Code, or Cursor via the built-in MCP server
- [ADR index](adr/README.md): long-lived decisions that protect the product from drifting into weaker shapes

## What is intentionally not here

This directory is not meant to become a graveyard of speculative product plans. It should stay close to code that actually exists in `main`.
