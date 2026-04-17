from fastapi import FastAPI

from flowdesk.api.router import api_router
from flowdesk.core.settings import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        summary="Local-first HPC task management backend.",
    )
    app.include_router(api_router, prefix=settings.api_prefix)

    @app.get("/", tags=["meta"])
    def root() -> dict[str, str]:
        return {
            "name": settings.app_name,
            "version": settings.app_version,
            "api_prefix": settings.api_prefix,
        }

    return app


app = create_app()

