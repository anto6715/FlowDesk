from fastapi import APIRouter

from flowdesk.api.routes.experiments import router as experiments_router
from flowdesk.api.routes.health import router as health_router
from flowdesk.api.routes.references import router as references_router
from flowdesk.api.routes.scheduled_blocks import router as scheduled_blocks_router
from flowdesk.api.routes.tasks import router as tasks_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(references_router)
api_router.include_router(tasks_router)
api_router.include_router(experiments_router)
api_router.include_router(scheduled_blocks_router)
