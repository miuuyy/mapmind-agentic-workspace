# Security Policy

Security reports are welcome.

MapMind is still a small project, but it already deals with local workspace data, provider credentials, imported graph packs, and graph mutation flows. If you find a vulnerability, please report it privately before disclosing it publicly.

## Report a vulnerability

Please email:

- [johnymaarrete@gmail.com](mailto:johnymaarrete@gmail.com)

Include as much of the following as possible:

- a clear description of the problem
- affected area or endpoint
- steps to reproduce
- expected behavior versus actual behavior
- screenshots, traces, or proof-of-concept code if helpful
- whether the issue affects only `main`, only the hosted product, or both

## Good reports usually cover

- auth or session handling
- provider key leakage
- import/export safety
- unsafe file handling
- graph mutation bypasses
- rollback or snapshot corruption
- prompt injection or data-exfiltration paths that cross explicit boundaries

## Please do not

- open a public issue before private disclosure
- publish working exploit details before a fix exists
- test against infrastructure you do not own or have permission to test

## Scope

This repository is the local developer edition, but security feedback is still useful for:

- local data integrity
- secret handling
- API boundary correctness
- safe provider integration
- graph pack and import/export behavior

If your report concerns the hosted product specifically, mention that explicitly so it can be triaged correctly.

## Response expectations

I may not respond like a large company security team, but serious reports will be read and investigated. Clear, reproducible reports help the most.
