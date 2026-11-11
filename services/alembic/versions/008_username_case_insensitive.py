"""Usernames are unique regardless of letter case

"Alice", "alice" and "aLICE" could all be registered, which made look-alike
accounts possible. Login now matches the username case-insensitively, which is
only unambiguous with this index in place.

Revision ID: 008_username_case
Revises: 007_dropzone_uniqueness
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '008_username_case'
down_revision: Union[str, Sequence[str], None] = '007_dropzone_uniqueness'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    clashes = op.get_bind().execute(sa.text(
        "SELECT string_agg(username, ', ' ORDER BY created_at) FROM users "
        "GROUP BY lower(username) HAVING count(*) > 1"
    )).scalars().all()
    if clashes:
        # Which account keeps the name is a decision for a person, not a migration.
        raise RuntimeError(
            "These usernames differ only by letter case; rename all but one of each group, "
            "then run the migration again: " + " | ".join(clashes)
        )
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_lower ON users (lower(username))")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_users_username_lower")
