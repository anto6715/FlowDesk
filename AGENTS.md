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
- Experiment services and routes committed in `0ebe200`
- Scheduled-block services and routes committed in `15f49ea`
- Journal and note APIs committed in `dd1150f`
- Today cockpit operational frontend integration committed in `af8a608`
- Reference-aware task creation UI committed in `e4dc2b0`
- Global Tasks navigation view committed in `ebc9aed`
- Dedicated operational views committed in `7cbe422`
- Task work-session read API committed in `7a10795`
- Task detail workspace UI committed in `a005681`
- Task and GitHub reference metadata update APIs committed in `6980037`
- Current backend now includes:
  - verified dependency lockfile via `uv`
  - Alembic migration baseline
  - task timing routes
  - task work-session history read route
  - task metadata update route
  - macro-activity routes
  - GitHub reference routes, including cached metadata updates
  - experiment registry routes with state-transition history
  - scheduled-block planning routes with move/status history
  - daily journal, task note, and experiment note routes
  - API tests against temporary SQLite databases
- Current frontend now includes:
  - first real `Today` cockpit
  - local API client for task flows
  - local API client coverage for experiments, scheduled blocks, and journal entries
  - Today panels for running/stalled experiments, planned blocks, and daily journal entries
  - quick actions to register experiments, schedule blocks, and append journal entries
  - task creation with inline macro-activity and GitHub reference selection/creation
  - Tasks/Journal-first navigation with secondary access to Today, Experiments, and Calendar
  - dedicated `Experiments`, `Journal`, and `Calendar` views
  - task detail workspace with metadata editing, references, sessions, linked experiments, planned blocks, and notes
  - calendar day timeline with a non-overlapping schedule form
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

1. User-test the updated task creation, task detail metadata editing, and calendar workflows
2. Patch UI feedback from that test pass, especially spacing, navigation, and form ergonomics
3. Add report read models and reporting UI
4. Add backup/export/import baseline
5. Add experiment detail notes/artifacts UI
6. Replace local view switching with URL-backed routing when navigation state needs deep links

## Commit guidance

- Small, regular commits are allowed
- Do not rewrite history unless explicitly requested
- Keep design docs and code changes in sync when decisions change
