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
- Milestone 1 in progress: persistence baseline and initial schema

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

1. Finish persistence baseline and initial migration
2. Implement task/work-session application services
3. Expose first task timing API endpoints
4. Build the first real `Today` UI against those endpoints

## Commit guidance

- Small, regular commits are allowed
- Do not rewrite history unless explicitly requested
- Keep design docs and code changes in sync when decisions change

