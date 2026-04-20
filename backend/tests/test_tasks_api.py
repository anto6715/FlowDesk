from fastapi.testclient import TestClient


def test_create_task_with_linked_references(client: TestClient) -> None:
    macro_activity = client.post(
        "/api/macro-activities",
        json={
            "name": "Coupled Runs",
            "description": "Large coupled experiment campaigns",
            "color_hex": "#0F6D61",
        },
    )
    github_reference = client.post(
        "/api/github-references",
        json={
            "repository_full_name": "org/project",
            "issue_number": 42,
            "issue_url": "https://github.com/org/project/issues/42",
            "cached_title": "Stabilize restart workflow",
        },
    )

    response = client.post(
        "/api/tasks",
        json={
            "title": "Investigate stalled restart run",
            "description": "Check the latest experiment logs and prepare a fix.",
            "priority": "high",
            "macro_activity_id": macro_activity.json()["id"],
            "github_reference_id": github_reference.json()["id"],
        },
    )

    assert macro_activity.status_code == 201
    assert github_reference.status_code == 201
    assert response.status_code == 201
    assert response.json()["status"] == "inbox"
    assert response.json()["priority"] == "high"
    assert response.json()["macro_activity_id"] == macro_activity.json()["id"]
    assert response.json()["github_reference_id"] == github_reference.json()["id"]


def test_update_task_metadata_and_references(client: TestClient) -> None:
    first_macro = client.post("/api/macro-activities", json={"name": "Old Macro"}).json()
    second_macro = client.post("/api/macro-activities", json={"name": "New Macro"}).json()
    first_reference = client.post(
        "/api/github-references",
        json={
            "repository_full_name": "org/old",
            "issue_number": 1,
            "issue_url": "https://github.com/org/old/issues/1",
        },
    ).json()
    second_reference = client.post(
        "/api/github-references",
        json={
            "repository_full_name": "org/new",
            "issue_number": 2,
            "issue_url": "https://github.com/org/new/issues/2",
        },
    ).json()
    task = client.post(
        "/api/tasks",
        json={
            "title": "Wrong metadata",
            "priority": "normal",
            "macro_activity_id": first_macro["id"],
            "github_reference_id": first_reference["id"],
        },
    ).json()

    response = client.patch(
        f"/api/tasks/{task['id']}",
        json={
            "title": "Correct metadata",
            "description": "Updated task context.",
            "priority": "urgent",
            "macro_activity_id": second_macro["id"],
            "github_reference_id": second_reference["id"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["title"] == "Correct metadata"
    assert payload["description"] == "Updated task context."
    assert payload["priority"] == "urgent"
    assert payload["macro_activity_id"] == second_macro["id"]
    assert payload["github_reference_id"] == second_reference["id"]


def test_update_task_metadata_rejects_conflicting_github_reference(client: TestClient) -> None:
    reference = client.post(
        "/api/github-references",
        json={
            "repository_full_name": "org/project",
            "issue_number": 77,
            "issue_url": "https://github.com/org/project/issues/77",
        },
    ).json()
    first_task = client.post(
        "/api/tasks",
        json={
            "title": "Owns issue",
            "github_reference_id": reference["id"],
        },
    ).json()
    second_task = client.post("/api/tasks", json={"title": "Tries issue"}).json()

    response = client.patch(
        f"/api/tasks/{second_task['id']}",
        json={"github_reference_id": reference["id"]},
    )

    assert first_task["github_reference_id"] == reference["id"]
    assert response.status_code == 409
    assert "already linked" in response.json()["detail"]


def test_task_start_switch_and_wait_flow(client: TestClient) -> None:
    first_task = client.post("/api/tasks", json={"title": "Prepare run report"}).json()
    second_task = client.post("/api/tasks", json={"title": "Review PR feedback"}).json()

    start_response = client.post(f"/api/tasks/{first_task['id']}/start", json={})
    switch_response = client.post(
        "/api/tasks/switch",
        json={
            "from_task_id": first_task["id"],
            "to_task_id": second_task["id"],
        },
    )
    active_response = client.get("/api/tasks/active")
    pause_response = client.post(
        f"/api/tasks/{second_task['id']}/pause",
        json={
            "waiting_reason": "pr_feedback",
            "end_reason": "waiting",
        },
    )
    final_active_response = client.get("/api/tasks/active")

    assert start_response.status_code == 200
    assert start_response.json()["task"]["status"] == "in_progress"

    assert switch_response.status_code == 200
    assert switch_response.json()["from_task"]["status"] == "ready"
    assert switch_response.json()["to_task"]["status"] == "in_progress"

    assert active_response.status_code == 200
    assert active_response.json()["task"]["id"] == second_task["id"]
    assert active_response.json()["work_session"]["ended_at"] is None

    assert pause_response.status_code == 200
    assert pause_response.json()["task"]["status"] == "waiting"
    assert pause_response.json()["task"]["waiting_reason"] == "pr_feedback"
    assert pause_response.json()["work_session"]["end_reason"] == "waiting"

    assert final_active_response.status_code == 200
    assert final_active_response.json() == {"task": None, "work_session": None}


def test_list_task_work_sessions(client: TestClient) -> None:
    task = client.post("/api/tasks", json={"title": "Measure solver setup"}).json()

    first_start = client.post(
        f"/api/tasks/{task['id']}/start",
        json={"started_at": "2026-04-20T08:00:00Z"},
    )
    first_pause = client.post(
        f"/api/tasks/{task['id']}/pause",
        json={
            "ended_at": "2026-04-20T09:30:00Z",
            "end_reason": "paused",
        },
    )
    second_start = client.post(
        f"/api/tasks/{task['id']}/start",
        json={"started_at": "2026-04-20T10:00:00Z"},
    )
    sessions_response = client.get(f"/api/tasks/{task['id']}/work-sessions")

    assert first_start.status_code == 200
    assert first_pause.status_code == 200
    assert second_start.status_code == 200
    assert sessions_response.status_code == 200
    sessions = sessions_response.json()
    assert [session["end_reason"] for session in sessions] == [None, "paused"]
    assert sessions[0]["ended_at"] is None
    assert sessions[1]["ended_at"] == "2026-04-20T09:30:00"


def test_list_task_work_sessions_rejects_missing_task(client: TestClient) -> None:
    response = client.get("/api/tasks/missing-task/work-sessions")

    assert response.status_code == 404
    assert "Task" in response.json()["detail"]


def test_task_creation_rejects_missing_linked_ids(client: TestClient) -> None:
    response = client.post(
        "/api/tasks",
        json={
            "title": "Broken references",
            "macro_activity_id": "missing-macro",
        },
    )

    assert response.status_code == 404
    assert "Macro activity" in response.json()["detail"]
