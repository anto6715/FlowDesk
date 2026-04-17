from fastapi import APIRouter

from flowdesk.api.routes.health import router as health_router
from flowdesk.api.routes.tasks import router as tasks_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(tasks_router)
