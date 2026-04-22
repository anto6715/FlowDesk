# Flow Desk Agent Notes

## Project identity

- Product name: `Flow Desk`
- Repo slug: `flow-desk`
- Backend package: `flowdesk`
- Repository topology: one repo with `backend/` and `frontend/`

## Primary references

- Design checkpoint: `docs/design-checkpoint.md`
- Active UX redesign plan: `docs/ux-redesign-plan.md`
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
- Core task UI feedback pass committed in `173df92`
- Left navigation and distraction-free Home committed in `646cabd`
- URL-first GitHub reference entry committed in `80db251`
- Prominent task notes and task-scoped experiment creation committed in `70f88a0`
- Task-linked daily journal entries committed in `8af9b9e`
- Dedicated experiment registration UI committed in `ecb7523`
- SQLite Alembic version-stamp persistence fix committed in `1d74f04`
- UX redesign plan committed in `b5eb63d`
- UX redesign Point 1 shell/hidden-action foundation committed in `1ec4268`
- UX redesign Point 2 redesigned Home cockpit committed in `7160403`
- UX redesign Point 3 shared frontend form components committed in `980f66a`
- UX redesign Point 4 redesigned task workspaces committed in `5e25f8d`
- UX redesign Point 5 redesigned Journal, Experiments, and Calendar committed in `4d6bf09`
- UX redesign Point 6 visual and mobile polish committed in `d9336fe`
- Post-redesign task workflow UI polish committed in `e7ae703`
- Current backend now includes:
  - verified dependency lockfile via `uv`
  - Alembic migration baseline
  - Alembic migration for task-linked daily journal entries
  - task timing routes
  - task work-session history read route
  - task metadata update route
  - macro-activity routes
  - GitHub reference routes, including cached metadata updates
  - experiment registry routes with state-transition history
  - scheduled-block planning routes with move/status history
  - daily journal, task-linked journal entry, task note, and experiment note routes
  - API tests against temporary SQLite databases
- Current frontend now includes:
  - redesigned `Home` focused on active task, recent journal notes, compact next-up context, and dialog-based quick actions
  - local API client for task flows
  - local API client coverage for experiments, scheduled blocks, and journal entries
  - shared frontend components for task creation, experiment registration, task selection, GitHub URL-first entry, and quick-action dialogs
  - Home quick actions for task, note, and experiment creation
  - task and journal note creation with optional task links for daily journal entries
  - task creation with inline macro-activity and URL-first GitHub reference selection/creation
  - left-panel navigation for Home, Tasks, Journal, Experiments, and Calendar
  - dedicated `Experiments`, `Journal`, and `Calendar` views
  - dedicated experiment registration form
  - focused Tasks workspace with Backlog/Ready/Waiting/Blocked workflow lanes, compact counts, filters, task table, Start/Switch actions, and dialog-based task creation
  - `Backlog` is the frontend label for backend `Task.status == "inbox"`; no separate backlog entity exists
  - notes-first task detail workspace with read-only context, dialog-based metadata editing, experiment creation, references, sessions, linked experiments, and planned sessions
  - Journal workspace centered on daily writing with lightweight optional task linking
  - Experiments registry with compact counts, scannable table rows, state selector, and dialog-based registration
  - Calendar day timeline with dialog-based planned session creation
  - planned sessions on Home and Calendar open their linked task detail
  - mobile task and experiment tables render as stacked card rows instead of horizontal scrollers
  - desktop/mobile visual smoke pass for Home, Tasks, Task Detail, Journal, Experiments, and Calendar with no page-level horizontal overflow
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
3. Read `docs/ux-redesign-plan.md`
4. Check `git status --short`
5. Confirm whether the user wants feedback-driven UI polish or the next backend/product slice
6. If continuing UI polish, start with experiment detail/comments, then Journal note editing and task-reference autocomplete, then planned-session edit/reschedule/cancel affordances
7. Default later product slice is reporting, backup/export/import, experiment detail, then URL-backed routing

## Near-term implementation order

1. Continue user-feedback UI polish before adding broad new features
2. Next UI slice: experiment detail page with instruction/code-friendly visualization and experiment-scoped notes/comments
3. Then: Journal note editing plus smarter task linking/autocomplete
4. Then: planned-session edit/reschedule/cancel interactions
5. Resume reporting, backup/export/import, and URL-backed routing after the UI workflow is stable enough for user testing

## Commit guidance

- Small, regular commits are allowed
- Do not rewrite history unless explicitly requested
- Keep design docs and code changes in sync when decisions change
