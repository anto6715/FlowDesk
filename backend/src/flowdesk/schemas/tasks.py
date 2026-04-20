from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from flowdesk.db.models import TaskPriority, TaskStatus, WaitingReason, WorkSessionEndReason


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    priority: TaskPriority = TaskPriority.NORMAL
    macro_activity_id: str | None = None
    github_reference_id: str | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    priority: TaskPriority | None = None
    macro_activity_id: str | None = None
    github_reference_id: str | None = None


class TaskRead(ORMModel):
    id: str
    title: str
    description: str | None
    status: TaskStatus
    priority: TaskPriority
    waiting_reason: WaitingReason | None
    macro_activity_id: str | None
    github_reference_id: str | None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None
    archived_at: datetime | None


class WorkSessionRead(ORMModel):
    id: str
    task_id: str
    started_at: datetime
    ended_at: datetime | None
    end_reason: WorkSessionEndReason | None
    created_at: datetime


class StartTaskRequest(BaseModel):
    started_at: datetime | None = None


class PauseTaskRequest(BaseModel):
    ended_at: datetime | None = None
    end_reason: WorkSessionEndReason = WorkSessionEndReason.PAUSED
    waiting_reason: WaitingReason | None = None


class SwitchTaskRequest(BaseModel):
    from_task_id: str
    to_task_id: str
    ended_at: datetime | None = None
    started_at: datetime | None = None
    waiting_reason: WaitingReason | None = None


class ActiveTaskResponse(BaseModel):
    task: TaskRead | None
    work_session: WorkSessionRead | None


class TaskSessionResponse(BaseModel):
    task: TaskRead
    work_session: WorkSessionRead


class SwitchTaskResponse(BaseModel):
    from_task: TaskRead
    ended_work_session: WorkSessionRead
    to_task: TaskRead
    started_work_session: WorkSessionRead
