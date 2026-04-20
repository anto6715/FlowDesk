from fastapi.testclient import TestClient
from sqlalchemy import select

from flowdesk.db.models import StateTransition, TransitionEntityType
from flowdesk.db.session import get_session_factory


def test_register_experiment_and_filter_by_status(client: TestClient) -> None:
    task = client.post("/api/tasks", json={"title": "Run scaling study"}).json()

    create_response = client.post(
        "/api/experiments",
        json={
            "task_id": task["id"],
            "title": "Scaling run 256 ranks",
            "instruction": "Compare the latest branch against baseline output.",
            "status": "running",
            "work_dir": "/scratch/runs/scaling-256",
            "repository_path": "/work/project/model",
            "branch_name": "restart-fix",
            "commit_hash": "abcdef123456",
            "launch_command": "sbatch run.sh",
            "scheduler_name": "slurm",
            "scheduler_job_id": "98765",
            "log_path": "/scratch/runs/scaling-256/slurm.out",
            "result_path": "/scratch/runs/scaling-256/results",
        },
    )
    running_response = client.get("/api/experiments", params={"status": "running"})
    stalled_response = client.get("/api/experiments", params={"status": "stalled"})

    assert create_response.status_code == 201
    payload = create_response.json()
    assert payload["task_id"] == task["id"]
    assert payload["status"] == "running"
    assert payload["started_at"] is not None
    assert payload["ended_at"] is None

    assert running_response.status_code == 200
    assert [item["id"] for item in running_response.json()] == [payload["id"]]
    assert stalled_response.status_code == 200
    assert stalled_response.json() == []


def test_experiment_state_changes_are_historized(client: TestClient) -> None:
    task = client.post("/api/tasks", json={"title": "Inspect solver regression"}).json()
    experiment = client.post(
        "/api/experiments",
        json={
            "task_id": task["id"],
            "title": "Regression reproduction",
        },
    ).json()

    response = client.post(
        f"/api/experiments/{experiment['id']}/state",
        json={
            "status": "failed",
            "ended_at": "2026-04-20T14:30:00Z",
            "outcome_summary": "Solver diverged before checkpoint write.",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "failed"
    assert payload["started_at"] == "2026-04-20T14:30:00"
    assert payload["ended_at"] == "2026-04-20T14:30:00"
    assert payload["outcome_summary"] == "Solver diverged before checkpoint write."

    with get_session_factory()() as session:
        transitions = list(
            session.scalars(
                select(StateTransition)
                .where(StateTransition.entity_type == TransitionEntityType.EXPERIMENT)
                .where(StateTransition.entity_id == experiment["id"])
                .order_by(StateTransition.created_at.asc())
            )
        )

    assert [(item.event_type, item.from_state, item.to_state) for item in transitions] == [
        ("created", None, "draft"),
        ("state_changed", "draft", "failed"),
    ]


def test_experiment_rejects_missing_task_and_invalid_time_range(client: TestClient) -> None:
    missing_task_response = client.post(
        "/api/experiments",
        json={
            "task_id": "missing-task",
            "title": "Orphan run",
        },
    )
    task = client.post("/api/tasks", json={"title": "Validate timing"}).json()
    invalid_time_response = client.post(
        "/api/experiments",
        json={
            "task_id": task["id"],
            "title": "Invalid timing",
            "started_at": "2026-04-20T15:00:00Z",
            "ended_at": "2026-04-20T14:00:00Z",
        },
    )

    assert missing_task_response.status_code == 404
    assert "Task" in missing_task_response.json()["detail"]
    assert invalid_time_response.status_code == 400
    assert "end before it starts" in invalid_time_response.json()["detail"]
