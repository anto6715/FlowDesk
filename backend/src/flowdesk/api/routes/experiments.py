from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from flowdesk.db import get_db_session
from flowdesk.db.models import ExperimentStatus
from flowdesk.schemas.experiments import ExperimentCreate, ExperimentRead, ExperimentStateUpdate
from flowdesk.services.experiments import (
    ExperimentNotFoundError,
    ExperimentTaskNotFoundError,
    InvalidExperimentTransitionError,
    get_experiment,
    list_experiments,
    register_experiment,
    set_experiment_state,
)

router = APIRouter(prefix="/experiments", tags=["experiments"])


@router.get("", response_model=list[ExperimentRead])
def list_experiment_route(
    task_id: str | None = Query(default=None),
    experiment_status: ExperimentStatus | None = Query(default=None, alias="status"),
    session: Session = Depends(get_db_session),
) -> list[ExperimentRead]:
    experiments = list_experiments(
        session,
        task_id=task_id,
        status=experiment_status,
    )
    return [ExperimentRead.model_validate(experiment) for experiment in experiments]


@router.post("", response_model=ExperimentRead, status_code=status.HTTP_201_CREATED)
def register_experiment_route(
    payload: ExperimentCreate,
    session: Session = Depends(get_db_session),
) -> ExperimentRead:
    try:
        with session.begin():
            experiment = register_experiment(
                session,
                task_id=payload.task_id,
                title=payload.title,
                instruction=payload.instruction,
                status=payload.status,
                work_dir=payload.work_dir,
                repository_path=payload.repository_path,
                branch_name=payload.branch_name,
                commit_hash=payload.commit_hash,
                version_label=payload.version_label,
                launch_command=payload.launch_command,
                scheduler_name=payload.scheduler_name,
                scheduler_job_id=payload.scheduler_job_id,
                started_at=payload.started_at,
                ended_at=payload.ended_at,
                outcome_summary=payload.outcome_summary,
                log_path=payload.log_path,
                result_path=payload.result_path,
            )
        session.refresh(experiment)
        return ExperimentRead.model_validate(experiment)
    except ExperimentTaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except InvalidExperimentTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/{experiment_id}", response_model=ExperimentRead)
def get_experiment_route(
    experiment_id: str,
    session: Session = Depends(get_db_session),
) -> ExperimentRead:
    try:
        experiment = get_experiment(session, experiment_id)
        return ExperimentRead.model_validate(experiment)
    except ExperimentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/{experiment_id}/state", response_model=ExperimentRead)
def set_experiment_state_route(
    experiment_id: str,
    payload: ExperimentStateUpdate,
    session: Session = Depends(get_db_session),
) -> ExperimentRead:
    try:
        with session.begin():
            experiment = set_experiment_state(
                session,
                experiment_id,
                status=payload.status,
                started_at=payload.started_at,
                ended_at=payload.ended_at,
                outcome_summary=payload.outcome_summary,
            )
        session.refresh(experiment)
        return ExperimentRead.model_validate(experiment)
    except ExperimentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except InvalidExperimentTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
