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
- Planned-session interaction UI committed in `ba3540a`
- Active plan is now Flow Desk v2 workbench redesign: medium Logseq-style editable note blocks, tags, backlinks, and integrated task/experiment navigation
- V2 Point 1 workbench interaction architecture committed in `f8eb66d`
- V2 Point 2 note block backend foundation committed in `154f024`
- V2 Point 3 bullet journal UI committed in `44605d3`
- Current backend now includes:
  - verified dependency lockfile via `uv`
  - Alembic migration baseline
  - Alembic migration for task-linked daily journal entries
  - Alembic migration for note blocks and parsed note backlinks
  - task timing routes
  - task work-session history read route
  - task metadata update route
  - macro-activity routes
  - GitHub reference routes, including cached metadata updates
  - experiment registry routes with state-transition history
  - scheduled-block planning routes with move/status history
  - daily journal, task-linked journal entry, task note, and experiment note routes
  - daily journal note block routes with block update and task/experiment/tag backlink queries
  - legacy daily journal note writes bridged to note blocks during the v2 transition
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
  - Calendar day timeline with dialog-based planned session creation and management
  - planned sessions on Home, Calendar, and task detail open a management dialog for rescheduling, completing, canceling/reopening, and starting/switching to the linked task
  - Home now shows Backlog context directly; task and experiment references can open detail views without using left navigation
  - experiment detail view exists with linked task navigation, run metadata, instruction/command display, and experiment notes
  - reusable bullet note editor and markdown renderer shared by Home and Journal
  - Home and Journal now use daily note blocks instead of append-only legacy journal rendering
  - existing daily bullets can be edited in place in Journal and from Home quick actions
  - `scripts/dev.sh` starts the local SQLite database path, Alembic migrations, backend, and frontend together
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
5. Continue from the Flow Desk v2 workbench plan in `docs/ux-redesign-plan.md`
6. Ask the user before starting each V2 point
7. Do not resume broad reporting/export work until the v2 workbench and note-linking foundation are usable

## Near-term implementation order

1. V2 Point 4: tags, references, and backlinks
2. V2 Point 5: Home workbench redesign
3. V2 Point 6: experiment detail and comments
4. V2 Point 7: reporting integration

## Commit guidance

- Small, regular commits are allowed
- Do not rewrite history unless explicitly requested
- Keep design docs and code changes in sync when decisions change
