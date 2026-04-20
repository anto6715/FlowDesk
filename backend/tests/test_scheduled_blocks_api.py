from fastapi.testclient import TestClient
from sqlalchemy import select

from flowdesk.db.models import StateTransition, TransitionEntityType
from flowdesk.db.session import get_session_factory


def test_create_scheduled_block_and_filter_calendar_window(client: TestClient) -> None:
    task = client.post("/api/tasks", json={"title": "Write experiment summary"}).json()

    create_response = client.post(
        "/api/scheduled-blocks",
        json={
            "task_id": task["id"],
            "title_override": "Draft summary",
            "starts_at": "2026-04-21T09:00:00Z",
            "ends_at": "2026-04-21T10:30:00Z",
        },
    )
    window_response = client.get(
        "/api/scheduled-blocks",
        params={
            "task_id": task["id"],
            "status": "planned",
            "ends_after": "2026-04-21T08:00:00Z",
            "starts_before": "2026-04-21T11:00:00Z",
        },
    )
    missed_window_response = client.get(
        "/api/scheduled-blocks",
        params={
            "ends_after": "2026-04-21T11:00:00Z",
            "starts_before": "2026-04-21T12:00:00Z",
        },
    )

    assert create_response.status_code == 201
    payload = create_response.json()
    assert payload["task_id"] == task["id"]
    assert payload["status"] == "planned"
    assert payload["title_override"] == "Draft summary"

    assert window_response.status_code == 200
    assert [item["id"] for item in window_response.json()] == [payload["id"]]
    assert missed_window_response.status_code == 200
    assert missed_window_response.json() == []


def test_move_and_complete_scheduled_block_are_historized(client: TestClient) -> None:
    task = client.post("/api/tasks", json={"title": "Plan validation work"}).json()
    scheduled_block = client.post(
        "/api/scheduled-blocks",
        json={
            "task_id": task["id"],
            "starts_at": "2026-04-22T13:00:00Z",
            "ends_at": "2026-04-22T14:00:00Z",
        },
    ).json()

    move_response = client.post(
        f"/api/scheduled-blocks/{scheduled_block['id']}/move",
        json={
            "starts_at": "2026-04-22T15:00:00Z",
            "ends_at": "2026-04-22T16:30:00Z",
        },
    )
    complete_response = client.post(
        f"/api/scheduled-blocks/{scheduled_block['id']}/status",
        json={"status": "completed"},
    )

    assert move_response.status_code == 200
    assert move_response.json()["starts_at"] == "2026-04-22T15:00:00"
    assert move_response.json()["ends_at"] == "2026-04-22T16:30:00"
    assert complete_response.status_code == 200
    assert complete_response.json()["status"] == "completed"

    with get_session_factory()() as session:
        transitions = list(
            session.scalars(
                select(StateTransition)
                .where(StateTransition.entity_type == TransitionEntityType.SCHEDULED_BLOCK)
                .where(StateTransition.entity_id == scheduled_block["id"])
                .order_by(StateTransition.created_at.asc())
            )
        )

    assert [(item.event_type, item.from_state, item.to_state) for item in transitions] == [
        ("created", None, "planned"),
        ("moved", "planned", "planned"),
        ("status_changed", "planned", "completed"),
    ]
    assert transitions[1].payload["starts_at"] == "2026-04-22T15:00:00+00:00"
    assert transitions[1].payload["ends_at"] == "2026-04-22T16:30:00+00:00"


def test_scheduled_block_rejects_missing_task_and_invalid_duration(client: TestClient) -> None:
    missing_task_response = client.post(
        "/api/scheduled-blocks",
        json={
            "task_id": "missing-task",
            "starts_at": "2026-04-21T09:00:00Z",
            "ends_at": "2026-04-21T10:00:00Z",
        },
    )
    task = client.post("/api/tasks", json={"title": "Validate planning"}).json()
    invalid_duration_response = client.post(
        "/api/scheduled-blocks",
        json={
            "task_id": task["id"],
            "starts_at": "2026-04-21T10:00:00Z",
            "ends_at": "2026-04-21T10:00:00Z",
        },
    )

    assert missing_task_response.status_code == 404
    assert "Task" in missing_task_response.json()["detail"]
    assert invalid_duration_response.status_code == 400
    assert "end after it starts" in invalid_duration_response.json()["detail"]
