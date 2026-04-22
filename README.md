# Flow Desk

Flow Desk is a local-first task management cockpit for HPC work.

The product combines:

- task tracking
- human time tracking
- experiment tracking
- daily journal notes
- planning/calendar views
- reporting by task and macro-activity

## Current status

This repository contains the agreed design checkpoint and the current working local app slices.

The current implementation shape is:

- one Git repository
- `backend/` for the Python application core and FastAPI API
- `frontend/` for the React/Vite UI
- `docs/` for design records and architecture decisions

Implemented so far:

- SQLite/Alembic persistence baseline
- task creation, start, pause, switch, waiting, and completion flows
- task metadata update APIs
- macro-activity and GitHub reference APIs, including GitHub reference metadata updates
- experiment registry APIs with state-transition history
- scheduled-block planning APIs with move/status history
- daily journal, task-linked journal entry, task note, and experiment note APIs
- task work-session history read API
- redesigned Home focused on active task, recent journal notes, and compact next-up context
- task creation with inline macro-activity and URL-first GitHub reference selection/creation
- left-panel navigation for Home, Tasks, Journal, Experiments, and Calendar
- focused Tasks workspace with Backlog/Ready/Waiting/Blocked workflow lanes, compact counts, filters, Start/Switch actions, mobile card rows, and dialog-based creation
- Backlog is the UI label for backend inbox tasks; there is no separate backlog model yet
- notes-first task detail workspace with dialog-based metadata editing, experiment creation, and planned session visibility
- Journal workspace centered on daily writing with optional task links
- Experiments registry with compact counts, scannable rows, state selector, and dialog-based registration
- Calendar day timeline with dialog-based planned session creation and task-detail navigation from scheduled items
- desktop/mobile visual pass with no page-level horizontal overflow
- backend API tests against temporary SQLite databases
- verified frontend production build

## Repository layout

- `backend/`
- `frontend/`
- `docs/`
- `artifacts/`

## Architecture baseline

- Product name: `Flow Desk`
- Repo slug: `flow-desk`
- Python package: `flowdesk`
- Delivery shape: local-first web app first, desktop packaging later
- Backend stack: Python, FastAPI, SQLAlchemy, Alembic, SQLite
- Frontend baseline: React + Vite
- Potential later frontend additions: URL-backed routing and richer reporting/table/calendar helpers when the workflows need them

## Getting started

Backend:

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn flowdesk.main:app --host 127.0.0.1 --port 8000 --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

By default the frontend dev server proxies `/api` to `http://127.0.0.1:8000`.

Useful verification commands:

```bash
cd backend
uv run ruff check .
uv run pytest

cd ../frontend
npm run build
```

## Next steps

Near-term implementation order:

1. User-test the updated Home, Tasks, Task detail, Journal, Experiments, and Calendar workflows.
2. Continue UI polish with experiment detail pages, instruction/code visualization, and experiment-scoped notes/comments.
3. Add Journal note editing and smarter task linking/autocomplete.
4. Add planned-session edit/reschedule/cancel interactions.
5. Add report read models and reporting UI.
6. Add backup/export/import baseline.
7. Replace local view switching with URL-backed routing when navigation state needs deep links.

## Design references

- Design checkpoint: [docs/design-checkpoint.md](docs/design-checkpoint.md)
- ADR 0001: [docs/adr/0001-monorepo-and-delivery-shape.md](docs/adr/0001-monorepo-and-delivery-shape.md)
- ADR 0002: [docs/adr/0002-application-architecture.md](docs/adr/0002-application-architecture.md)
- Agent context: [AGENTS.md](AGENTS.md)
