"""Align foreign keys, constraints and indexes with the models

The models declare ON DELETE rules, check constraints and indexes that no
migration ever created:

* posts and laces_ledger had no index besides the primary key, so every feed,
  heatmap and ledger query scanned the whole table;
* the foreign keys from posts and laces_ledger had no ON DELETE rule, so
  deleting a user or a post failed instead of cascading / detaching;
* posts.boost_score and users.is_anonymous were nullable although the code
  treats them as NOT NULL;
* the non-zero and non-negative checks existed only in Python.

Check constraints are added NOT VALID: new and updated rows are checked, while
rows written before this migration are left alone.

Revision ID: 006_align_constraints
Revises: 005_reconcile_schema
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '006_align_constraints'
down_revision: Union[str, Sequence[str], None] = '005_reconcile_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (constraint name, table, column, referenced table, referenced column, ON DELETE)
FOREIGN_KEYS = (
    ('posts_user_id_fkey', 'posts', 'user_id', 'users', 'user_id', 'CASCADE'),
    ('fk_posts_location_id', 'posts', 'location_id', 'locations', 'id', 'SET NULL'),
    ('laces_ledger_user_id_fkey', 'laces_ledger', 'user_id', 'users', 'user_id', 'CASCADE'),
    ('laces_ledger_related_post_id_fkey', 'laces_ledger', 'related_post_id', 'posts', 'post_id', 'SET NULL'),
)

# (name, table, SQL column list)
NEW_INDEXES = (
    ('ix_posts_user_id', 'posts', 'user_id'),
    ('ix_posts_location_id', 'posts', 'location_id'),
    ('ix_posts_timestamp', 'posts', '"timestamp" DESC'),
    ('ix_posts_user_timestamp', 'posts', 'user_id, "timestamp" DESC'),
    ('ix_posts_location_timestamp', 'posts', 'location_id, "timestamp" DESC'),
    ('ix_posts_boost_score', 'posts', 'boost_score DESC'),
    ('ix_posts_type_timestamp', 'posts', 'post_type, "timestamp" DESC'),
    ('ix_posts_visibility_timestamp', 'posts', 'visibility, "timestamp" DESC'),
    ('ix_laces_ledger_user_id', 'laces_ledger', 'user_id'),
    ('ix_laces_user_created', 'laces_ledger', 'user_id, created_at DESC'),
    ('ix_laces_type_created', 'laces_ledger', 'transaction_type, created_at DESC'),
    ('ix_laces_amount', 'laces_ledger', 'amount'),
    ('ix_users_created_at', 'users', 'created_at'),
    ('ix_users_laces_balance', 'users', 'laces_balance DESC'),
    ('ix_signals_user_id', 'signals', 'user_id'),
    ('ix_signals_signal_type', 'signals', 'signal_type'),
    ('ix_signals_brand', 'signals', 'brand'),
    ('ix_signals_city', 'signals', 'city'),
    ('ix_signals_dedupe_hash', 'signals', 'dedupe_hash'),
    ('ix_signals_active', 'signals', 'visibility, is_flagged, expires_at'),
    ('ix_stores_retailer_type', 'stores', 'retailer_type'),
)

# Indexes that exist with ascending columns where the model sorts newest/highest first.
# (name, table, old column list, new column list)
REORDERED_INDEXES = (
    ('ix_drops_featured_release', 'drops', 'is_featured, release_at', 'is_featured, release_at DESC'),
    ('ix_drops_hype_release', 'drops', 'hype_score, release_at', 'hype_score DESC, release_at'),
    ('ix_signals_brand_time', 'signals', 'brand, created_at', 'brand, created_at DESC'),
    ('ix_signals_city_time', 'signals', 'city, created_at', 'city, created_at DESC'),
    ('ix_signals_geohash_time', 'signals', 'geohash, created_at', 'geohash, created_at DESC'),
    ('ix_signals_reputation', 'signals', 'reputation_score', 'reputation_score DESC'),
    ('ix_signals_type_time', 'signals', 'signal_type, created_at', 'signal_type, created_at DESC'),
    ('ix_signals_user_time', 'signals', 'user_id, created_at', 'user_id, created_at DESC'),
    ('ix_signals_visibility_time', 'signals', 'visibility, created_at', 'visibility, created_at DESC'),
)

# (name, table, SQL condition)
CHECKS = (
    ('non_zero_amount', 'laces_ledger', 'amount != 0'),
    ('positive_boost_score', 'posts', 'boost_score >= 0'),
    ('positive_view_count', 'posts', 'view_count >= 0'),
    ('positive_reply_count', 'posts', 'reply_count >= 0'),
    ('positive_repost_count', 'posts', 'repost_count >= 0'),
)


def _replace_foreign_keys(with_on_delete: bool) -> None:
    for name, table, column, ref_table, ref_column, on_delete in FOREIGN_KEYS:
        op.drop_constraint(name, table, type_='foreignkey')
        op.create_foreign_key(
            name, table, ref_table, [column], [ref_column], ondelete=on_delete if with_on_delete else None
        )


def upgrade() -> None:
    _replace_foreign_keys(with_on_delete=True)

    # Columns the code treats as NOT NULL
    op.execute("UPDATE posts SET boost_score = 0 WHERE boost_score IS NULL")
    op.alter_column('posts', 'boost_score', existing_type=sa.Integer(), nullable=False, server_default='0')
    op.execute("UPDATE users SET is_anonymous = false WHERE is_anonymous IS NULL")
    op.alter_column('users', 'is_anonymous', existing_type=sa.Boolean(), nullable=False, server_default=sa.false())
    op.alter_column('posts', 'content_text', existing_type=sa.String(), type_=sa.Text(), existing_nullable=True)

    for name, table, columns in NEW_INDEXES:
        op.execute(f'CREATE INDEX IF NOT EXISTS {name} ON {table} ({columns})')
    for name, table, _old, new in REORDERED_INDEXES:
        op.execute(f'DROP INDEX IF EXISTS {name}')
        op.execute(f'CREATE INDEX {name} ON {table} ({new})')

    # ix_signals_dedupe indexes the same column as the model's ix_signals_dedupe_hash
    op.execute('DROP INDEX IF EXISTS ix_signals_dedupe')

    # Uniqueness lives in unique indexes (as the models declare) instead of table constraints
    op.execute('CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email)')
    op.execute('CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON users (username)')
    op.execute('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key')
    op.execute('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key')
    op.execute('DROP INDEX IF EXISTS ix_stores_slug')
    op.execute('CREATE UNIQUE INDEX ix_stores_slug ON stores (slug)')
    op.execute('ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_slug_key')

    for name, table, condition in CHECKS:
        op.execute(f'ALTER TABLE {table} ADD CONSTRAINT {name} CHECK ({condition}) NOT VALID')


def downgrade() -> None:
    for name, table, _condition in CHECKS:
        op.execute(f'ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {name}')

    op.execute('ALTER TABLE stores ADD CONSTRAINT stores_slug_key UNIQUE (slug)')
    op.execute('DROP INDEX IF EXISTS ix_stores_slug')
    op.execute('CREATE INDEX ix_stores_slug ON stores (slug)')
    op.execute('ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username)')
    op.execute('ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email)')
    op.execute('DROP INDEX IF EXISTS ix_users_username')
    op.execute('DROP INDEX IF EXISTS ix_users_email')

    op.execute('CREATE INDEX IF NOT EXISTS ix_signals_dedupe ON signals (dedupe_hash)')
    for name, table, old, _new in REORDERED_INDEXES:
        op.execute(f'DROP INDEX IF EXISTS {name}')
        op.execute(f'CREATE INDEX {name} ON {table} ({old})')
    for name, _table, _columns in NEW_INDEXES:
        op.execute(f'DROP INDEX IF EXISTS {name}')

    op.alter_column('posts', 'content_text', existing_type=sa.Text(), type_=sa.String(), existing_nullable=True)
    op.alter_column('users', 'is_anonymous', existing_type=sa.Boolean(), nullable=True, server_default=None)
    op.alter_column('posts', 'boost_score', existing_type=sa.Integer(), nullable=True, server_default=None)

    _replace_foreign_keys(with_on_delete=False)
