from __future__ import annotations

from datetime import date

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from flowdesk.db.models import Experiment, Note, NoteScope, Task


class NoteServiceError(Exception):
    """Base error for note application services."""


class NoteTaskNotFoundError(NoteServiceError):
    """Raised when a task note references a missing task."""


class NoteExperimentNotFoundError(NoteServiceError):
    """Raised when an experiment note references a missing experiment."""


def list_journal_entries(session: Session, journal_day: date) -> list[Note]:
    statement = (
        select(Note)
        .where(Note.scope == NoteScope.DAILY_JOURNAL)
        .where(Note.journal_day == journal_day)
        .order_by(Note.created_at.asc())
    )
    return list(session.scalars(statement))


def append_journal_entry(
    session: Session,
    *,
    journal_day: date,
    content: str,
    task_id: str | None = None,
) -> Note:
    if task_id is not None and session.get(Task, task_id) is None:
        raise NoteTaskNotFoundError(f"Task '{task_id}' was not found.")

    note = Note(
        scope=NoteScope.DAILY_JOURNAL,
        journal_day=journal_day,
        task_id=task_id,
        content=content,
    )
    session.add(note)
    session.flush()
    return note


def list_task_notes(session: Session, task_id: str) -> list[Note]:
    if session.get(Task, task_id) is None:
        raise NoteTaskNotFoundError(f"Task '{task_id}' was not found.")

    statement = (
        select(Note)
        .where(
            or_(
                and_(Note.scope == NoteScope.TASK, Note.task_id == task_id),
                and_(Note.scope == NoteScope.DAILY_JOURNAL, Note.task_id == task_id),
            )
        )
        .order_by(Note.created_at.asc())
    )
    return list(session.scalars(statement))


def add_task_note(
    session: Session,
    *,
    task_id: str,
    content: str,
) -> Note:
    if session.get(Task, task_id) is None:
        raise NoteTaskNotFoundError(f"Task '{task_id}' was not found.")

    note = Note(
        scope=NoteScope.TASK,
        task_id=task_id,
        content=content,
    )
    session.add(note)
    session.flush()
    return note


def list_experiment_notes(session: Session, experiment_id: str) -> list[Note]:
    if session.get(Experiment, experiment_id) is None:
        raise NoteExperimentNotFoundError(f"Experiment '{experiment_id}' was not found.")

    statement = (
        select(Note)
        .where(Note.scope == NoteScope.EXPERIMENT)
        .where(Note.experiment_id == experiment_id)
        .order_by(Note.created_at.asc())
    )
    return list(session.scalars(statement))


def add_experiment_note(
    session: Session,
    *,
    experiment_id: str,
    content: str,
) -> Note:
    if session.get(Experiment, experiment_id) is None:
        raise NoteExperimentNotFoundError(f"Experiment '{experiment_id}' was not found.")

    note = Note(
        scope=NoteScope.EXPERIMENT,
        experiment_id=experiment_id,
        content=content,
    )
    session.add(note)
    session.flush()
    return note
