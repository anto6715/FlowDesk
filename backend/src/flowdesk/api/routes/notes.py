from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from flowdesk.db import get_db_session
from flowdesk.db.models import NoteBlockLinkTargetType
from flowdesk.schemas.notes import (
    NoteBlockCreate,
    NoteBlockRead,
    NoteBlockUpdate,
    NoteCreate,
    NoteRead,
)
from flowdesk.services.notes import (
    NoteBlockInvalidError,
    NoteBlockNotFoundError,
    NoteExperimentNotFoundError,
    NoteTaskNotFoundError,
    add_experiment_note,
    add_task_note,
    append_journal_entry,
    create_note_block,
    list_experiment_backlinks,
    list_experiment_notes,
    list_journal_entries,
    list_note_blocks,
    list_tag_backlinks,
    list_task_backlinks,
    list_task_notes,
    update_note_block,
)

router = APIRouter(tags=["notes"])


def _coerce_references(
    references: list[tuple[NoteBlockLinkTargetType, str]] | list,
) -> list[tuple[NoteBlockLinkTargetType, str]]:
    return [(reference.target_type, reference.target_id) for reference in references]


@router.get("/journal/{journal_day}/entries", response_model=list[NoteRead])
def list_journal_entries_route(
    journal_day: date,
    session: Session = Depends(get_db_session),
) -> list[NoteRead]:
    entries = list_journal_entries(session, journal_day)
    return [NoteRead.model_validate(entry) for entry in entries]


@router.post(
    "/journal/{journal_day}/entries",
    response_model=NoteRead,
    status_code=status.HTTP_201_CREATED,
)
def append_journal_entry_route(
    journal_day: date,
    payload: NoteCreate,
    session: Session = Depends(get_db_session),
) -> NoteRead:
    with session.begin():
        try:
            entry = append_journal_entry(
                session,
                journal_day=journal_day,
                content=payload.content,
                task_id=payload.task_id,
            )
        except NoteTaskNotFoundError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        except NoteExperimentNotFoundError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        except NoteBlockInvalidError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    session.refresh(entry)
    return NoteRead.model_validate(entry)


@router.get("/journal/{journal_day}/blocks", response_model=list[NoteBlockRead])
def list_note_blocks_route(
    journal_day: date,
    session: Session = Depends(get_db_session),
) -> list[NoteBlockRead]:
    blocks = list_note_blocks(session, journal_day)
    return [NoteBlockRead.model_validate(block) for block in blocks]


@router.post(
    "/journal/{journal_day}/blocks",
    response_model=NoteBlockRead,
    status_code=status.HTTP_201_CREATED,
)
def create_note_block_route(
    journal_day: date,
    payload: NoteBlockCreate,
    session: Session = Depends(get_db_session),
) -> NoteBlockRead:
    try:
        with session.begin():
            block = create_note_block(
                session,
                journal_day=journal_day,
                content_markdown=payload.content_markdown,
                parent_id=payload.parent_id,
                sort_order=payload.sort_order,
                explicit_references=_coerce_references(payload.references),
            )
        return NoteBlockRead.model_validate(block)
    except NoteTaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except NoteExperimentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except NoteBlockNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except NoteBlockInvalidError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/note-blocks/{block_id}", response_model=NoteBlockRead)
def update_note_block_route(
    block_id: str,
    payload: NoteBlockUpdate,
    session: Session = Depends(get_db_session),
) -> NoteBlockRead:
    try:
        with session.begin():
            block = update_note_block(
                session,
                block_id,
                content_markdown=payload.content_markdown,
                parent_id=payload.parent_id,
                update_parent="parent_id" in payload.model_fields_set,
                sort_order=payload.sort_order,
                explicit_references=(
                    None
                    if "references" not in payload.model_fields_set
                    else _coerce_references(payload.references or [])
                ),
            )
        return NoteBlockRead.model_validate(block)
    except NoteTaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except NoteExperimentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except NoteBlockNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except NoteBlockInvalidError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/tasks/{task_id}/backlinks", response_model=list[NoteBlockRead])
def list_task_backlinks_route(
    task_id: str,
    session: Session = Depends(get_db_session),
) -> list[NoteBlockRead]:
    try:
        blocks = list_task_backlinks(session, task_id)
        return [NoteBlockRead.model_validate(block) for block in blocks]
    except NoteTaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/experiments/{experiment_id}/backlinks", response_model=list[NoteBlockRead])
def list_experiment_backlinks_route(
    experiment_id: str,
    session: Session = Depends(get_db_session),
) -> list[NoteBlockRead]:
    try:
        blocks = list_experiment_backlinks(session, experiment_id)
        return [NoteBlockRead.model_validate(block) for block in blocks]
    except NoteExperimentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/tags/{tag_name}/backlinks", response_model=list[NoteBlockRead])
def list_tag_backlinks_route(
    tag_name: str,
    session: Session = Depends(get_db_session),
) -> list[NoteBlockRead]:
    blocks = list_tag_backlinks(session, tag_name)
    return [NoteBlockRead.model_validate(block) for block in blocks]


@router.get("/tasks/{task_id}/notes", response_model=list[NoteRead])
def list_task_notes_route(
    task_id: str,
    session: Session = Depends(get_db_session),
) -> list[NoteRead]:
    try:
        notes = list_task_notes(session, task_id)
        return [NoteRead.model_validate(note) for note in notes]
    except NoteTaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post(
    "/tasks/{task_id}/notes",
    response_model=NoteRead,
    status_code=status.HTTP_201_CREATED,
)
def add_task_note_route(
    task_id: str,
    payload: NoteCreate,
    session: Session = Depends(get_db_session),
) -> NoteRead:
    try:
        with session.begin():
            note = add_task_note(
                session,
                task_id=task_id,
                content=payload.content,
            )
        session.refresh(note)
        return NoteRead.model_validate(note)
    except NoteTaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/experiments/{experiment_id}/notes", response_model=list[NoteRead])
def list_experiment_notes_route(
    experiment_id: str,
    session: Session = Depends(get_db_session),
) -> list[NoteRead]:
    try:
        notes = list_experiment_notes(session, experiment_id)
        return [NoteRead.model_validate(note) for note in notes]
    except NoteExperimentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post(
    "/experiments/{experiment_id}/notes",
    response_model=NoteRead,
    status_code=status.HTTP_201_CREATED,
)
def add_experiment_note_route(
    experiment_id: str,
    payload: NoteCreate,
    session: Session = Depends(get_db_session),
) -> NoteRead:
    try:
        with session.begin():
            note = add_experiment_note(
                session,
                experiment_id=experiment_id,
                content=payload.content,
            )
        session.refresh(note)
        return NoteRead.model_validate(note)
    except NoteExperimentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
