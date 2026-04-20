from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from flowdesk.db.models import (
    MacroActivity,
    StateTransition,
    Task,
    TaskPriority,
    TaskStatus,
    TransitionEntityType,
    WaitingReason,
    WorkSession,
    WorkSessionEndReason,
    GitHubReference,
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class TaskServiceError(Exception):
    """Base error for task application services."""


class TaskNotFoundError(TaskServiceError):
    """Raised when the target task does not exist."""


class TaskConflictError(TaskServiceError):
    """Raised when a command would break task or session invariants."""


class InvalidTaskTransitionError(TaskServiceError):
    """Raised when a task transition is not allowed."""


class LinkedEntityNotFoundError(TaskServiceError):
    """Raised when a referenced macro-activity or GitHub issue record does not exist."""


@dataclass(slots=True)
class SwitchTaskResult:
    from_task: Task
    ended_work_session: WorkSession
    to_task: Task
    started_work_session: WorkSession


def list_tasks(session: Session) -> list[Task]:
    statement = select(Task).order_by(Task.updated_at.desc(), Task.created_at.desc())
    return list(session.scalars(statement))


def list_work_sessions_for_task(session: Session, task_id: str) -> list[WorkSession]:
    _get_task_or_raise(session, task_id)
    statement = (
        select(WorkSession)
        .where(WorkSession.task_id == task_id)
        .order_by(WorkSession.started_at.desc(), WorkSession.created_at.desc())
    )
    return list(session.scalars(statement))


def create_task(
    session: Session,
    *,
    title: str,
    description: str | None = None,
    priority: TaskPriority = TaskPriority.NORMAL,
    macro_activity_id: str | None = None,
    github_reference_id: str | None = None,
) -> Task:
    if macro_activity_id is not None and session.get(MacroActivity, macro_activity_id) is None:
        raise LinkedEntityNotFoundError(f"Macro activity '{macro_activity_id}' was not found.")

    if github_reference_id is not None and session.get(GitHubReference, github_reference_id) is None:
        raise LinkedEntityNotFoundError(f"GitHub reference '{github_reference_id}' was not found.")

    task = Task(
        title=title,
        description=description,
        priority=priority,
        macro_activity_id=macro_activity_id,
        github_reference_id=github_reference_id,
        status=TaskStatus.INBOX,
    )
    session.add(task)
    session.flush()
    _record_transition(
        session,
        task=task,
        event_type="created",
        from_state=None,
        to_state=task.status,
    )
    return task


def get_active_context(session: Session) -> tuple[Task | None, WorkSession | None]:
    active_session = _get_active_work_session(session)
    if active_session is None:
        return None, None

    task = session.get(Task, active_session.task_id)
    if task is None:
        raise TaskConflictError("The active work session points to a missing task.")

    return task, active_session


def start_task(
    session: Session,
    task_id: str,
    *,
    started_at: datetime | None = None,
) -> tuple[Task, WorkSession]:
    task = _get_task_or_raise(session, task_id)
    active_task, active_session = get_active_context(session)

    if active_session is not None:
        if active_session.task_id == task_id:
            raise TaskConflictError("This task already has an active work session.")
        raise TaskConflictError("Another task is already active. Use switch_task instead.")

    _ensure_task_can_start(task)

    previous_status = task.status
    task.status = TaskStatus.IN_PROGRESS
    task.waiting_reason = None
    task.updated_at = utcnow()
    start_time = ensure_utc(started_at) or utcnow()

    work_session = WorkSession(
        task_id=task.id,
        started_at=start_time,
    )
    session.add(work_session)
    session.flush()

    _record_transition(
        session,
        task=task,
        event_type="started",
        from_state=previous_status,
        to_state=task.status,
    )

    return task, work_session


def pause_task(
    session: Session,
    task_id: str,
    *,
    ended_at: datetime | None = None,
    end_reason: WorkSessionEndReason = WorkSessionEndReason.PAUSED,
    waiting_reason: WaitingReason | None = None,
) -> tuple[Task, WorkSession]:
    task, active_session = get_active_context(session)

    if task is None or active_session is None or active_session.task_id != task_id:
        raise TaskConflictError("The requested task is not the active task.")

    stop_time = ensure_utc(ended_at) or utcnow()
    started_time = ensure_utc(active_session.started_at)
    if started_time is None:
        raise TaskConflictError("The active work session is missing a start time.")
    if stop_time < started_time:
        raise InvalidTaskTransitionError("A work session cannot end before it starts.")

    active_session.ended_at = stop_time
    active_session.end_reason = end_reason

    previous_status = task.status
    task.status = _resolve_post_pause_status(end_reason=end_reason, waiting_reason=waiting_reason)
    task.waiting_reason = waiting_reason if task.status == TaskStatus.WAITING else None
    task.updated_at = stop_time

    if task.status == TaskStatus.DONE:
        task.completed_at = stop_time

    session.flush()

    _record_transition(
        session,
        task=task,
        event_type="paused",
        from_state=previous_status,
        to_state=task.status,
        payload={"end_reason": end_reason.value},
    )

    return task, active_session


def switch_task(
    session: Session,
    *,
    from_task_id: str,
    to_task_id: str,
    ended_at: datetime | None = None,
    started_at: datetime | None = None,
    waiting_reason: WaitingReason | None = None,
) -> SwitchTaskResult:
    if from_task_id == to_task_id:
        raise InvalidTaskTransitionError("Cannot switch from a task to itself.")

    from_task, ended_session = pause_task(
        session,
        from_task_id,
        ended_at=ended_at,
        end_reason=WorkSessionEndReason.SWITCHED,
        waiting_reason=waiting_reason,
    )
    to_task, started_session = start_task(
        session,
        to_task_id,
        started_at=started_at or ended_session.ended_at,
    )
    return SwitchTaskResult(
        from_task=from_task,
        ended_work_session=ended_session,
        to_task=to_task,
        started_work_session=started_session,
    )


def _get_task_or_raise(session: Session, task_id: str) -> Task:
    task = session.get(Task, task_id)
    if task is None:
        raise TaskNotFoundError(f"Task '{task_id}' was not found.")
    return task


def _get_active_work_session(session: Session) -> WorkSession | None:
    statement = select(WorkSession).where(WorkSession.ended_at.is_(None)).order_by(WorkSession.started_at.desc())
    active_sessions = list(session.scalars(statement))

    if len(active_sessions) > 1:
        raise TaskConflictError("Multiple active work sessions exist. Manual recovery is required.")

    if not active_sessions:
        return None

    return active_sessions[0]


def _ensure_task_can_start(task: Task) -> None:
    if task.status == TaskStatus.ARCHIVED:
        raise InvalidTaskTransitionError("Archived tasks cannot be started.")
    if task.status == TaskStatus.DONE:
        raise InvalidTaskTransitionError("Completed tasks must be reopened before they can start.")


def _resolve_post_pause_status(
    *,
    end_reason: WorkSessionEndReason,
    waiting_reason: WaitingReason | None,
) -> TaskStatus:
    if waiting_reason is not None:
        return TaskStatus.WAITING
    if end_reason == WorkSessionEndReason.BLOCKED:
        return TaskStatus.BLOCKED
    if end_reason == WorkSessionEndReason.COMPLETED:
        return TaskStatus.DONE
    return TaskStatus.READY


def _record_transition(
    session: Session,
    *,
    task: Task,
    event_type: str,
    from_state: TaskStatus | None,
    to_state: TaskStatus | None,
    payload: dict[str, str] | None = None,
) -> None:
    if from_state == to_state:
        return

    session.add(
        StateTransition(
            entity_type=TransitionEntityType.TASK,
            entity_id=task.id,
            event_type=event_type,
            from_state=from_state.value if from_state is not None else None,
            to_state=to_state.value if to_state is not None else None,
            payload=payload,
        )
    )
