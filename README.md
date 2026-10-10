# Handsfree

Chrome MV3 extension: browse any site with head movement and voice.

## Architecture

```
┌─────────────────────────────┐      chrome.runtime
│        Side Panel           │◄────────────────────┐
│  ┌────────┐ ┌─────────────┐ │                     │
│  │ Vision │ │Orchestrator │ │      ┌──────────────┴──────────────┐
│  │  (P1)  │ │    (P3)     │ │      │       Content Script        │
│  └────────┘ └─────────────┘ │      │  ┌────────┐  ┌───────────┐  │
│  ┌────────┐ ┌─────────────┐ │      │  │ Engine │  │  Overlay  │  │
│  │ Voice  │ │  UI / App   │ │      │  │  (P2)  │  │   (P4)    │  │
│  │  (P3)  │ │    (P4)     │ │      │  └────────┘  └───────────┘  │
│  └────────┘ └─────────────┘ │      └─────────────────────────────┘
└─────────────────────────────┘
        Background SW (P3): relays messages, opens side panel on click
```

## Quick Start

```bash
npm install
npm run build
```

Then load `dist/` as an unpacked extension in `chrome://extensions` (Developer mode ON).

## Commands

| Command             | What it does                                          |
|---------------------|-------------------------------------------------------|
| `npm run dev`       | Vite dev server (dev harness pages at /dev/*)         |
| `npm run build`     | Production build → `dist/` (loadable as extension)    |
| `npm test`          | Run unit tests (Vitest)                               |
| `npm run e2e`       | Run end-to-end tests (Playwright)                     |
| `npm run typecheck` | TypeScript strict check                               |

## Dev Harness Pages

Each module has its own page for isolated development:

- `/dev/vision/` — P1 head-tracking sandbox
- `/dev/engine/` — P2 resolver sandbox
- `/dev/overlay/` — P4 overlay sandbox
- `/dev/voice/`   — P3 voice sandbox

Run `npm run dev` and open the page for your module.

## Folder Ownership

See `docs/PROJECT_BRIEF.md` for the full team/folder map.

## Key Files

- `src/shared/contract.ts` — shared types (source of truth, P3 only)
- `src/shared/bus.ts` — Transport interface (chrome messaging + in-memory)
- `public/manifest.json` — MV3 manifest
