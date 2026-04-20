from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from flowdesk.db import get_db_session
from flowdesk.schemas.tasks import (
    ActiveTaskResponse,
    PauseTaskRequest,
    StartTaskRequest,
    SwitchTaskRequest,
    SwitchTaskResponse,
    TaskCreate,
    TaskRead,
    TaskSessionResponse,
    TaskUpdate,
    WorkSessionRead,
)
from flowdesk.services.tasks import (
    InvalidTaskTransitionError,
    LinkedEntityNotFoundError,
    TaskConflictError,
    TaskNotFoundError,
    create_task,
    get_active_context,
    list_work_sessions_for_task,
    list_tasks,
    pause_task,
    start_task,
    switch_task,
    update_task_metadata,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskRead])
def list_all_tasks(session: Session = Depends(get_db_session)) -> list[TaskRead]:
    tasks = list_tasks(session)
    return [TaskRead.model_validate(task) for task in tasks]


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_new_task(
    payload: TaskCreate,
    session: Session = Depends(get_db_session),
) -> TaskRead:
    try:
        with session.begin():
            task = create_task(
                session,
                title=payload.title,
                description=payload.description,
                priority=payload.priority,
                macro_activity_id=payload.macro_activity_id,
                github_reference_id=payload.github_reference_id,
            )
        session.refresh(task)
        return TaskRead.model_validate(task)
    except LinkedEntityNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.patch("/{task_id}", response_model=TaskRead)
def update_existing_task(
    task_id: str,
    payload: TaskUpdate,
    session: Session = Depends(get_db_session),
) -> TaskRead:
    try:
        with session.begin():
            task = update_task_metadata(
                session,
                task_id,
                updates=payload.model_dump(exclude_unset=True),
            )
        session.refresh(task)
        return TaskRead.model_validate(task)
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except LinkedEntityNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except TaskConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.get("/active", response_model=ActiveTaskResponse)
def get_active_task(session: Session = Depends(get_db_session)) -> ActiveTaskResponse:
    task, work_session = get_active_context(session)
    return ActiveTaskResponse(
        task=TaskRead.model_validate(task) if task is not None else None,
        work_session=WorkSessionRead.model_validate(work_session) if work_session is not None else None,
    )


@router.get("/{task_id}/work-sessions", response_model=list[WorkSessionRead])
def list_task_work_sessions(
    task_id: str,
    session: Session = Depends(get_db_session),
) -> list[WorkSessionRead]:
    try:
        work_sessions = list_work_sessions_for_task(session, task_id)
        return [WorkSessionRead.model_validate(work_session) for work_session in work_sessions]
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/{task_id}/start", response_model=TaskSessionResponse)
def start_task_route(
    task_id: str,
    payload: StartTaskRequest,
    session: Session = Depends(get_db_session),
) -> TaskSessionResponse:
    try:
        with session.begin():
            task, work_session = start_task(
                session,
                task_id,
                started_at=payload.started_at,
            )
        session.refresh(task)
        session.refresh(work_session)
        return TaskSessionResponse(
            task=TaskRead.model_validate(task),
            work_session=WorkSessionRead.model_validate(work_session),
        )
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except LinkedEntityNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except TaskConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except InvalidTaskTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/{task_id}/pause", response_model=TaskSessionResponse)
def pause_task_route(
    task_id: str,
    payload: PauseTaskRequest,
    session: Session = Depends(get_db_session),
) -> TaskSessionResponse:
    try:
        with session.begin():
            task, work_session = pause_task(
                session,
                task_id,
                ended_at=payload.ended_at,
                end_reason=payload.end_reason,
                waiting_reason=payload.waiting_reason,
            )
        session.refresh(task)
        session.refresh(work_session)
        return TaskSessionResponse(
            task=TaskRead.model_validate(task),
            work_session=WorkSessionRead.model_validate(work_session),
        )
    except TaskConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except InvalidTaskTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/switch", response_model=SwitchTaskResponse)
def switch_task_route(
    payload: SwitchTaskRequest,
    session: Session = Depends(get_db_session),
) -> SwitchTaskResponse:
    try:
        with session.begin():
            result = switch_task(
                session,
                from_task_id=payload.from_task_id,
                to_task_id=payload.to_task_id,
                ended_at=payload.ended_at,
                started_at=payload.started_at,
                waiting_reason=payload.waiting_reason,
            )
        session.refresh(result.from_task)
        session.refresh(result.ended_work_session)
        session.refresh(result.to_task)
        session.refresh(result.started_work_session)
        return SwitchTaskResponse(
            from_task=TaskRead.model_validate(result.from_task),
            ended_work_session=WorkSessionRead.model_validate(result.ended_work_session),
            to_task=TaskRead.model_validate(result.to_task),
            started_work_session=WorkSessionRead.model_validate(result.started_work_session),
        )
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except TaskConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except InvalidTaskTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
