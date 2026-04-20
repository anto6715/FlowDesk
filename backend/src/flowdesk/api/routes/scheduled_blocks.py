from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from flowdesk.db import get_db_session
from flowdesk.db.models import ScheduledBlockStatus
from flowdesk.schemas.scheduled_blocks import (
    ScheduledBlockCreate,
    ScheduledBlockMove,
    ScheduledBlockRead,
    ScheduledBlockStatusUpdate,
)
from flowdesk.services.scheduled_blocks import (
    InvalidScheduledBlockError,
    ScheduledBlockNotFoundError,
    ScheduledBlockTaskNotFoundError,
    create_scheduled_block,
    get_scheduled_block,
    list_scheduled_blocks,
    move_scheduled_block,
    set_scheduled_block_status,
)

router = APIRouter(prefix="/scheduled-blocks", tags=["scheduled-blocks"])


@router.get("", response_model=list[ScheduledBlockRead])
def list_scheduled_block_route(
    task_id: str | None = Query(default=None),
    block_status: ScheduledBlockStatus | None = Query(default=None, alias="status"),
    starts_before: datetime | None = Query(default=None),
    ends_after: datetime | None = Query(default=None),
    session: Session = Depends(get_db_session),
) -> list[ScheduledBlockRead]:
    blocks = list_scheduled_blocks(
        session,
        task_id=task_id,
        status=block_status,
        starts_before=starts_before,
        ends_after=ends_after,
    )
    return [ScheduledBlockRead.model_validate(block) for block in blocks]


@router.post("", response_model=ScheduledBlockRead, status_code=status.HTTP_201_CREATED)
def create_scheduled_block_route(
    payload: ScheduledBlockCreate,
    session: Session = Depends(get_db_session),
) -> ScheduledBlockRead:
    try:
        with session.begin():
            scheduled_block = create_scheduled_block(
                session,
                task_id=payload.task_id,
                title_override=payload.title_override,
                starts_at=payload.starts_at,
                ends_at=payload.ends_at,
            )
        session.refresh(scheduled_block)
        return ScheduledBlockRead.model_validate(scheduled_block)
    except ScheduledBlockTaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except InvalidScheduledBlockError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/{scheduled_block_id}", response_model=ScheduledBlockRead)
def get_scheduled_block_route(
    scheduled_block_id: str,
    session: Session = Depends(get_db_session),
) -> ScheduledBlockRead:
    try:
        scheduled_block = get_scheduled_block(session, scheduled_block_id)
        return ScheduledBlockRead.model_validate(scheduled_block)
    except ScheduledBlockNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/{scheduled_block_id}/move", response_model=ScheduledBlockRead)
def move_scheduled_block_route(
    scheduled_block_id: str,
    payload: ScheduledBlockMove,
    session: Session = Depends(get_db_session),
) -> ScheduledBlockRead:
    try:
        with session.begin():
            scheduled_block = move_scheduled_block(
                session,
                scheduled_block_id,
                starts_at=payload.starts_at,
                ends_at=payload.ends_at,
            )
        session.refresh(scheduled_block)
        return ScheduledBlockRead.model_validate(scheduled_block)
    except ScheduledBlockNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except InvalidScheduledBlockError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/{scheduled_block_id}/status", response_model=ScheduledBlockRead)
def set_scheduled_block_status_route(
    scheduled_block_id: str,
    payload: ScheduledBlockStatusUpdate,
    session: Session = Depends(get_db_session),
) -> ScheduledBlockRead:
    try:
        with session.begin():
            scheduled_block = set_scheduled_block_status(
                session,
                scheduled_block_id,
                status=payload.status,
            )
        session.refresh(scheduled_block)
        return ScheduledBlockRead.model_validate(scheduled_block)
    except ScheduledBlockNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
