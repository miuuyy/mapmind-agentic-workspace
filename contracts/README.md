# Contracts

This directory contains transport-facing JSON contracts used by graph mutation flows.

These files are not the whole domain model. They are the explicit exchange surfaces that make proposal handling inspectable and tool-friendly.

## Current contract

- `graph_patch.schema.json`

## Why this exists

MapMind is built around reviewable graph mutation. A visible contract makes it easier to:

- inspect proposal shape outside the app
- validate tooling around graph patch transport
- keep mutation surfaces explicit instead of hidden in ad-hoc code

## Relationship to the backend

The backend also has richer Pydantic models and planner draft schemas. This directory holds the JSON-facing contract surface, not every internal runtime type.
