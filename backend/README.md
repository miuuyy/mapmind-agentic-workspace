# Backend

This package contains the FastAPI backend for the public local edition of Clew.

The backend is responsible for storing the workspace, validating graph mutations, running the agent loop, and keeping accepted graph changes reversible.

## Main responsibilities

- expose API routes for graph, chat, quiz, snapshots, and settings
- persist workspace state in local SQLite
- run the orchestrator and planner flows
- hold the provider seam for Gemini and OpenAI
- validate proposals before they can be applied
- support local debug logging in `main`

## Key areas

| Path | Responsibility |
| --- | --- |
| `app/api/routes.py` | HTTP transport layer |
| `app/models/` | domain and API models |
| `app/services/repository.py` | persistence, workspace config, snapshots |
| `app/services/chat_orchestrator.py` | action choice for answer, quiz, or proposal |
| `app/services/proposal_planner.py` | proposal draft generation and validation bridge |
| `app/services/quiz_service.py` | closure and quiz flows |
| `app/llm/` | providers, model catalog, contracts, prompt templates, schemas |
| `tests/` | regression coverage |

## Local commands

Install in editable mode:

```bash
python -m pip install -e backend
```

Run tests:

```bash
PYTHONPATH=backend python -m unittest discover -s backend/tests -v
```

## Design rule

The backend should fail honestly.

If a provider cannot satisfy a contract, or a proposal cannot be validated safely, the backend should reject it explicitly instead of inventing a fake success path.
