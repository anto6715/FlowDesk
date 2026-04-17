from fastapi import APIRouter
from sqlalchemy import text

from flowdesk.core.settings import get_settings
from flowdesk.db.session import get_engine

router = APIRouter(tags=["health"])


@router.get("/healthz")
def healthcheck() -> dict[str, str]:
    settings = get_settings()
    with get_engine().connect() as connection:
        connection.execute(text("SELECT 1"))

    return {
        "status": "ok",
        "name": settings.app_name,
        "version": settings.app_version,
        "database": "ok",
    }
