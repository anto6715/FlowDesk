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

This repository contains the agreed design checkpoint and the first working local app slices.

The current implementation shape is:

- one Git repository
- `backend/` for the Python application core and FastAPI API
- `frontend/` for the React/Vite UI
- `docs/` for design records and architecture decisions

Implemented so far:

- SQLite/Alembic persistence baseline
- task creation, start, pause, switch, waiting, and completion flows
- macro-activity and GitHub reference APIs
- experiment registry APIs with state-transition history
- scheduled-block planning APIs with move/status history
- daily journal, task note, and experiment note APIs
- task work-session history read API
- Today cockpit frontend with task timing, experiments, planned blocks, and journal entries
- richer task creation with macro-activity and GitHub reference selection/creation
- app-level navigation with a dense Global Tasks view
- dedicated Experiments, Journal, and Calendar views
- task detail workspace with references, sessions, linked experiments, planned blocks, and notes
- backend API tests against temporary SQLite databases
- verified frontend production build

## Repository layout

- `backend/`
- `frontend/`
- `docs/`
- `scripts/`
- `artifacts/`
- `tests/`

## Architecture baseline

- Product name: `Flow Desk`
- Repo slug: `flow-desk`
- Python package: `flowdesk`
- Delivery shape: local-first web app first, desktop packaging later
- Backend stack: Python, FastAPI, SQLAlchemy, Alembic, SQLite
- Frontend baseline: React + Vite
- Planned frontend additions during feature work: TanStack Router, TanStack Query, TanStack Table, FullCalendar

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

1. Add report read models and reporting UI.
2. Add backup/export/import baseline.
3. Add experiment detail notes/artifacts UI.
4. Replace local view switching with URL-backed routing when navigation state needs deep links.

## Design references

- Design checkpoint: [docs/design-checkpoint.md](docs/design-checkpoint.md)
- ADR 0001: [docs/adr/0001-monorepo-and-delivery-shape.md](docs/adr/0001-monorepo-and-delivery-shape.md)
- ADR 0002: [docs/adr/0002-application-architecture.md](docs/adr/0002-application-architecture.md)
- Agent context: [AGENTS.md](AGENTS.md)
