# Frontend

This package contains the React workspace for the public local edition of MapMind.

Its job is not to look like a generic dashboard. It is the graph workspace itself: canvas, dialogs, shell, settings, and local debug surfaces.

## Main responsibilities

- render the graph canvas
- host the assistant and proposal review flow
- expose workspace settings for provider, model, memory, and closure behavior
- keep graph mutation visible and reviewable
- expose local debug surfaces in `main`

## Key files

| Path | Responsibility |
| --- | --- |
| `src/App.tsx` | top-level state and request wiring |
| `src/components/WorkspaceShell.tsx` | sidebar and workspace chrome |
| `src/components/GraphCanvas.tsx` | graph rendering, pan, zoom, interaction |
| `src/components/SettingsModal.tsx` | provider, memory, debug, and UX settings |
| `src/components/AppDialogs.tsx` | proposal, import/export, and supporting dialogs |
| `src/lib/api.ts` | frontend API transport |
| `src/lib/graph.ts` | graph transforms and local graph helpers |
| `src/lib/appContracts.ts` | UI-facing preset and contract helpers |

## Commands

```bash
npm run dev
npm run typecheck
npm run build
```

## Design rule

The graph should always feel like the main surface.

If a frontend change makes the workspace feel more like a dashboard, admin panel, or generic chat shell, it is probably the wrong direction.
