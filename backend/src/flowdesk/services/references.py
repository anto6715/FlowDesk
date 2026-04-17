from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from flowdesk.db.models import GitHubReference, MacroActivity


class ReferenceServiceError(Exception):
    """Base error for macro-activity and GitHub reference services."""


class DuplicateReferenceError(ReferenceServiceError):
    """Raised when a unique macro-activity or GitHub reference already exists."""


def list_macro_activities(session: Session) -> list[MacroActivity]:
    statement = select(MacroActivity).order_by(MacroActivity.name.asc())
    return list(session.scalars(statement))


def create_macro_activity(
    session: Session,
    *,
    name: str,
    description: str | None = None,
    color_hex: str | None = None,
) -> MacroActivity:
    macro_activity = MacroActivity(
        name=name,
        description=description,
        color_hex=color_hex,
    )
    session.add(macro_activity)
    try:
        session.flush()
    except IntegrityError as exc:
        raise DuplicateReferenceError(f"Macro activity '{name}' already exists.") from exc

    return macro_activity


def list_github_references(session: Session) -> list[GitHubReference]:
    statement = select(GitHubReference).order_by(
        GitHubReference.repository_full_name.asc(),
        GitHubReference.issue_number.asc(),
    )
    return list(session.scalars(statement))


def create_github_reference(
    session: Session,
    *,
    repository_full_name: str,
    issue_number: int,
    issue_url: str,
    cached_title: str | None = None,
    cached_state: str | None = None,
    cached_labels: list[str] | None = None,
) -> GitHubReference:
    reference = GitHubReference(
        repository_full_name=repository_full_name,
        issue_number=issue_number,
        issue_url=issue_url,
        cached_title=cached_title,
        cached_state=cached_state,
        cached_labels=cached_labels,
    )
    session.add(reference)
    try:
        session.flush()
    except IntegrityError as exc:
        raise DuplicateReferenceError(
            f"GitHub reference '{repository_full_name}#{issue_number}' already exists."
        ) from exc

    return reference
