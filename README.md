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

This repository contains the agreed design checkpoint and the initial project scaffold.

The first implementation shape is:

- one Git repository
- `backend/` for the Python application core and API
- `frontend/` for the React UI
- `docs/` for design records and architecture decisions

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
uv run uvicorn flowdesk.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Design references

- Design checkpoint: [docs/design-checkpoint.md](docs/design-checkpoint.md)
- ADR 0001: [docs/adr/0001-monorepo-and-delivery-shape.md](docs/adr/0001-monorepo-and-delivery-shape.md)
- ADR 0002: [docs/adr/0002-application-architecture.md](docs/adr/0002-application-architecture.md)
- Agent context: [AGENTS.md](AGENTS.md)
