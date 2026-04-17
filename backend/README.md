# Flow Desk Backend

This package contains the Python application core for Flow Desk.

Current scope:

- API bootstrap
- application settings
- SQLite and Alembic baseline
- initial domain schema for tasks, sessions, planning, experiments, and notes

Useful commands:

```bash
uv sync
uv run alembic upgrade head
uv run uvicorn flowdesk.main:app --reload
uv run pytest
```

The next functional slice will add task/work-session services and the first API endpoints for timing workflows.
