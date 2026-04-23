from fastapi.testclient import TestClient


def _link_keys(block: dict) -> list[tuple[str, str | None, str | None]]:
    return sorted(
        (link["target_type"], link["target_id"], link["tag_name"])
        for link in block["links"]
    )


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
    blocks_response = client.get("/api/journal/2026-04-20/blocks")
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
    assert blocks_response.status_code == 200
    assert [item["content_markdown"] for item in blocks_response.json()] == [
        "Started the day by triaging stalled runs.",
        "Queued a smaller reproduction before lunch.",
    ]
    assert [item["legacy_note_id"] for item in blocks_response.json()] == [
        first_response.json()["id"],
        second_response.json()["id"],
    ]
    assert other_day_response.status_code == 200
    assert other_day_response.json() == []


def test_append_daily_journal_entry_with_task_link_populates_backlinks(client: TestClient) -> None:
    task = client.post("/api/tasks", json={"title": "Investigate memory regression"}).json()

    journal_response = client.post(
        "/api/journal/2026-04-20/entries",
        json={
            "content": "The regression is reproducible with four ranks.",
            "task_id": task["id"],
        },
    )
    journal_entries_response = client.get("/api/journal/2026-04-20/entries")
    journal_blocks_response = client.get("/api/journal/2026-04-20/blocks")
    task_notes_response = client.get(f"/api/tasks/{task['id']}/notes")
    task_backlinks_response = client.get(f"/api/tasks/{task['id']}/backlinks")

    assert journal_response.status_code == 201
    assert journal_response.json()["scope"] == "daily_journal"
    assert journal_response.json()["task_id"] == task["id"]

    assert journal_entries_response.status_code == 200
    assert journal_entries_response.json()[0]["task_id"] == task["id"]

    assert journal_blocks_response.status_code == 200
    assert journal_blocks_response.json()[0]["legacy_note_id"] == journal_response.json()["id"]
    assert _link_keys(journal_blocks_response.json()[0]) == [("task", task["id"], None)]

    assert task_notes_response.status_code == 200
    assert task_notes_response.json()[0]["id"] == journal_response.json()["id"]

    assert task_backlinks_response.status_code == 200
    assert [item["id"] for item in task_backlinks_response.json()] == [
        journal_blocks_response.json()[0]["id"]
    ]


def test_create_note_block_parses_tags_and_links_and_keeps_legacy_journal_view(client: TestClient) -> None:
    task = client.post("/api/tasks", json={"title": "Investigate memory regression"}).json()
    experiment = client.post(
        "/api/experiments",
        json={
            "task_id": task["id"],
            "title": "Memory regression reproduction",
        },
    ).json()

    create_response = client.post(
        "/api/journal/2026-04-20/blocks",
        json={
            "content_markdown": (
                f"Observed #memory growth in [[experiment:{experiment['id']}]] after lunch."
            ),
            "references": [
                {
                    "target_type": "task",
                    "target_id": task["id"],
                }
            ],
        },
    )
    journal_entries_response = client.get("/api/journal/2026-04-20/entries")
    journal_blocks_response = client.get("/api/journal/2026-04-20/blocks")
    task_backlinks_response = client.get(f"/api/tasks/{task['id']}/backlinks")
    experiment_backlinks_response = client.get(f"/api/experiments/{experiment['id']}/backlinks")
    tag_backlinks_response = client.get("/api/tags/MEMORY/backlinks")

    assert create_response.status_code == 201
    created_block = create_response.json()
    assert created_block["journal_day"] == "2026-04-20"
    assert created_block["legacy_note_id"] is not None
    assert _link_keys(created_block) == [
        ("experiment", experiment["id"], None),
        ("tag", None, "memory"),
        ("task", task["id"], None),
    ]

    assert journal_entries_response.status_code == 200
    assert journal_entries_response.json()[0]["id"] == created_block["legacy_note_id"]
    assert journal_entries_response.json()[0]["content"] == created_block["content_markdown"]
    assert journal_entries_response.json()[0]["task_id"] == task["id"]

    assert journal_blocks_response.status_code == 200
    assert [item["id"] for item in journal_blocks_response.json()] == [created_block["id"]]

    assert task_backlinks_response.status_code == 200
    assert [item["id"] for item in task_backlinks_response.json()] == [created_block["id"]]
    assert experiment_backlinks_response.status_code == 200
    assert [item["id"] for item in experiment_backlinks_response.json()] == [created_block["id"]]
    assert tag_backlinks_response.status_code == 200
    assert [item["id"] for item in tag_backlinks_response.json()] == [created_block["id"]]


