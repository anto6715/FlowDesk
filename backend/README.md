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

From the repository root, the easiest development startup is:

```bash
./scripts/dev.sh
```

Manual backend-only startup:

```bash
cd /work/antonio/mydev/hpc_task_management
mkdir -p artifacts
export FLOWDESK_DATABASE_URL="sqlite:////work/antonio/mydev/hpc_task_management/artifacts/flowdesk.db"

cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn flowdesk.main:app --host 127.0.0.1 --port 8000 --reload
uv run ruff check .
uv run pytest
```

Use the same `FLOWDESK_DATABASE_URL` for migrations and server startup. If the variable
is omitted, the backend defaults to `sqlite:///./flowdesk.db`, relative to the current
working directory.

The next backend-facing slices are report read models, backup/export/import, and richer
detail read models if frontend drill-down starts duplicating too much client-side assembly.
