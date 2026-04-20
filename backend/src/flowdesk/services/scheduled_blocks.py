from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from flowdesk.db.models import (
    ScheduledBlock,
    ScheduledBlockStatus,
    StateTransition,
    Task,
    TransitionEntityType,
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class ScheduledBlockServiceError(Exception):
    """Base error for scheduled-block application services."""


class ScheduledBlockNotFoundError(ScheduledBlockServiceError):
    """Raised when the target scheduled block does not exist."""


class ScheduledBlockTaskNotFoundError(ScheduledBlockServiceError):
    """Raised when a scheduled block references a missing task."""


class InvalidScheduledBlockError(ScheduledBlockServiceError):
    """Raised when a scheduled block has invalid timing data."""


def list_scheduled_blocks(
    session: Session,
    *,
    task_id: str | None = None,
    status: ScheduledBlockStatus | None = None,
    starts_before: datetime | None = None,
    ends_after: datetime | None = None,
) -> list[ScheduledBlock]:
    statement = select(ScheduledBlock).order_by(ScheduledBlock.starts_at.asc())

    if task_id is not None:
        statement = statement.where(ScheduledBlock.task_id == task_id)
    if status is not None:
        statement = statement.where(ScheduledBlock.status == status)
    if starts_before is not None:
        statement = statement.where(ScheduledBlock.starts_at < ensure_utc(starts_before))
    if ends_after is not None:
        statement = statement.where(ScheduledBlock.ends_at > ensure_utc(ends_after))

    return list(session.scalars(statement))


def get_scheduled_block(session: Session, scheduled_block_id: str) -> ScheduledBlock:
    scheduled_block = session.get(ScheduledBlock, scheduled_block_id)
    if scheduled_block is None:
        raise ScheduledBlockNotFoundError(f"Scheduled block '{scheduled_block_id}' was not found.")
    return scheduled_block


def create_scheduled_block(
    session: Session,
    *,
    task_id: str,
    starts_at: datetime,
    ends_at: datetime,
    title_override: str | None = None,
) -> ScheduledBlock:
    if session.get(Task, task_id) is None:
        raise ScheduledBlockTaskNotFoundError(f"Task '{task_id}' was not found.")

    normalized_starts_at = ensure_utc(starts_at)
    normalized_ends_at = ensure_utc(ends_at)
    _ensure_positive_duration(
        starts_at=normalized_starts_at,
        ends_at=normalized_ends_at,
    )

    scheduled_block = ScheduledBlock(
        task_id=task_id,
        title_override=title_override,
        starts_at=normalized_starts_at,
        ends_at=normalized_ends_at,
        status=ScheduledBlockStatus.PLANNED,
    )
    session.add(scheduled_block)
    session.flush()

    _record_transition(
        session,
        scheduled_block=scheduled_block,
        event_type="created",
        from_state=None,
        to_state=scheduled_block.status,
    )

    return scheduled_block


def move_scheduled_block(
    session: Session,
    scheduled_block_id: str,
    *,
    starts_at: datetime,
    ends_at: datetime,
) -> ScheduledBlock:
    scheduled_block = get_scheduled_block(session, scheduled_block_id)
    normalized_starts_at = ensure_utc(starts_at)
    normalized_ends_at = ensure_utc(ends_at)
    _ensure_positive_duration(
        starts_at=normalized_starts_at,
        ends_at=normalized_ends_at,
    )

    previous_starts_at = ensure_utc(scheduled_block.starts_at)
    previous_ends_at = ensure_utc(scheduled_block.ends_at)

    scheduled_block.starts_at = normalized_starts_at
    scheduled_block.ends_at = normalized_ends_at
    scheduled_block.updated_at = utcnow()
    session.flush()

    _record_transition(
        session,
        scheduled_block=scheduled_block,
        event_type="moved",
        from_state=scheduled_block.status,
        to_state=scheduled_block.status,
        payload={
            "previous_starts_at": previous_starts_at.isoformat()
            if previous_starts_at is not None
            else None,
            "previous_ends_at": previous_ends_at.isoformat() if previous_ends_at is not None else None,
            "starts_at": scheduled_block.starts_at.isoformat(),
            "ends_at": scheduled_block.ends_at.isoformat(),
        },
    )

    return scheduled_block


def set_scheduled_block_status(
    session: Session,
    scheduled_block_id: str,
    *,
    status: ScheduledBlockStatus,
) -> ScheduledBlock:
    scheduled_block = get_scheduled_block(session, scheduled_block_id)
    previous_status = scheduled_block.status

    scheduled_block.status = status
    scheduled_block.updated_at = utcnow()
    session.flush()

    _record_transition(
        session,
        scheduled_block=scheduled_block,
        event_type="status_changed",
        from_state=previous_status,
        to_state=scheduled_block.status,
    )

    return scheduled_block


def _ensure_positive_duration(
    *,
    starts_at: datetime | None,
    ends_at: datetime | None,
) -> None:
    if starts_at is None or ends_at is None:
        raise InvalidScheduledBlockError("Scheduled blocks require start and end times.")
    if ends_at <= starts_at:
        raise InvalidScheduledBlockError("A scheduled block must end after it starts.")


def _record_transition(
    session: Session,
    *,
    scheduled_block: ScheduledBlock,
    event_type: str,
    from_state: ScheduledBlockStatus | None,
    to_state: ScheduledBlockStatus | None,
    payload: dict[str, str | None] | None = None,
) -> None:
    if from_state == to_state and payload is None:
        return

    session.add(
        StateTransition(
            entity_type=TransitionEntityType.SCHEDULED_BLOCK,
            entity_id=scheduled_block.id,
            event_type=event_type,
            from_state=from_state.value if from_state is not None else None,
            to_state=to_state.value if to_state is not None else None,
            payload=payload,
        )
    )
