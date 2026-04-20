from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from flowdesk.db import get_db_session
from flowdesk.schemas.notes import NoteCreate, NoteRead
from flowdesk.services.notes import (
    NoteExperimentNotFoundError,
    NoteTaskNotFoundError,
    add_experiment_note,
    add_task_note,
    append_journal_entry,
    list_experiment_notes,
    list_journal_entries,
    list_task_notes,
)

router = APIRouter(tags=["notes"])


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
    session.refresh(entry)
    return NoteRead.model_validate(entry)


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
