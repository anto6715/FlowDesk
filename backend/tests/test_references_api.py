from fastapi.testclient import TestClient


def test_update_github_reference_metadata(client: TestClient) -> None:
    reference = client.post(
        "/api/github-references",
        json={
            "repository_full_name": "org/project",
            "issue_number": 12,
            "issue_url": "https://github.com/org/project/issues/12-wrong",
            "cached_title": "Wrong title",
        },
    ).json()

    response = client.patch(
        f"/api/github-references/{reference['id']}",
        json={
            "issue_url": "https://github.com/org/project/issues/12",
            "cached_title": "Correct title",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["repository_full_name"] == "org/project"
    assert payload["issue_number"] == 12
    assert payload["issue_url"] == "https://github.com/org/project/issues/12"
    assert payload["cached_title"] == "Correct title"


def test_update_github_reference_rejects_duplicate_repo_issue(client: TestClient) -> None:
    first_reference = client.post(
        "/api/github-references",
        json={
            "repository_full_name": "org/project",
            "issue_number": 1,
            "issue_url": "https://github.com/org/project/issues/1",
        },
    )
    second_reference = client.post(
        "/api/github-references",
        json={
            "repository_full_name": "org/other",
            "issue_number": 2,
            "issue_url": "https://github.com/org/other/issues/2",
        },
    ).json()

    response = client.patch(
        f"/api/github-references/{second_reference['id']}",
        json={
            "repository_full_name": "org/project",
            "issue_number": 1,
        },
    )

    assert first_reference.status_code == 201
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


def test_update_github_reference_rejects_missing_reference(client: TestClient) -> None:
    response = client.patch(
        "/api/github-references/missing-reference",
        json={"cached_title": "Still missing"},
    )

    assert response.status_code == 404
    assert "GitHub reference" in response.json()["detail"]
