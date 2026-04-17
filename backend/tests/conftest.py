from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from flowdesk.core.settings import get_settings
from flowdesk.db.base import Base
from flowdesk.db.session import get_engine, get_session_factory
from flowdesk.main import create_app
from flowdesk.db import models as _models  # noqa: F401


@pytest.fixture()
def client(tmp_path, monkeypatch) -> Iterator[TestClient]:
    db_path = tmp_path / "test-flowdesk.db"
    monkeypatch.setenv("FLOWDESK_DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("FLOWDESK_DATABASE_ECHO", "false")

    get_settings.cache_clear()
    get_engine.cache_clear()
    get_session_factory.cache_clear()

    engine = get_engine()
    Base.metadata.create_all(engine)

    app = create_app()
    with TestClient(app) as test_client:
        yield test_client

    engine.dispose()
    get_session_factory.cache_clear()
    get_engine.cache_clear()
    get_settings.cache_clear()
