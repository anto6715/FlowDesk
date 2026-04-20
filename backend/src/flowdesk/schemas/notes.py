from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from flowdesk.db.models import NoteScope


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class NoteCreate(BaseModel):
    content: str = Field(min_length=1)
    task_id: str | None = None


class NoteRead(ORMModel):
    id: str
    scope: NoteScope
    journal_day: date | None
    task_id: str | None
    experiment_id: str | None
    content: str
    created_at: datetime
    updated_at: datetime
