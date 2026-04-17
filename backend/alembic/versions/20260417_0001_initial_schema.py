"""Create initial Flow Desk schema."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20260417_0001"
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


task_status = sa.Enum(
    "inbox",
    "ready",
    "in_progress",
    "waiting",
    "blocked",
    "done",
    "archived",
    name="task_status",
    native_enum=False,
    create_constraint=True,
)
task_priority = sa.Enum(
    "low",
    "normal",
    "high",
    "urgent",
    name="task_priority",
    native_enum=False,
    create_constraint=True,
)
waiting_reason = sa.Enum(
    "experiment_running",
    "experiment_stalled",
    "pr_feedback",
    "issue_feedback",
    "external_contribution",
    "researcher_input",
    "other",
    name="waiting_reason",
    native_enum=False,
    create_constraint=True,
)
work_session_end_reason = sa.Enum(
    "paused",
    "switched",
    "waiting",
    "blocked",
    "completed",
    "other",
    name="work_session_end_reason",
    native_enum=False,
    create_constraint=True,
)
scheduled_block_status = sa.Enum(
    "planned",
    "completed",
    "canceled",
    name="scheduled_block_status",
    native_enum=False,
    create_constraint=True,
)
experiment_status = sa.Enum(
    "draft",
    "queued",
    "running",
    "stalled",
    "succeeded",
    "failed",
    "canceled",
    "unknown",
    name="experiment_status",
    native_enum=False,
    create_constraint=True,
)
note_scope = sa.Enum(
    "daily_journal",
    "task",
    "experiment",
    name="note_scope",
    native_enum=False,
    create_constraint=True,
)
artifact_kind = sa.Enum(
    "workdir",
    "repository",
    "script",
    "log",
    "result",
    "document",
    "other",
    name="artifact_kind",
    native_enum=False,
    create_constraint=True,
)
transition_entity_type = sa.Enum(
    "task",
    "experiment",
    "scheduled_block",
    name="transition_entity_type",
    native_enum=False,
    create_constraint=True,
)


def upgrade() -> None:
    op.create_table(
        "macro_activities",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("color_hex", sa.String(length=7), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_macro_activities")),
    )
    op.create_index(op.f("ix_macro_activities_name"), "macro_activities", ["name"], unique=True)

    op.create_table(
        "github_references",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("repository_full_name", sa.String(length=255), nullable=False),
        sa.Column("issue_number", sa.Integer(), nullable=False),
        sa.Column("issue_url", sa.String(length=512), nullable=False),
        sa.Column("cached_title", sa.String(length=255), nullable=True),
        sa.Column("cached_state", sa.String(length=32), nullable=True),
        sa.Column("cached_labels", sa.JSON(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("issue_number > 0", name=op.f("ck_github_references_issue_number_positive")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_github_references")),
        sa.UniqueConstraint("issue_url", name=op.f("uq_github_references_issue_url")),
        sa.UniqueConstraint(
            "repository_full_name",
            "issue_number",
            name="uq_github_references_repo_issue",
        ),
    )

    op.create_table(
        "tasks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", task_status, nullable=False),
        sa.Column("priority", task_priority, nullable=False),
        sa.Column("waiting_reason", waiting_reason, nullable=True),
        sa.Column("macro_activity_id", sa.String(length=36), nullable=True),
        sa.Column("github_reference_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "waiting_reason IS NULL OR status = 'waiting'",
            name=op.f("ck_tasks_waiting_reason_requires_waiting_status"),
        ),
        sa.ForeignKeyConstraint(
            ["github_reference_id"],
            ["github_references.id"],
            name=op.f("fk_tasks_github_reference_id_github_references"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["macro_activity_id"],
            ["macro_activities.id"],
            name=op.f("fk_tasks_macro_activity_id_macro_activities"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tasks")),
        sa.UniqueConstraint("github_reference_id", name=op.f("uq_tasks_github_reference_id")),
    )
    op.create_index(op.f("ix_tasks_priority"), "tasks", ["priority"], unique=False)
    op.create_index(op.f("ix_tasks_status"), "tasks", ["status"], unique=False)
    op.create_index(op.f("ix_tasks_title"), "tasks", ["title"], unique=False)
    op.create_index(op.f("ix_tasks_waiting_reason"), "tasks", ["waiting_reason"], unique=False)

    op.create_table(
        "work_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("task_id", sa.String(length=36), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_reason", work_session_end_reason, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "ended_at IS NULL OR ended_at >= started_at",
            name=op.f("ck_work_sessions_ended_after_started"),
        ),
        sa.ForeignKeyConstraint(
            ["task_id"],
            ["tasks.id"],
            name=op.f("fk_work_sessions_task_id_tasks"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_work_sessions")),
    )
    op.create_index(op.f("ix_work_sessions_ended_at"), "work_sessions", ["ended_at"], unique=False)
    op.create_index(op.f("ix_work_sessions_started_at"), "work_sessions", ["started_at"], unique=False)
    op.create_index(op.f("ix_work_sessions_task_id"), "work_sessions", ["task_id"], unique=False)

    op.create_table(
        "scheduled_blocks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("task_id", sa.String(length=36), nullable=False),
        sa.Column("title_override", sa.String(length=255), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", scheduled_block_status, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "ends_at > starts_at",
            name=op.f("ck_scheduled_blocks_scheduled_block_positive_duration"),
        ),
        sa.ForeignKeyConstraint(
            ["task_id"],
            ["tasks.id"],
            name=op.f("fk_scheduled_blocks_task_id_tasks"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_scheduled_blocks")),
    )
    op.create_index(op.f("ix_scheduled_blocks_ends_at"), "scheduled_blocks", ["ends_at"], unique=False)
    op.create_index(op.f("ix_scheduled_blocks_starts_at"), "scheduled_blocks", ["starts_at"], unique=False)
    op.create_index(op.f("ix_scheduled_blocks_status"), "scheduled_blocks", ["status"], unique=False)
    op.create_index(op.f("ix_scheduled_blocks_task_id"), "scheduled_blocks", ["task_id"], unique=False)

    op.create_table(
        "experiments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("task_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("instruction", sa.Text(), nullable=True),
        sa.Column("status", experiment_status, nullable=False),
        sa.Column("work_dir", sa.String(length=1024), nullable=True),
        sa.Column("repository_path", sa.String(length=1024), nullable=True),
        sa.Column("branch_name", sa.String(length=255), nullable=True),
        sa.Column("commit_hash", sa.String(length=64), nullable=True),
        sa.Column("version_label", sa.String(length=120), nullable=True),
        sa.Column("launch_command", sa.Text(), nullable=True),
        sa.Column("scheduler_name", sa.String(length=120), nullable=True),
        sa.Column("scheduler_job_id", sa.String(length=120), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("outcome_summary", sa.Text(), nullable=True),
        sa.Column("log_path", sa.String(length=1024), nullable=True),
        sa.Column("result_path", sa.String(length=1024), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "ended_at IS NULL OR (started_at IS NOT NULL AND ended_at >= started_at)",
            name=op.f("ck_experiments_experiment_valid_time_range"),
        ),
        sa.ForeignKeyConstraint(
            ["task_id"],
            ["tasks.id"],
            name=op.f("fk_experiments_task_id_tasks"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_experiments")),
    )
    op.create_index(op.f("ix_experiments_status"), "experiments", ["status"], unique=False)
    op.create_index(op.f("ix_experiments_task_id"), "experiments", ["task_id"], unique=False)

    op.create_table(
        "notes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("scope", note_scope, nullable=False),
        sa.Column("journal_day", sa.Date(), nullable=True),
        sa.Column("task_id", sa.String(length=36), nullable=True),
        sa.Column("experiment_id", sa.String(length=36), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "("
            "(scope = 'daily_journal' AND journal_day IS NOT NULL AND task_id IS NULL AND experiment_id IS NULL) OR "
            "(scope = 'task' AND journal_day IS NULL AND task_id IS NOT NULL AND experiment_id IS NULL) OR "
            "(scope = 'experiment' AND journal_day IS NULL AND task_id IS NULL AND experiment_id IS NOT NULL)"
            ")",
            name=op.f("ck_notes_note_scope_target_match"),
        ),
        sa.ForeignKeyConstraint(
            ["experiment_id"],
            ["experiments.id"],
            name=op.f("fk_notes_experiment_id_experiments"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["task_id"],
            ["tasks.id"],
            name=op.f("fk_notes_task_id_tasks"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notes")),
    )
    op.create_index(op.f("ix_notes_experiment_id"), "notes", ["experiment_id"], unique=False)
    op.create_index(op.f("ix_notes_journal_day"), "notes", ["journal_day"], unique=False)
    op.create_index(op.f("ix_notes_scope"), "notes", ["scope"], unique=False)
    op.create_index(op.f("ix_notes_task_id"), "notes", ["task_id"], unique=False)

    op.create_table(
        "artifact_references",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("task_id", sa.String(length=36), nullable=True),
        sa.Column("experiment_id", sa.String(length=36), nullable=True),
        sa.Column("kind", artifact_kind, nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("path", sa.String(length=1024), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "task_id IS NOT NULL OR experiment_id IS NOT NULL",
            name=op.f("ck_artifact_references_artifact_requires_link"),
        ),
        sa.ForeignKeyConstraint(
            ["experiment_id"],
            ["experiments.id"],
            name=op.f("fk_artifact_references_experiment_id_experiments"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["task_id"],
            ["tasks.id"],
            name=op.f("fk_artifact_references_task_id_tasks"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_artifact_references")),
    )
    op.create_index(
        op.f("ix_artifact_references_experiment_id"),
        "artifact_references",
        ["experiment_id"],
        unique=False,
    )
    op.create_index(op.f("ix_artifact_references_kind"), "artifact_references", ["kind"], unique=False)
    op.create_index(op.f("ix_artifact_references_task_id"), "artifact_references", ["task_id"], unique=False)

    op.create_table(
        "state_transitions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("entity_type", transition_entity_type, nullable=False),
        sa.Column("entity_id", sa.String(length=36), nullable=False),
        sa.Column("event_type", sa.String(length=120), nullable=False),
        sa.Column("from_state", sa.String(length=64), nullable=True),
        sa.Column("to_state", sa.String(length=64), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_state_transitions")),
    )
    op.create_index(op.f("ix_state_transitions_created_at"), "state_transitions", ["created_at"], unique=False)
    op.create_index(op.f("ix_state_transitions_entity_id"), "state_transitions", ["entity_id"], unique=False)
    op.create_index(op.f("ix_state_transitions_entity_type"), "state_transitions", ["entity_type"], unique=False)
    op.create_index(op.f("ix_state_transitions_event_type"), "state_transitions", ["event_type"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_state_transitions_event_type"), table_name="state_transitions")
    op.drop_index(op.f("ix_state_transitions_entity_type"), table_name="state_transitions")
    op.drop_index(op.f("ix_state_transitions_entity_id"), table_name="state_transitions")
    op.drop_index(op.f("ix_state_transitions_created_at"), table_name="state_transitions")
    op.drop_table("state_transitions")

    op.drop_index(op.f("ix_artifact_references_task_id"), table_name="artifact_references")
    op.drop_index(op.f("ix_artifact_references_kind"), table_name="artifact_references")
    op.drop_index(op.f("ix_artifact_references_experiment_id"), table_name="artifact_references")
    op.drop_table("artifact_references")

    op.drop_index(op.f("ix_notes_task_id"), table_name="notes")
    op.drop_index(op.f("ix_notes_scope"), table_name="notes")
    op.drop_index(op.f("ix_notes_journal_day"), table_name="notes")
    op.drop_index(op.f("ix_notes_experiment_id"), table_name="notes")
    op.drop_table("notes")

    op.drop_index(op.f("ix_experiments_task_id"), table_name="experiments")
    op.drop_index(op.f("ix_experiments_status"), table_name="experiments")
    op.drop_table("experiments")

    op.drop_index(op.f("ix_scheduled_blocks_task_id"), table_name="scheduled_blocks")
    op.drop_index(op.f("ix_scheduled_blocks_status"), table_name="scheduled_blocks")
    op.drop_index(op.f("ix_scheduled_blocks_starts_at"), table_name="scheduled_blocks")
    op.drop_index(op.f("ix_scheduled_blocks_ends_at"), table_name="scheduled_blocks")
    op.drop_table("scheduled_blocks")

    op.drop_index(op.f("ix_work_sessions_task_id"), table_name="work_sessions")
    op.drop_index(op.f("ix_work_sessions_started_at"), table_name="work_sessions")
    op.drop_index(op.f("ix_work_sessions_ended_at"), table_name="work_sessions")
    op.drop_table("work_sessions")

    op.drop_index(op.f("ix_tasks_waiting_reason"), table_name="tasks")
    op.drop_index(op.f("ix_tasks_title"), table_name="tasks")
    op.drop_index(op.f("ix_tasks_status"), table_name="tasks")
    op.drop_index(op.f("ix_tasks_priority"), table_name="tasks")
    op.drop_table("tasks")

    op.drop_table("github_references")
    op.drop_index(op.f("ix_macro_activities_name"), table_name="macro_activities")
    op.drop_table("macro_activities")
