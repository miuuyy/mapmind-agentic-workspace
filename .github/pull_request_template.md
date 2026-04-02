## Summary

- what changed
- why it changed
- which surface it affects

## Problem

Describe the user or developer problem this PR solves.

## Solution

Describe the change in product terms, not only in code terms.

## Verification

- [ ] `cd frontend && npm run typecheck`
- [ ] `cd frontend && npm run build`
- [ ] `PYTHONPATH=backend ./.venv/bin/python -m unittest discover -s backend/tests -v`
- [ ] verified manually if the change affects UI or workflow behavior

## Screenshots or traces

Add before/after screenshots, debug traces, or short notes if relevant.

## Boundaries check

- [ ] no silent AI mutation added
- [ ] no hidden fallback or compatibility hack added
- [ ] no dead docs or dead UI surface introduced

## Notes

Anything reviewers should know before reading this PR.
