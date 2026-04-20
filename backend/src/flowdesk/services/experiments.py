from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from flowdesk.db.models import Experiment, ExperimentStatus, StateTransition, Task, TransitionEntityType


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class ExperimentServiceError(Exception):
    """Base error for experiment application services."""


class ExperimentNotFoundError(ExperimentServiceError):
    """Raised when an experiment does not exist."""


class ExperimentTaskNotFoundError(ExperimentServiceError):
    """Raised when an experiment references a missing task."""


class InvalidExperimentTransitionError(ExperimentServiceError):
    """Raised when experiment timing or state data is invalid."""


def list_experiments(
    session: Session,
    *,
    task_id: str | None = None,
    status: ExperimentStatus | None = None,
) -> list[Experiment]:
    statement = select(Experiment).order_by(Experiment.updated_at.desc(), Experiment.created_at.desc())

    if task_id is not None:
        statement = statement.where(Experiment.task_id == task_id)
    if status is not None:
        statement = statement.where(Experiment.status == status)

    return list(session.scalars(statement))


def get_experiment(session: Session, experiment_id: str) -> Experiment:
    experiment = session.get(Experiment, experiment_id)
    if experiment is None:
        raise ExperimentNotFoundError(f"Experiment '{experiment_id}' was not found.")
    return experiment


def register_experiment(
    session: Session,
    *,
    task_id: str,
    title: str,
    instruction: str | None = None,
    status: ExperimentStatus = ExperimentStatus.DRAFT,
    work_dir: str | None = None,
    repository_path: str | None = None,
    branch_name: str | None = None,
    commit_hash: str | None = None,
    version_label: str | None = None,
    launch_command: str | None = None,
    scheduler_name: str | None = None,
    scheduler_job_id: str | None = None,
    started_at: datetime | None = None,
    ended_at: datetime | None = None,
    outcome_summary: str | None = None,
    log_path: str | None = None,
    result_path: str | None = None,
) -> Experiment:
    if session.get(Task, task_id) is None:
        raise ExperimentTaskNotFoundError(f"Task '{task_id}' was not found.")

    normalized_started_at = ensure_utc(started_at)
    normalized_ended_at = ensure_utc(ended_at)
    normalized_started_at, normalized_ended_at = _normalize_times_for_status(
        status=status,
        started_at=normalized_started_at,
        ended_at=normalized_ended_at,
    )
    _ensure_valid_time_range(
        started_at=normalized_started_at,
        ended_at=normalized_ended_at,
    )

    experiment = Experiment(
        task_id=task_id,
        title=title,
        instruction=instruction,
        status=status,
        work_dir=work_dir,
        repository_path=repository_path,
        branch_name=branch_name,
        commit_hash=commit_hash,
        version_label=version_label,
        launch_command=launch_command,
        scheduler_name=scheduler_name,
        scheduler_job_id=scheduler_job_id,
        started_at=normalized_started_at,
        ended_at=normalized_ended_at,
        outcome_summary=outcome_summary,
        log_path=log_path,
        result_path=result_path,
    )
    session.add(experiment)
    session.flush()

    _record_transition(
        session,
        experiment=experiment,
        event_type="created",
        from_state=None,
        to_state=experiment.status,
    )

    return experiment


def set_experiment_state(
    session: Session,
    experiment_id: str,
    *,
    status: ExperimentStatus,
    started_at: datetime | None = None,
    ended_at: datetime | None = None,
    outcome_summary: str | None = None,
) -> Experiment:
    experiment = get_experiment(session, experiment_id)
    previous_status = experiment.status

    normalized_started_at = ensure_utc(started_at) or ensure_utc(experiment.started_at)
    normalized_ended_at = ensure_utc(ended_at) or ensure_utc(experiment.ended_at)
    normalized_started_at, normalized_ended_at = _normalize_times_for_status(
        status=status,
        started_at=normalized_started_at,
        ended_at=normalized_ended_at,
    )
    _ensure_valid_time_range(
        started_at=normalized_started_at,
        ended_at=normalized_ended_at,
    )

    experiment.status = status
    experiment.started_at = normalized_started_at
    experiment.ended_at = normalized_ended_at
    if outcome_summary is not None:
        experiment.outcome_summary = outcome_summary
    experiment.updated_at = utcnow()
    session.flush()

    _record_transition(
        session,
        experiment=experiment,
        event_type="state_changed",
        from_state=previous_status,
        to_state=experiment.status,
        payload={
            "started_at": experiment.started_at.isoformat() if experiment.started_at is not None else None,
            "ended_at": experiment.ended_at.isoformat() if experiment.ended_at is not None else None,
        },
    )

    return experiment


def _normalize_times_for_status(
    *,
    status: ExperimentStatus,
    started_at: datetime | None,
    ended_at: datetime | None,
) -> tuple[datetime | None, datetime | None]:
    now = utcnow()

    if status == ExperimentStatus.RUNNING and started_at is None:
        started_at = now

    if status in _TERMINAL_STATUSES:
        ended_at = ended_at or now
        started_at = started_at or ended_at

    return started_at, ended_at


def _ensure_valid_time_range(
    *,
    started_at: datetime | None,
    ended_at: datetime | None,
) -> None:
    if ended_at is None:
        return
    if started_at is None:
        raise InvalidExperimentTransitionError("An experiment end time requires a start time.")
    if ended_at < started_at:
        raise InvalidExperimentTransitionError("An experiment cannot end before it starts.")


def _record_transition(
    session: Session,
    *,
    experiment: Experiment,
    event_type: str,
    from_state: ExperimentStatus | None,
    to_state: ExperimentStatus | None,
    payload: dict[str, str | None] | None = None,
) -> None:
    if from_state == to_state and payload is None:
        return

    session.add(
        StateTransition(
            entity_type=TransitionEntityType.EXPERIMENT,
            entity_id=experiment.id,
            event_type=event_type,
            from_state=from_state.value if from_state is not None else None,
            to_state=to_state.value if to_state is not None else None,
            payload=payload,
        )
    )


_TERMINAL_STATUSES = {
    ExperimentStatus.SUCCEEDED,
    ExperimentStatus.FAILED,
    ExperimentStatus.CANCELED,
}
