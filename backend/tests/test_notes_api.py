from fastapi.testclient import TestClient


def test_append_and_list_daily_journal_entries(client: TestClient) -> None:
    first_response = client.post(
        "/api/journal/2026-04-20/entries",
        json={"content": "Started the day by triaging stalled runs."},
    )
    second_response = client.post(
        "/api/journal/2026-04-20/entries",
        json={"content": "Queued a smaller reproduction before lunch."},
    )
    list_response = client.get("/api/journal/2026-04-20/entries")
    other_day_response = client.get("/api/journal/2026-04-21/entries")

    assert first_response.status_code == 201
    assert first_response.json()["scope"] == "daily_journal"
    assert first_response.json()["journal_day"] == "2026-04-20"
    assert first_response.json()["task_id"] is None
    assert first_response.json()["experiment_id"] is None

    assert second_response.status_code == 201
    assert list_response.status_code == 200
    assert [item["content"] for item in list_response.json()] == [
        "Started the day by triaging stalled runs.",
        "Queued a smaller reproduction before lunch.",
    ]
    assert other_day_response.status_code == 200
    assert other_day_response.json() == []


def test_add_task_and_experiment_notes(client: TestClient) -> None:
    task = client.post("/api/tasks", json={"title": "Investigate memory regression"}).json()
    experiment = client.post(
        "/api/experiments",
        json={
            "task_id": task["id"],
            "title": "Memory regression reproduction",
        },
    ).json()

    task_note_response = client.post(
        f"/api/tasks/{task['id']}/notes",
        json={"content": "The increase starts after the checkpoint reload path."},
    )
    experiment_note_response = client.post(
        f"/api/experiments/{experiment['id']}/notes",
        json={"content": "RSS grows by roughly 12 percent after timestep 800."},
    )
    task_notes_response = client.get(f"/api/tasks/{task['id']}/notes")
    experiment_notes_response = client.get(f"/api/experiments/{experiment['id']}/notes")

    assert task_note_response.status_code == 201
    assert task_note_response.json()["scope"] == "task"
    assert task_note_response.json()["task_id"] == task["id"]
    assert task_note_response.json()["experiment_id"] is None

    assert experiment_note_response.status_code == 201
    assert experiment_note_response.json()["scope"] == "experiment"
    assert experiment_note_response.json()["experiment_id"] == experiment["id"]
    assert experiment_note_response.json()["task_id"] is None

    assert task_notes_response.status_code == 200
    assert [item["id"] for item in task_notes_response.json()] == [task_note_response.json()["id"]]
    assert experiment_notes_response.status_code == 200
    assert [item["id"] for item in experiment_notes_response.json()] == [
        experiment_note_response.json()["id"]
    ]


def test_notes_reject_missing_task_and_experiment(client: TestClient) -> None:
    missing_task_response = client.post(
        "/api/tasks/missing-task/notes",
        json={"content": "This should not be accepted."},
    )
    missing_experiment_response = client.post(
        "/api/experiments/missing-experiment/notes",
        json={"content": "This should not be accepted."},
    )

    assert missing_task_response.status_code == 404
    assert "Task" in missing_task_response.json()["detail"]
    assert missing_experiment_response.status_code == 404
    assert "Experiment" in missing_experiment_response.json()["detail"]
