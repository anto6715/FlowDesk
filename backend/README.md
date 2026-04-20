# Flow Desk Backend

This package contains the Python application core for Flow Desk.

Current scope:

- API bootstrap
- application settings
- SQLite and Alembic baseline
- domain schema for tasks, sessions, planning, experiments, notes, references, artifacts, and transitions
- task/work-session services and routes
- task work-session history read route
- macro-activity and GitHub reference routes
- experiment services and routes with state-transition history
- scheduled-block services and routes with move/status history
- daily journal, task note, and experiment note routes
- API tests against temporary SQLite databases

Useful commands:

```bash
uv sync
uv run alembic upgrade head
uv run uvicorn flowdesk.main:app --reload
uv run ruff check .
uv run pytest
```

The next backend-facing slices are report read models, backup/export/import, and richer
detail read models if frontend drill-down starts duplicating too much client-side assembly.
