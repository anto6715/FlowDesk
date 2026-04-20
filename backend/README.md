# Flow Desk Backend

This package contains the Python application core for Flow Desk.

Current scope:

- API bootstrap
- application settings
- SQLite and Alembic baseline
- domain schema for tasks, sessions, planning, experiments, notes, references, artifacts, and transitions
- task/work-session services and routes
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

The next backend-facing slices are richer read models for task detail, experiment detail,
calendar feeds, and reports. The immediate product work is frontend integration for the
existing API surface.
