"""Allow daily journal entries to link to tasks."""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260420_0002"
down_revision: str | None = "20260417_0001"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


new_note_scope_check = (
    "("
    "(scope = 'daily_journal' AND journal_day IS NOT NULL AND experiment_id IS NULL) OR "
    "(scope = 'task' AND journal_day IS NULL AND task_id IS NOT NULL AND experiment_id IS NULL) OR "
    "(scope = 'experiment' AND journal_day IS NULL AND task_id IS NULL AND experiment_id IS NOT NULL)"
    ")"
)

old_note_scope_check = (
    "("
    "(scope = 'daily_journal' AND journal_day IS NOT NULL AND task_id IS NULL AND experiment_id IS NULL) OR "
    "(scope = 'task' AND journal_day IS NULL AND task_id IS NOT NULL AND experiment_id IS NULL) OR "
    "(scope = 'experiment' AND journal_day IS NULL AND task_id IS NULL AND experiment_id IS NOT NULL)"
    ")"
)


def upgrade() -> None:
    with op.batch_alter_table("notes", recreate="always") as batch_op:
        batch_op.drop_constraint("note_scope_target_match", type_="check")
        batch_op.create_check_constraint(
            "note_scope_target_match",
            new_note_scope_check,
        )


def downgrade() -> None:
    with op.batch_alter_table("notes", recreate="always") as batch_op:
        batch_op.drop_constraint("note_scope_target_match", type_="check")
        batch_op.create_check_constraint(
            "note_scope_target_match",
            old_note_scope_check,
        )
