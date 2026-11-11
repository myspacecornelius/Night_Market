"""Drop follows, in-app notifications and quest claims

* drop_interests: who follows which drop. drops.interest_count was a counter that
  any request could increment any number of times.
* notifications: messages for one user (release reminders, quest rewards).
* quest_claims: one row per collected quest reward, so a reward is paid once.
* QUEST_REWARD joins the LACES transaction types.

Revision ID: 009_follows_notifications
Revises: 008_username_case
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '009_follows_notifications'
down_revision: Union[str, Sequence[str], None] = '008_username_case'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE transaction_type_enum ADD VALUE IF NOT EXISTS 'QUEST_REWARD'")

    op.create_table(
        'drop_interests',
        sa.Column('drop_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('drops.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.user_id', ondelete='CASCADE'), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_drop_interests_user_id', 'drop_interests', ['user_id'])
    # The counter becomes "number of followers"; nobody followed anything before this table existed.
    op.execute("UPDATE drops SET interest_count = 0 WHERE interest_count <> 0")

    op.create_table(
        'notifications',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False),
        sa.Column('kind', sa.String(50), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('link', sa.String(500), nullable=True),
        sa.Column('dedupe_key', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.execute('CREATE INDEX ix_notifications_user_created ON notifications (user_id, created_at DESC)')
    op.create_index('uq_notifications_user_dedupe', 'notifications', ['user_id', 'dedupe_key'], unique=True)

    op.create_table(
        'quest_claims',
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.user_id', ondelete='CASCADE'), primary_key=True),
        sa.Column('quest_id', sa.String(64), primary_key=True),
        sa.Column('period_key', sa.String(32), primary_key=True),
        sa.Column('reward', sa.Integer(), nullable=False),
        sa.Column('claimed_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('quest_claims')
    op.drop_table('notifications')
    op.drop_table('drop_interests')
    # PostgreSQL cannot remove a value from an enum type; QUEST_REWARD stays.
