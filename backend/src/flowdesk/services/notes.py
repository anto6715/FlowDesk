from __future__ import annotations

from dataclasses import dataclass
from datetime import date
import re

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from flowdesk.db.models import (
    Experiment,
    Note,
    NoteBlock,
    NoteBlockLink,
    NoteBlockLinkTargetType,
    NoteScope,
    Task,
)

UUID_PATTERN = (
    r"[0-9a-fA-F]{8}-"
    r"[0-9a-fA-F]{4}-"
    r"[0-9a-fA-F]{4}-"
    r"[0-9a-fA-F]{4}-"
    r"[0-9a-fA-F]{12}"
)
INLINE_REFERENCE_PATTERN = re.compile(
    rf"\[\[(task|experiment):({UUID_PATTERN})(?:\|[^\]]+)?\]\]"
)
TAG_PATTERN = re.compile(r"(?<![\w/])#([A-Za-z][A-Za-z0-9_-]*)")


class NoteServiceError(Exception):
    """Base error for note application services."""


class NoteTaskNotFoundError(NoteServiceError):
    """Raised when a task note references a missing task."""


class NoteExperimentNotFoundError(NoteServiceError):
    """Raised when an experiment note references a missing experiment."""


class NoteBlockNotFoundError(NoteServiceError):
    """Raised when a note block cannot be found."""


class NoteBlockInvalidError(NoteServiceError):
    """Raised when a note block request is invalid."""


@dataclass(frozen=True)
class EntityReference:
    target_type: NoteBlockLinkTargetType
    target_id: str


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
    explicit_references = []
    if task_id is not None:
        explicit_references.append((NoteBlockLinkTargetType.TASK, task_id))

    note, _ = _create_daily_journal_note_with_block(
        session,
        journal_day=journal_day,
        content_markdown=content,
        explicit_references=explicit_references,
        preferred_legacy_task_id=task_id,
    )
    return note


def list_note_blocks(session: Session, journal_day: date) -> list[NoteBlock]:
    statement = (
        select(NoteBlock)
        .options(selectinload(NoteBlock.links))
        .where(NoteBlock.journal_day == journal_day)
        .order_by(NoteBlock.sort_order.asc(), NoteBlock.created_at.asc())
    )
    return list(session.scalars(statement))


def create_note_block(
    session: Session,
    *,
    journal_day: date,
    content_markdown: str,
    parent_id: str | None = None,
    sort_order: int | None = None,
    explicit_references: list[tuple[NoteBlockLinkTargetType, str]] | None = None,
) -> NoteBlock:
    _, block = _create_daily_journal_note_with_block(
        session,
        journal_day=journal_day,
        content_markdown=content_markdown,
        parent_id=parent_id,
        sort_order=sort_order,
        explicit_references=explicit_references or [],
    )
    return _get_note_block(session, block.id)


def update_note_block(
    session: Session,
    block_id: str,
    *,
    content_markdown: str | None = None,
    parent_id: str | None = None,
    update_parent: bool = False,
    sort_order: int | None = None,
    explicit_references: list[tuple[NoteBlockLinkTargetType, str]] | None = None,
) -> NoteBlock:
    block = _get_note_block(session, block_id)
    if block is None:
        raise NoteBlockNotFoundError(f"Note block '{block_id}' was not found.")

    if update_parent and parent_id == block.id:
        raise NoteBlockInvalidError("A note block cannot be its own parent.")

    if update_parent:
        if parent_id is None:
            block.parent_id = None
        else:
            parent = _validate_note_block_parent(
                session,
                journal_day=block.journal_day,
                parent_id=parent_id,
                current_block_id=block.id,
            )
            block.parent_id = parent.id

    if sort_order is not None:
        block.sort_order = sort_order

    note = session.get(Note, block.legacy_note_id) if block.legacy_note_id is not None else None
    if note is None:
        note = Note(
            scope=NoteScope.DAILY_JOURNAL,
            journal_day=block.journal_day,
            content=content_markdown or block.content_markdown,
        )
        session.add(note)
        session.flush()
        block.legacy_note_id = note.id

    next_content = content_markdown if content_markdown is not None else block.content_markdown
    next_references = (
        _extract_entity_references(block.links)
        if explicit_references is None
        else _normalize_explicit_references(explicit_references)
    )

    _sync_note_block(
        session,
        note_block=block,
        legacy_note=note,
        content_markdown=next_content,
        explicit_references=next_references,
        preferred_legacy_task_id=note.task_id,
    )
    session.flush()
    return _get_note_block(session, block.id)