def test_update_note_block_reparses_links_and_syncs_legacy_entry(client: TestClient) -> None:
    first_task = client.post("/api/tasks", json={"title": "Investigate memory regression"}).json()
    second_task = client.post("/api/tasks", json={"title": "Validate smaller reproducer"}).json()
    experiment = client.post(
        "/api/experiments",
        json={
            "task_id": second_task["id"],
            "title": "Smaller reproducer run",
        },
    ).json()

    create_response = client.post(
        "/api/journal/2026-04-20/blocks",
        json={
            "content_markdown": "Starting with #alpha observations.",
            "references": [
                {
                    "target_type": "task",
                    "target_id": first_task["id"],
                }
            ],
        },
    )
    block_id = create_response.json()["id"]

    update_response = client.patch(
        f"/api/note-blocks/{block_id}",
        json={
            "content_markdown": (
                f"Shifted to #beta work after checking [[experiment:{experiment['id']}]]."
            ),
            "references": [
                {
                    "target_type": "task",
                    "target_id": second_task["id"],
                }
            ],
            "sort_order": 7,
        },
    )
    journal_entries_response = client.get("/api/journal/2026-04-20/entries")
    first_task_backlinks_response = client.get(f"/api/tasks/{first_task['id']}/backlinks")
    second_task_backlinks_response = client.get(f"/api/tasks/{second_task['id']}/backlinks")
    alpha_tag_backlinks_response = client.get("/api/tags/alpha/backlinks")
    beta_tag_backlinks_response = client.get("/api/tags/beta/backlinks")

    assert update_response.status_code == 200
    updated_block = update_response.json()
    assert updated_block["sort_order"] == 7
    assert _link_keys(updated_block) == [
        ("experiment", experiment["id"], None),
        ("tag", None, "beta"),
        ("task", second_task["id"], None),
    ]

    assert journal_entries_response.status_code == 200
    assert journal_entries_response.json()[0]["id"] == updated_block["legacy_note_id"]
    assert journal_entries_response.json()[0]["content"] == updated_block["content_markdown"]
    assert journal_entries_response.json()[0]["task_id"] == second_task["id"]

    assert first_task_backlinks_response.status_code == 200
    assert first_task_backlinks_response.json() == []
    assert second_task_backlinks_response.status_code == 200
    assert [item["id"] for item in second_task_backlinks_response.json()] == [block_id]
    assert alpha_tag_backlinks_response.status_code == 200
    assert alpha_tag_backlinks_response.json() == []
    assert beta_tag_backlinks_response.status_code == 200
    assert [item["id"] for item in beta_tag_backlinks_response.json()] == [block_id]


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


def test_note_blocks_reject_missing_or_invalid_targets(client: TestClient) -> None:
    task = client.post("/api/tasks", json={"title": "Investigate memory regression"}).json()
    valid_block_response = client.post(
        "/api/journal/2026-04-20/blocks",
        json={
            "content_markdown": "Parent block for the day.",
            "references": [
                {
                    "target_type": "task",
                    "target_id": task["id"],
                }
            ],
        },
    )

    missing_task_response = client.post(
        "/api/journal/2026-04-20/blocks",
        json={
            "content_markdown": "This task link should not be accepted.",
            "references": [
                {
                    "target_type": "task",
                    "target_id": "00000000-0000-0000-0000-000000000001",
                }
            ],
        },
    )
    missing_experiment_response = client.post(
        "/api/journal/2026-04-20/blocks",
        json={
            "content_markdown": (
                "Missing experiment "
                "[[experiment:00000000-0000-0000-0000-000000000002]]."
            ),
        },
    )
    cross_day_parent_response = client.post(
        "/api/journal/2026-04-21/blocks",
        json={
            "content_markdown": "This parent should be rejected.",
            "parent_id": valid_block_response.json()["id"],
        },
    )
    missing_block_update_response = client.patch(
        "/api/note-blocks/missing-block",
        json={"content_markdown": "This block does not exist."},
    )
    missing_task_backlinks_response = client.get("/api/tasks/missing-task/backlinks")
    missing_experiment_backlinks_response = client.get(
        "/api/experiments/missing-experiment/backlinks"
    )

    assert valid_block_response.status_code == 201
    assert missing_task_response.status_code == 404
    assert "Task" in missing_task_response.json()["detail"]
    assert missing_experiment_response.status_code == 404
    assert "Experiment" in missing_experiment_response.json()["detail"]
    assert cross_day_parent_response.status_code == 400
    assert "same journal day" in cross_day_parent_response.json()["detail"]
    assert missing_block_update_response.status_code == 404
    assert "Note block" in missing_block_update_response.json()["detail"]
    assert missing_task_backlinks_response.status_code == 404
    assert "Task" in missing_task_backlinks_response.json()["detail"]
    assert missing_experiment_backlinks_response.status_code == 404
    assert "Experiment" in missing_experiment_backlinks_response.json()["detail"]


def test_notes_reject_missing_task_and_experiment(client: TestClient) -> None:
    missing_journal_task_response = client.post(
        "/api/journal/2026-04-20/entries",
        json={
            "content": "This task link should not be accepted.",
            "task_id": "missing-task",
        },
    )
    missing_task_response = client.post(
        "/api/tasks/missing-task/notes",
        json={"content": "This should not be accepted."},
    )
    missing_experiment_response = client.post(
        "/api/experiments/missing-experiment/notes",
        json={"content": "This should not be accepted."},
    )

    assert missing_journal_task_response.status_code == 404
    assert "Task" in missing_journal_task_response.json()["detail"]
    assert missing_task_response.status_code == 404
    assert "Task" in missing_task_response.json()["detail"]
    assert missing_experiment_response.status_code == 404
    assert "Experiment" in missing_experiment_response.json()["detail"]
