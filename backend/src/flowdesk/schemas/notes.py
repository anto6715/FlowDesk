from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from flowdesk.db.models import NoteBlockLinkTargetType, NoteScope


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


class NoteBlockReferenceInput(BaseModel):
    target_type: NoteBlockLinkTargetType
    target_id: str = Field(min_length=1, max_length=36)


class NoteBlockCreate(BaseModel):
    content_markdown: str = Field(min_length=1)
    parent_id: str | None = None
    sort_order: int | None = Field(default=None, ge=0)
    references: list[NoteBlockReferenceInput] = Field(default_factory=list)


class NoteBlockUpdate(BaseModel):
    content_markdown: str | None = Field(default=None, min_length=1)
    parent_id: str | None = None
    sort_order: int | None = Field(default=None, ge=0)
    references: list[NoteBlockReferenceInput] | None = None


class NoteBlockLinkRead(ORMModel):
    id: str
    target_type: NoteBlockLinkTargetType
    target_id: str | None
    tag_name: str | None


class NoteBlockRead(ORMModel):
    id: str
    journal_day: date
    parent_id: str | None
    legacy_note_id: str | None
    sort_order: int
    content_markdown: str
    links: list[NoteBlockLinkRead]
    created_at: datetime
    updated_at: datetime