def list_task_backlinks(session: Session, task_id: str) -> list[NoteBlock]:
    if session.get(Task, task_id) is None:
        raise NoteTaskNotFoundError(f"Task '{task_id}' was not found.")

    statement = (
        select(NoteBlock)
        .join(NoteBlockLink, NoteBlockLink.note_block_id == NoteBlock.id)
        .options(selectinload(NoteBlock.links))
        .where(NoteBlockLink.task_id == task_id)
        .order_by(NoteBlock.journal_day.desc(), NoteBlock.sort_order.asc(), NoteBlock.created_at.asc())
    )
    return list(session.scalars(statement).unique())


def list_experiment_backlinks(session: Session, experiment_id: str) -> list[NoteBlock]:
    if session.get(Experiment, experiment_id) is None:
        raise NoteExperimentNotFoundError(f"Experiment '{experiment_id}' was not found.")

    statement = (
        select(NoteBlock)
        .join(NoteBlockLink, NoteBlockLink.note_block_id == NoteBlock.id)
        .options(selectinload(NoteBlock.links))
        .where(NoteBlockLink.experiment_id == experiment_id)
        .order_by(NoteBlock.journal_day.desc(), NoteBlock.sort_order.asc(), NoteBlock.created_at.asc())
    )
    return list(session.scalars(statement).unique())


def list_tag_backlinks(session: Session, tag_name: str) -> list[NoteBlock]:
    normalized_tag = tag_name.lower()
    statement = (
        select(NoteBlock)
        .join(NoteBlockLink, NoteBlockLink.note_block_id == NoteBlock.id)
        .options(selectinload(NoteBlock.links))
        .where(NoteBlockLink.tag_name == normalized_tag)
        .order_by(NoteBlock.journal_day.desc(), NoteBlock.sort_order.asc(), NoteBlock.created_at.asc())
    )
    return list(session.scalars(statement).unique())


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


def _create_daily_journal_note_with_block(
    session: Session,
    *,
    journal_day: date,
    content_markdown: str,
    parent_id: str | None = None,
    sort_order: int | None = None,
    explicit_references: list[tuple[NoteBlockLinkTargetType, str]],
    preferred_legacy_task_id: str | None = None,
) -> tuple[Note, NoteBlock]:
    normalized_references = _normalize_explicit_references(explicit_references)

    resolved_parent_id: str | None = None
    if parent_id is not None:
        parent = _validate_note_block_parent(
            session,
            journal_day=journal_day,
            parent_id=parent_id,
        )
        resolved_parent_id = parent.id

    note = Note(
        scope=NoteScope.DAILY_JOURNAL,
        journal_day=journal_day,
        content=content_markdown,
    )
    session.add(note)
    session.flush()

    block = NoteBlock(
        journal_day=journal_day,
        parent_id=resolved_parent_id,
        legacy_note_id=note.id,
        sort_order=_next_note_block_sort_order(session, journal_day)
        if sort_order is None
        else sort_order,
        content_markdown=content_markdown,
    )
    session.add(block)
    session.flush()

    _sync_note_block(
        session,
        note_block=block,
        legacy_note=note,
        content_markdown=content_markdown,
        explicit_references=normalized_references,
        preferred_legacy_task_id=preferred_legacy_task_id,
    )
    session.flush()
    return note, block


def _sync_note_block(
    session: Session,
    *,
    note_block: NoteBlock,
    legacy_note: Note,
    content_markdown: str,
    explicit_references: set[EntityReference],
    preferred_legacy_task_id: str | None = None,
) -> None:
    parsed_references = _parse_inline_references(content_markdown)
    all_references = parsed_references | explicit_references
    _validate_entity_references(session, all_references)

    tag_names = _parse_tag_names(content_markdown)
    note_block.content_markdown = content_markdown
    note_block.links = _build_note_block_links(all_references, tag_names)
    legacy_note.content = content_markdown
    legacy_note.task_id = _choose_legacy_task_id(
        all_references,
        preferred_task_id=preferred_legacy_task_id,
    )


def _validate_note_block_parent(
    session: Session,
    *,
    journal_day: date,
    parent_id: str,
    current_block_id: str | None = None,
) -> NoteBlock:
    parent = session.get(NoteBlock, parent_id)
    if parent is None:
        raise NoteBlockNotFoundError(f"Note block '{parent_id}' was not found.")
    if current_block_id is not None and parent.id == current_block_id:
        raise NoteBlockInvalidError("A note block cannot be its own parent.")
    if parent.journal_day != journal_day:
        raise NoteBlockInvalidError("A parent note block must belong to the same journal day.")
    return parent


