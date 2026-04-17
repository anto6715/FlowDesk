from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class MacroActivityCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    color_hex: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")


class MacroActivityRead(ORMModel):
    id: str
    name: str
    description: str | None
    color_hex: str | None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class GitHubReferenceCreate(BaseModel):
    repository_full_name: str = Field(min_length=1, max_length=255)
    issue_number: int = Field(gt=0)
    issue_url: str = Field(min_length=1, max_length=512)
    cached_title: str | None = Field(default=None, max_length=255)
    cached_state: str | None = Field(default=None, max_length=32)
    cached_labels: list[str] | None = None


class GitHubReferenceRead(ORMModel):
    id: str
    repository_full_name: str
    issue_number: int
    issue_url: str
    cached_title: str | None
    cached_state: str | None
    cached_labels: list[str] | None
    last_synced_at: datetime | None
    created_at: datetime
    updated_at: datetime
