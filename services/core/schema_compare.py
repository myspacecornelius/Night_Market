"""Which database objects belong to this application when comparing schemas.

PostGIS brings its own tables: spatial_ref_sys always, and in the postgis/postgis
image (used by docker compose and CI) the tiger geocoder and topology tables too,
all visible through the database's search_path. They are not described by the
models, so a schema comparison must not report them as tables to drop.
"""
from typing import Callable, FrozenSet

from sqlalchemy import text
from sqlalchemy.engine import Connection


def extension_owned_tables(connection: Connection) -> FrozenSet[str]:
    """Names of the tables and views that were created by an extension."""
    rows = connection.execute(text(
        "SELECT c.relname FROM pg_class c "
        "JOIN pg_depend d ON d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e' "
        "WHERE c.relkind IN ('r', 'p', 'v', 'm')"
    ))
    return frozenset(row[0] for row in rows)


def include_object_filter(connection: Connection) -> Callable:
    """An Alembic ``include_object`` hook that skips tables owned by extensions.

    The lookup runs on first use, not here. Running it while Alembic's environment is
    being configured would begin a transaction on the connection before Alembic begins
    its own; Alembic then treats the transaction as the caller's and never commits, so
    every migration would be rolled back when the connection closes.
    """
    owned = None

    def include_object(obj, name, type_, reflected, compare_to):
        nonlocal owned
        if type_ != "table" or not reflected:
            return True
        if owned is None:
            owned = extension_owned_tables(connection)
        return name not in owned

    return include_object
