from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from flowdesk.db import get_db_session
from flowdesk.schemas.references import (
    GitHubReferenceCreate,
    GitHubReferenceRead,
    MacroActivityCreate,
    MacroActivityRead,
)
from flowdesk.services.references import (
    DuplicateReferenceError,
    create_github_reference,
    create_macro_activity,
    list_github_references,
    list_macro_activities,
)

router = APIRouter(tags=["references"])


@router.get("/macro-activities", response_model=list[MacroActivityRead])
def list_macro_activity_route(
    session: Session = Depends(get_db_session),
) -> list[MacroActivityRead]:
    return [MacroActivityRead.model_validate(item) for item in list_macro_activities(session)]


@router.post(
    "/macro-activities",
    response_model=MacroActivityRead,
    status_code=status.HTTP_201_CREATED,
)
def create_macro_activity_route(
    payload: MacroActivityCreate,
    session: Session = Depends(get_db_session),
) -> MacroActivityRead:
    try:
        with session.begin():
            macro_activity = create_macro_activity(
                session,
                name=payload.name,
                description=payload.description,
                color_hex=payload.color_hex,
            )
        session.refresh(macro_activity)
        return MacroActivityRead.model_validate(macro_activity)
    except DuplicateReferenceError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.get("/github-references", response_model=list[GitHubReferenceRead])
def list_github_reference_route(
    session: Session = Depends(get_db_session),
) -> list[GitHubReferenceRead]:
    return [GitHubReferenceRead.model_validate(item) for item in list_github_references(session)]


@router.post(
    "/github-references",
    response_model=GitHubReferenceRead,
    status_code=status.HTTP_201_CREATED,
)
def create_github_reference_route(
    payload: GitHubReferenceCreate,
    session: Session = Depends(get_db_session),
) -> GitHubReferenceRead:
    try:
        with session.begin():
            reference = create_github_reference(
                session,
                repository_full_name=payload.repository_full_name,
                issue_number=payload.issue_number,
                issue_url=payload.issue_url,
                cached_title=payload.cached_title,
                cached_state=payload.cached_state,
                cached_labels=payload.cached_labels,
            )
        session.refresh(reference)
        return GitHubReferenceRead.model_validate(reference)
    except DuplicateReferenceError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
