from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from flowdesk.db.models import ScheduledBlockStatus


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ScheduledBlockCreate(BaseModel):
    task_id: str
    title_override: str | None = Field(default=None, max_length=255)
    starts_at: datetime
    ends_at: datetime


class ScheduledBlockRead(ORMModel):
    id: str
    task_id: str
    title_override: str | None
    starts_at: datetime
    ends_at: datetime
    status: ScheduledBlockStatus
    created_at: datetime
    updated_at: datetime


class ScheduledBlockMove(BaseModel):
    starts_at: datetime
    ends_at: datetime


class ScheduledBlockStatusUpdate(BaseModel):
    status: ScheduledBlockStatus
