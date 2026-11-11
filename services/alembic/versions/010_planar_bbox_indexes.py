"""Indexes for bounding-box filters

Bounding boxes are compared on geometry (a planar lng/lat box), because a
geography envelope treats its edges as great-circle arcs. The GiST indexes on
the geography columns cannot serve that comparison, so every map and feed
query with a box scanned its whole table: about 150 ms on 200,000 rows, against
0.2 ms with an index on the geometry form of the column.

Revision ID: 010_planar_bbox_indexes
Revises: 009_follows_notifications
"""
from typing import Sequence, Union

from alembic import op

revision: str = '010_planar_bbox_indexes'
down_revision: Union[str, Sequence[str], None] = '009_follows_notifications'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (index, table, column)
INDEXES = (
    ('ix_locations_point_planar', 'locations', 'point'),
    ('ix_signals_geom_planar', 'signals', 'geom'),
    ('ix_dropzones_center_planar', 'dropzones', 'center_point'),
)


def upgrade() -> None:
    for name, table, column in INDEXES:
        op.execute(f'CREATE INDEX IF NOT EXISTS {name} ON {table} USING gist (({column}::geometry))')


def downgrade() -> None:
    for name, _table, _column in INDEXES:
        op.execute(f'DROP INDEX IF EXISTS {name}')
