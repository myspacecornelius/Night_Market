"""One membership per zone and one check-in per zone per day

The API checked "already a member" and "already checked in today" by reading
first and inserting afterwards, and nothing in the database backed the rule up,
so simultaneous requests created duplicate rows (and paid the check-in reward
more than once). Duplicates that already exist are removed, keeping the earliest.

Revision ID: 007_dropzone_uniqueness
Revises: 006_align_constraints
"""
from typing import Sequence, Union

from alembic import op

revision: str = '007_dropzone_uniqueness'
down_revision: Union[str, Sequence[str], None] = '006_align_constraints'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        DELETE FROM dropzone_members
        WHERE id IN (
            SELECT id FROM (
                SELECT id, row_number() OVER (
                    PARTITION BY dropzone_id, user_id ORDER BY joined_at, id
                ) AS position
                FROM dropzone_members
            ) ranked
            WHERE position > 1
        )
    """)
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_dropzone_members_zone_user "
        "ON dropzone_members (dropzone_id, user_id)"
    )

    op.execute("""
        DELETE FROM dropzone_checkins
        WHERE id IN (
            SELECT id FROM (
                SELECT id, row_number() OVER (
                    PARTITION BY dropzone_id, user_id, ((checked_in_at AT TIME ZONE 'UTC')::date)
                    ORDER BY checked_in_at, id
                ) AS position
                FROM dropzone_checkins
            ) ranked
            WHERE position > 1
        )
    """)
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_dropzone_checkins_zone_user_day "
        "ON dropzone_checkins (dropzone_id, user_id, ((checked_in_at AT TIME ZONE 'UTC')::date))"
    )
    # "How many rewarded check-ins has this user made today" runs on every check-in
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_dropzone_checkins_user_time "
        "ON dropzone_checkins (user_id, checked_in_at)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_dropzone_checkins_user_time")
    op.execute("DROP INDEX IF EXISTS uq_dropzone_checkins_zone_user_day")
    op.execute("DROP INDEX IF EXISTS uq_dropzone_members_zone_user")