def _get_note_block(session: Session, block_id: str) -> NoteBlock | None:
    statement = (
        select(NoteBlock)
        .options(selectinload(NoteBlock.links))
        .where(NoteBlock.id == block_id)
    )
    return session.scalar(statement)


def _next_note_block_sort_order(session: Session, journal_day: date) -> int:
    current_max = session.scalar(
        select(func.max(NoteBlock.sort_order)).where(NoteBlock.journal_day == journal_day)
    )
    return 0 if current_max is None else current_max + 1


def _normalize_explicit_references(
    references: list[tuple[NoteBlockLinkTargetType, str]],
) -> set[EntityReference]:
    normalized: set[EntityReference] = set()
    for target_type, target_id in references:
        if target_type == NoteBlockLinkTargetType.TAG:
            raise NoteBlockInvalidError("Structured tag references are not supported. Use #tags in content.")
        normalized.add(EntityReference(target_type=target_type, target_id=target_id))
    return normalized


def _parse_inline_references(content_markdown: str) -> set[EntityReference]:
    parsed: set[EntityReference] = set()
    for match in INLINE_REFERENCE_PATTERN.finditer(content_markdown):
        target_type = (
            NoteBlockLinkTargetType.TASK
            if match.group(1) == "task"
            else NoteBlockLinkTargetType.EXPERIMENT
        )
        parsed.add(EntityReference(target_type=target_type, target_id=match.group(2)))
    return parsed


def _parse_tag_names(content_markdown: str) -> set[str]:
    return {match.group(1).lower() for match in TAG_PATTERN.finditer(content_markdown)}


def _validate_entity_references(
    session: Session,
    references: set[EntityReference],
) -> None:
    task_ids = sorted(
        reference.target_id
        for reference in references
        if reference.target_type == NoteBlockLinkTargetType.TASK
    )
    experiment_ids = sorted(
        reference.target_id
        for reference in references
        if reference.target_type == NoteBlockLinkTargetType.EXPERIMENT
    )

    if task_ids:
        existing_task_ids = set(session.scalars(select(Task.id).where(Task.id.in_(task_ids))))
        missing_task_ids = [task_id for task_id in task_ids if task_id not in existing_task_ids]
        if missing_task_ids:
            raise NoteTaskNotFoundError(f"Task '{missing_task_ids[0]}' was not found.")

    if experiment_ids:
        existing_experiment_ids = set(
            session.scalars(select(Experiment.id).where(Experiment.id.in_(experiment_ids)))
        )
        missing_experiment_ids = [
            experiment_id
            for experiment_id in experiment_ids
            if experiment_id not in existing_experiment_ids
        ]
        if missing_experiment_ids:
            raise NoteExperimentNotFoundError(
                f"Experiment '{missing_experiment_ids[0]}' was not found."
            )


def _build_note_block_links(
    references: set[EntityReference],
    tag_names: set[str],
) -> list[NoteBlockLink]:
    links: list[NoteBlockLink] = []

    for reference in sorted(references, key=lambda item: (item.target_type.value, item.target_id)):
        if reference.target_type == NoteBlockLinkTargetType.TASK:
            links.append(
                NoteBlockLink(
                    target_type=NoteBlockLinkTargetType.TASK,
                    task_id=reference.target_id,
                )
            )
            continue

        links.append(
            NoteBlockLink(
                target_type=NoteBlockLinkTargetType.EXPERIMENT,
                experiment_id=reference.target_id,
            )
        )

    for tag_name in sorted(tag_names):
        links.append(
            NoteBlockLink(
                target_type=NoteBlockLinkTargetType.TAG,
                tag_name=tag_name,
            )
        )

    return links


def _extract_entity_references(links: list[NoteBlockLink]) -> set[EntityReference]:
    extracted: set[EntityReference] = set()
    for link in links:
        if link.target_type == NoteBlockLinkTargetType.TAG:
            continue
        if link.target_id is None:
            continue
        extracted.add(EntityReference(target_type=link.target_type, target_id=link.target_id))
    return extracted


def _choose_legacy_task_id(
    references: set[EntityReference],
    *,
    preferred_task_id: str | None = None,
) -> str | None:
    task_ids = sorted(
        reference.target_id
        for reference in references
        if reference.target_type == NoteBlockLinkTargetType.TASK
    )
    unique_task_ids = list(dict.fromkeys(task_ids))
    if len(unique_task_ids) == 1:
        return unique_task_ids[0]
    if preferred_task_id is not None and preferred_task_id in unique_task_ids:
        return preferred_task_id
    return None
