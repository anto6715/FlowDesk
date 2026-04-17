from fastapi.testclient import TestClient

from flowdesk.main import app


def test_healthcheck() -> None:
    client = TestClient(app)

    response = client.get("/api/healthz")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["database"] == "ok"
