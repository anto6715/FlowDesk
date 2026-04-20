# Flow Desk Agent Notes

## Project identity

- Product name: `Flow Desk`
- Repo slug: `flow-desk`
- Backend package: `flowdesk`
- Repository topology: one repo with `backend/` and `frontend/`

## Primary references

- Design checkpoint: `docs/design-checkpoint.md`
- ADR 0001: `docs/adr/0001-monorepo-and-delivery-shape.md`
- ADR 0002: `docs/adr/0002-application-architecture.md`

## Current status

- Design approved through Level 5
- Bootstrap completed
- Persistence baseline committed in `ca3f053`
- Task timing services and routes committed in `4cffd4a`
- Reference APIs and backend integration tests committed in `0a2fed6`
- Current backend now includes:
  - verified dependency lockfile via `uv`
  - Alembic migration baseline
  - task timing routes
  - macro-activity routes
  - GitHub reference routes
  - experiment registry routes with state-transition history
  - scheduled-block planning routes with move/status history
  - daily journal, task note, and experiment note routes
  - API tests against temporary SQLite databases
- Current frontend now includes:
  - first real `Today` cockpit
  - local API client for task flows
  - Vite proxy to the backend `/api`
  - verified production build with `npm run build`

## Core invariants

- At most one active human task at a time
- `WorkSession` is historical fact
- `ScheduledBlock` is planning only
- Experiment runtime is not human work time
- Waiting reasons must be explicit
- GitHub integration is optional and reference-first in `v1`
- Local-first reliability is more important than deep external automation in `v1`

## Stack decisions

- Backend: Python, FastAPI, SQLAlchemy, Alembic, SQLite
- Frontend: React, TypeScript, Vite
- Desktop packaging later: Tauri

## Repository map

- `backend/`: Python backend, schema, migrations, services
- `frontend/`: React UI
- `docs/`: design checkpoint and ADRs
- `artifacts/`: local outputs and generated assets

## Resume checklist

When resuming a future session:

1. Read `AGENTS.md`
2. Read `docs/design-checkpoint.md`
3. Check `git status --short`
4. Continue from the current milestone, not from scratch

## Near-term implementation order

1. Connect experiments, scheduled blocks, and notes into richer UI surfaces
2. Connect macro-activities and GitHub references into richer task creation UI
3. Add frontend navigation beyond the `Today` cockpit
4. Extend reporting queries once the core flows are visible in the UI

## Commit guidance

- Small, regular commits are allowed
- Do not rewrite history unless explicitly requested
- Keep design docs and code changes in sync when decisions change
