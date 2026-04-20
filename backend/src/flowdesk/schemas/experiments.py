from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from flowdesk.db.models import ExperimentStatus


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ExperimentCreate(BaseModel):
    task_id: str
    title: str = Field(min_length=1, max_length=255)
    instruction: str | None = None
    status: ExperimentStatus = ExperimentStatus.DRAFT
    work_dir: str | None = Field(default=None, max_length=1024)
    repository_path: str | None = Field(default=None, max_length=1024)
    branch_name: str | None = Field(default=None, max_length=255)
    commit_hash: str | None = Field(default=None, max_length=64)
    version_label: str | None = Field(default=None, max_length=120)
    launch_command: str | None = None
    scheduler_name: str | None = Field(default=None, max_length=120)
    scheduler_job_id: str | None = Field(default=None, max_length=120)
    started_at: datetime | None = None
    ended_at: datetime | None = None
    outcome_summary: str | None = None
    log_path: str | None = Field(default=None, max_length=1024)
    result_path: str | None = Field(default=None, max_length=1024)


class ExperimentRead(ORMModel):
    id: str
    task_id: str
    title: str
    instruction: str | None
    status: ExperimentStatus
    work_dir: str | None
    repository_path: str | None
    branch_name: str | None
    commit_hash: str | None
    version_label: str | None
    launch_command: str | None
    scheduler_name: str | None
    scheduler_job_id: str | None
    started_at: datetime | None
    ended_at: datetime | None
    outcome_summary: str | None
    log_path: str | None
    result_path: str | None
    created_at: datetime
    updated_at: datetime


class ExperimentStateUpdate(BaseModel):
    status: ExperimentStatus
    started_at: datetime | None = None
    ended_at: datetime | None = None
    outcome_summary: str | None = None
