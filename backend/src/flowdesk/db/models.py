from __future__ import annotations

from datetime import date, datetime, timezone
from enum import StrEnum
from uuid import uuid4

from sqlalchemy import JSON, CheckConstraint, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from flowdesk.db.base import Base


def new_uuid() -> str:
    return str(uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def sql_enum(enum_cls: type[StrEnum], *, name: str) -> Enum:
    return Enum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        validate_strings=True,
        values_callable=lambda members: [member.value for member in members],
    )


class TaskStatus(StrEnum):
    INBOX = "inbox"
    READY = "ready"
    IN_PROGRESS = "in_progress"
    WAITING = "waiting"
    BLOCKED = "blocked"
    DONE = "done"
    ARCHIVED = "archived"


class TaskPriority(StrEnum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class WaitingReason(StrEnum):
    EXPERIMENT_RUNNING = "experiment_running"
    EXPERIMENT_STALLED = "experiment_stalled"
    PR_FEEDBACK = "pr_feedback"
    ISSUE_FEEDBACK = "issue_feedback"
    EXTERNAL_CONTRIBUTION = "external_contribution"
    RESEARCHER_INPUT = "researcher_input"
    OTHER = "other"


class WorkSessionEndReason(StrEnum):
    PAUSED = "paused"
    SWITCHED = "switched"
    WAITING = "waiting"
    BLOCKED = "blocked"
    COMPLETED = "completed"
    OTHER = "other"


class ScheduledBlockStatus(StrEnum):
    PLANNED = "planned"
    COMPLETED = "completed"
    CANCELED = "canceled"


class ExperimentStatus(StrEnum):
    DRAFT = "draft"
    QUEUED = "queued"
    RUNNING = "running"
    STALLED = "stalled"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELED = "canceled"
    UNKNOWN = "unknown"


class NoteScope(StrEnum):
    DAILY_JOURNAL = "daily_journal"
    TASK = "task"
    EXPERIMENT = "experiment"


class ArtifactKind(StrEnum):
    WORKDIR = "workdir"
    REPOSITORY = "repository"
    SCRIPT = "script"
    LOG = "log"
    RESULT = "result"
    DOCUMENT = "document"
    OTHER = "other"


class TransitionEntityType(StrEnum):
    TASK = "task"
    EXPERIMENT = "experiment"
    SCHEDULED_BLOCK = "scheduled_block"


class MacroActivity(Base):
    __tablename__ = "macro_activities"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text(), nullable=True)
    color_hex: Mapped[str | None] = mapped_column(String(7), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        nullable=False,
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    tasks: Mapped[list[Task]] = relationship(back_populates="macro_activity")


class GitHubReference(Base):
    __tablename__ = "github_references"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    repository_full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    issue_number: Mapped[int] = mapped_column(Integer(), nullable=False)
    issue_url: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    cached_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cached_state: Mapped[str | None] = mapped_column(String(32), nullable=True)
    cached_labels: Mapped[list[str] | None] = mapped_column(JSON(), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        nullable=False,
    )

    task: Mapped[Task | None] = relationship(back_populates="github_reference")

    __table_args__ = (
        CheckConstraint("issue_number > 0", name="issue_number_positive"),
    )


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text(), nullable=True)
    status: Mapped[TaskStatus] = mapped_column(
        sql_enum(TaskStatus, name="task_status"),
        default=TaskStatus.INBOX,
        nullable=False,
        index=True,
    )
    priority: Mapped[TaskPriority] = mapped_column(
        sql_enum(TaskPriority, name="task_priority"),
        default=TaskPriority.NORMAL,
        nullable=False,
        index=True,
    )
    waiting_reason: Mapped[WaitingReason | None] = mapped_column(
        sql_enum(WaitingReason, name="waiting_reason"),
        nullable=True,
        index=True,
    )
    macro_activity_id: Mapped[str | None] = mapped_column(
        ForeignKey("macro_activities.id", ondelete="SET NULL"),
        nullable=True,
    )
    github_reference_id: Mapped[str | None] = mapped_column(
        ForeignKey("github_references.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    macro_activity: Mapped[MacroActivity | None] = relationship(back_populates="tasks")
    github_reference: Mapped[GitHubReference | None] = relationship(back_populates="task")
    work_sessions: Mapped[list[WorkSession]] = relationship(back_populates="task")
    scheduled_blocks: Mapped[list[ScheduledBlock]] = relationship(back_populates="task")
    experiments: Mapped[list[Experiment]] = relationship(back_populates="task")
    notes: Mapped[list[Note]] = relationship(back_populates="task")
    artifacts: Mapped[list[ArtifactReference]] = relationship(back_populates="task")

    __table_args__ = (
        CheckConstraint(
            "waiting_reason IS NULL OR status = 'waiting'",
            name="waiting_reason_requires_waiting_status",
        ),
    )


class WorkSession(Base):
    __tablename__ = "work_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    task_id: Mapped[str] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    end_reason: Mapped[WorkSessionEndReason | None] = mapped_column(
        sql_enum(WorkSessionEndReason, name="work_session_end_reason"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        nullable=False,
    )

    task: Mapped[Task] = relationship(back_populates="work_sessions")

    __table_args__ = (
        CheckConstraint(
            "ended_at IS NULL OR ended_at >= started_at",
            name="ended_after_started",
        ),
    )


class ScheduledBlock(Base):
    __tablename__ = "scheduled_blocks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    task_id: Mapped[str] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title_override: Mapped[str | None] = mapped_column(String(255), nullable=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    status: Mapped[ScheduledBlockStatus] = mapped_column(
        sql_enum(ScheduledBlockStatus, name="scheduled_block_status"),
        default=ScheduledBlockStatus.PLANNED,
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        nullable=False,
    )

    task: Mapped[Task] = relationship(back_populates="scheduled_blocks")

    __table_args__ = (
        CheckConstraint("ends_at > starts_at", name="scheduled_block_positive_duration"),
    )


class Experiment(Base):
    __tablename__ = "experiments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    task_id: Mapped[str] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    instruction: Mapped[str | None] = mapped_column(Text(), nullable=True)
    status: Mapped[ExperimentStatus] = mapped_column(
        sql_enum(ExperimentStatus, name="experiment_status"),
        default=ExperimentStatus.DRAFT,
        nullable=False,
        index=True,
    )
    work_dir: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    repository_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    branch_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    commit_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    version_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    launch_command: Mapped[str | None] = mapped_column(Text(), nullable=True)
    scheduler_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    scheduler_job_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    outcome_summary: Mapped[str | None] = mapped_column(Text(), nullable=True)
    log_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    result_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        nullable=False,
    )

    task: Mapped[Task] = relationship(back_populates="experiments")
    notes: Mapped[list[Note]] = relationship(back_populates="experiment")
    artifacts: Mapped[list[ArtifactReference]] = relationship(back_populates="experiment")

    __table_args__ = (
        CheckConstraint(
            "ended_at IS NULL OR (started_at IS NOT NULL AND ended_at >= started_at)",
            name="experiment_valid_time_range",
        ),
    )


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    scope: Mapped[NoteScope] = mapped_column(
        sql_enum(NoteScope, name="note_scope"),
        nullable=False,
        index=True,
    )
    journal_day: Mapped[date | None] = mapped_column(nullable=True, index=True)
    task_id: Mapped[str | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    experiment_id: Mapped[str | None] = mapped_column(
        ForeignKey("experiments.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    content: Mapped[str] = mapped_column(Text(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        nullable=False,
    )

    task: Mapped[Task | None] = relationship(back_populates="notes")
    experiment: Mapped[Experiment | None] = relationship(back_populates="notes")

    __table_args__ = (
        CheckConstraint(
            "("
            "(scope = 'daily_journal' AND journal_day IS NOT NULL AND task_id IS NULL AND experiment_id IS NULL) OR "
            "(scope = 'task' AND journal_day IS NULL AND task_id IS NOT NULL AND experiment_id IS NULL) OR "
            "(scope = 'experiment' AND journal_day IS NULL AND task_id IS NULL AND experiment_id IS NOT NULL)"
            ")",
            name="note_scope_target_match",
        ),
    )


class ArtifactReference(Base):
    __tablename__ = "artifact_references"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    task_id: Mapped[str | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    experiment_id: Mapped[str | None] = mapped_column(
        ForeignKey("experiments.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    kind: Mapped[ArtifactKind] = mapped_column(
        sql_enum(ArtifactKind, name="artifact_kind"),
        nullable=False,
        index=True,
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    path: Mapped[str] = mapped_column(String(1024), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        nullable=False,
    )

    task: Mapped[Task | None] = relationship(back_populates="artifacts")
    experiment: Mapped[Experiment | None] = relationship(back_populates="artifacts")

    __table_args__ = (
        CheckConstraint(
            "task_id IS NOT NULL OR experiment_id IS NOT NULL",
            name="artifact_requires_link",
        ),
    )


class StateTransition(Base):
    __tablename__ = "state_transitions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    entity_type: Mapped[TransitionEntityType] = mapped_column(
        sql_enum(TransitionEntityType, name="transition_entity_type"),
        nullable=False,
        index=True,
    )
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    from_state: Mapped[str | None] = mapped_column(String(64), nullable=True)
    to_state: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payload: Mapped[dict | list | None] = mapped_column(JSON(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        nullable=False,
        index=True,
    )
