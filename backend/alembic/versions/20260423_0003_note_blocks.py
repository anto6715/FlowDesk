"""Add note block persistence and backlink indexes."""

from collections.abc import Sequence
from datetime import date, datetime
import re
from uuid import uuid4

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20260423_0003"
down_revision: str | None = "20260420_0002"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


note_block_link_target_type = sa.Enum(
    "task",
    "experiment",
    "tag",
    name="note_block_link_target_type",
    native_enum=False,
    create_constraint=True,
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


def upgrade() -> None:
    op.create_table(
        "note_blocks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("journal_day", sa.Date(), nullable=False),
        sa.Column("parent_id", sa.String(length=36), nullable=True),
        sa.Column("legacy_note_id", sa.String(length=36), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("content_markdown", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["legacy_note_id"],
            ["notes.id"],
            name=op.f("fk_note_blocks_legacy_note_id_notes"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"],
            ["note_blocks.id"],
            name=op.f("fk_note_blocks_parent_id_note_blocks"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_note_blocks")),
        sa.UniqueConstraint("legacy_note_id", name=op.f("uq_note_blocks_legacy_note_id")),
    )
    op.create_index(
        op.f("ix_note_blocks_journal_day"),
        "note_blocks",
        ["journal_day"],
        unique=False,
    )
    op.create_index(op.f("ix_note_blocks_parent_id"), "note_blocks", ["parent_id"], unique=False)
    op.create_index(
        op.f("ix_note_blocks_legacy_note_id"),
        "note_blocks",
        ["legacy_note_id"],
        unique=False,
    )
    op.create_index(op.f("ix_note_blocks_sort_order"), "note_blocks", ["sort_order"], unique=False)

    op.create_table(
        "note_block_links",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("note_block_id", sa.String(length=36), nullable=False),
        sa.Column("target_type", note_block_link_target_type, nullable=False),
        sa.Column("task_id", sa.String(length=36), nullable=True),
        sa.Column("experiment_id", sa.String(length=36), nullable=True),
        sa.Column("tag_name", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "("
            "(target_type = 'task' AND task_id IS NOT NULL AND experiment_id IS NULL AND tag_name IS NULL) "
            "OR "
            "(target_type = 'experiment' AND task_id IS NULL AND experiment_id IS NOT NULL AND tag_name IS NULL) "
            "OR "
            "(target_type = 'tag' AND task_id IS NULL AND experiment_id IS NULL AND tag_name IS NOT NULL)"
            ")",
            name=op.f("ck_note_block_links_note_block_link_target_match"),
        ),
        sa.ForeignKeyConstraint(
            ["experiment_id"],
            ["experiments.id"],
            name=op.f("fk_note_block_links_experiment_id_experiments"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["note_block_id"],
            ["note_blocks.id"],
            name=op.f("fk_note_block_links_note_block_id_note_blocks"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["task_id"],
            ["tasks.id"],
            name=op.f("fk_note_block_links_task_id_tasks"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_note_block_links")),
    )
    op.create_index(
        op.f("ix_note_block_links_note_block_id"),
        "note_block_links",
        ["note_block_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_note_block_links_target_type"),
        "note_block_links",
        ["target_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_note_block_links_task_id"),
        "note_block_links",
        ["task_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_note_block_links_experiment_id"),
        "note_block_links",
        ["experiment_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_note_block_links_tag_name"),
        "note_block_links",
        ["tag_name"],
        unique=False,
    )

    _backfill_daily_journal_note_blocks()


def downgrade() -> None:
    op.drop_index(op.f("ix_note_block_links_tag_name"), table_name="note_block_links")
    op.drop_index(op.f("ix_note_block_links_experiment_id"), table_name="note_block_links")
    op.drop_index(op.f("ix_note_block_links_task_id"), table_name="note_block_links")
    op.drop_index(op.f("ix_note_block_links_target_type"), table_name="note_block_links")
    op.drop_index(op.f("ix_note_block_links_note_block_id"), table_name="note_block_links")
    op.drop_table("note_block_links")

    op.drop_index(op.f("ix_note_blocks_sort_order"), table_name="note_blocks")
    op.drop_index(op.f("ix_note_blocks_legacy_note_id"), table_name="note_blocks")
    op.drop_index(op.f("ix_note_blocks_parent_id"), table_name="note_blocks")
    op.drop_index(op.f("ix_note_blocks_journal_day"), table_name="note_blocks")
    op.drop_table("note_blocks")


def _backfill_daily_journal_note_blocks() -> None:
    connection = op.get_bind()
    metadata = sa.MetaData()

    notes = sa.Table(
        "notes",
        metadata,
        sa.Column("id", sa.String(length=36)),
        sa.Column("scope", sa.String(length=32)),
        sa.Column("journal_day", sa.Date()),
        sa.Column("task_id", sa.String(length=36)),
        sa.Column("content", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    tasks = sa.Table("tasks", metadata, sa.Column("id", sa.String(length=36)))
    experiments = sa.Table("experiments", metadata, sa.Column("id", sa.String(length=36)))
    note_blocks = sa.Table(
        "note_blocks",
        metadata,
        sa.Column("id", sa.String(length=36)),
        sa.Column("journal_day", sa.Date()),
        sa.Column("legacy_note_id", sa.String(length=36)),
        sa.Column("sort_order", sa.Integer()),
        sa.Column("content_markdown", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    note_block_links = sa.Table(
        "note_block_links",
        metadata,
        sa.Column("id", sa.String(length=36)),
        sa.Column("note_block_id", sa.String(length=36)),
        sa.Column("target_type", sa.String(length=32)),
        sa.Column("task_id", sa.String(length=36)),
        sa.Column("experiment_id", sa.String(length=36)),
        sa.Column("tag_name", sa.String(length=120)),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )

    task_ids = set(connection.execute(sa.select(tasks.c.id)).scalars())
    experiment_ids = set(connection.execute(sa.select(experiments.c.id)).scalars())
    daily_journal_rows = connection.execute(
        sa.select(
            notes.c.id,
            notes.c.journal_day,
            notes.c.task_id,
            notes.c.content,
            notes.c.created_at,
            notes.c.updated_at,
        )
        .where(notes.c.scope == "daily_journal")
        .order_by(notes.c.journal_day.asc(), notes.c.created_at.asc(), notes.c.id.asc())
    ).mappings()

    sort_order_by_day: dict[date, int] = {}
    for row in daily_journal_rows:
        journal_day = row["journal_day"]
        if journal_day is None:
            continue

        block_id = str(uuid4())
        sort_order = sort_order_by_day.get(journal_day, 0)
        sort_order_by_day[journal_day] = sort_order + 1

        connection.execute(
            note_blocks.insert().values(
                id=block_id,
                journal_day=journal_day,
                legacy_note_id=row["id"],
                sort_order=sort_order,
                content_markdown=row["content"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
        )

        for link in _extract_links(
            content=row["content"],
            created_at=row["created_at"],
            note_block_id=block_id,
            preferred_task_id=row["task_id"],
            task_ids=task_ids,
            experiment_ids=experiment_ids,
        ):
            connection.execute(note_block_links.insert().values(**link))


def _extract_links(
    *,
    content: str,
    created_at: datetime,
    note_block_id: str,
    preferred_task_id: str | None,
    task_ids: set[str],
    experiment_ids: set[str],
) -> list[dict[str, str | datetime | None]]:
    links: list[dict[str, str | datetime | None]] = []
    seen_tasks: set[str] = set()
    seen_experiments: set[str] = set()
    seen_tags: set[str] = set()

    if preferred_task_id is not None and preferred_task_id in task_ids:
        links.append(
            {
                "id": str(uuid4()),
                "note_block_id": note_block_id,
                "target_type": "task",
                "task_id": preferred_task_id,
                "experiment_id": None,
                "tag_name": None,
                "created_at": created_at,
            }
        )
        seen_tasks.add(preferred_task_id)

    for match in INLINE_REFERENCE_PATTERN.finditer(content):
        target_type = match.group(1)
        target_id = match.group(2)
        if target_type == "task":
            if target_id not in task_ids or target_id in seen_tasks:
                continue
            links.append(
                {
                    "id": str(uuid4()),
                    "note_block_id": note_block_id,
                    "target_type": "task",
                    "task_id": target_id,
                    "experiment_id": None,
                    "tag_name": None,
                    "created_at": created_at,
                }
            )
            seen_tasks.add(target_id)
            continue

        if target_id not in experiment_ids or target_id in seen_experiments:
            continue
        links.append(
            {
                "id": str(uuid4()),
                "note_block_id": note_block_id,
                "target_type": "experiment",
                "task_id": None,
                "experiment_id": target_id,
                "tag_name": None,
                "created_at": created_at,
            }
        )
        seen_experiments.add(target_id)

    for match in TAG_PATTERN.finditer(content):
        tag_name = match.group(1).lower()
        if tag_name in seen_tags:
            continue
        links.append(
            {
                "id": str(uuid4()),
                "note_block_id": note_block_id,
                "target_type": "tag",
                "task_id": None,
                "experiment_id": None,
                "tag_name": tag_name,
                "created_at": created_at,
            }
        )
        seen_tags.add(tag_name)

    return links
