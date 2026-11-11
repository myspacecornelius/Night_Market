"""The migrations and the ORM models must describe the same database."""
import os
import subprocess
import sys
import uuid
from pathlib import Path

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from alembic.config import Config
from sqlalchemy import CheckConstraint, create_engine, text

from services.core.schema_compare import include_object_filter
from services.models import Base

# Differences that are known and deliberate. Keep this list short and explained.
ALLOWED = {
    # GIN index on signals.tags created by migration 002; useful, but not declared on the model.
    ("remove_index", "ix_signals_tags"),
    # Declared as a GIN index on lower(name), which PostgreSQL cannot build without pg_trgm.
    ("add_index", "ix_drops_name_search"),
}


def _describe(diff):
    kind, subject = diff[0], diff[1]
    if kind in ("add_index", "remove_index", "add_constraint", "remove_constraint"):
        return kind, subject.name
    if kind in ("add_fk", "remove_fk"):
        columns = ",".join(column.name for column in subject.columns)
        return kind, f"{subject.table.name}({columns})->{subject.referred_table.name} ondelete={subject.ondelete}"
    if kind in ("add_table", "remove_table"):
        return kind, subject.name
    if kind in ("add_column", "remove_column"):
        return kind, f"{diff[2]}.{diff[3].name}"
    return kind, f"{diff[2]}.{diff[3]}"  # modify_nullable / modify_type / ...


def _flatten(diffs):
    for diff in diffs:
        if isinstance(diff, list):
            yield from _flatten(diff)
        else:
            yield diff


def test_models_match_the_migrated_schema(migrated_db):
    with migrated_db.connect() as connection:
        # PostGIS's own tables (spatial_ref_sys; tiger and topology in the postgis image) are not ours
        context = MigrationContext.configure(
            connection, opts={"include_object": include_object_filter(connection), "compare_type": True}
        )
        found = {_describe(diff) for diff in _flatten(compare_metadata(context, Base.metadata))}

    unexpected = sorted(found - ALLOWED)
    assert not unexpected, (
        "Models and migrations disagree. Add a migration (or fix the model) for:\n  "
        + "\n  ".join(f"{kind}: {what}" for kind, what in unexpected)
    )


def test_model_check_constraints_exist_in_the_database(migrated_db):
    with migrated_db.connect() as connection:
        definitions = {
            row[0]: row[1].replace(" ", "")
            for row in connection.execute(
                text(
                    "SELECT conrelid::regclass::text || '.' || conname, pg_get_constraintdef(oid) "
                    "FROM pg_constraint WHERE contype = 'c'"
                )
            )
        }
    by_table = {}
    for name, definition in definitions.items():
        by_table.setdefault(name.split(".")[0], []).append(definition)

    missing = []
    for table in Base.metadata.tables.values():
        for constraint in table.constraints:
            if not isinstance(constraint, CheckConstraint) or not constraint.name:
                continue
            # the database may hold the same rule under another name (e.g. positive_signal_count_stores)
            column = str(constraint.sqltext).split()[0]
            if f"{table.name}.{constraint.name}" not in definitions and not any(
                column in definition for definition in by_table.get(table.name, [])
            ):
                missing.append(f"{table.name}.{constraint.name}: {constraint.sqltext}")
    assert not missing, "Check constraints declared on models but absent from the database:\n  " + "\n  ".join(missing)


def test_deleting_a_user_cascades_to_their_posts_and_ledger(db_session, make_user):
    from services.models.laces import LacesLedger
    from services.models.post import Post
    from services.models.user import User

    user = make_user()
    other = make_user()
    post = Post(user_id=user.user_id, post_type="GENERAL", content_text="mine")
    db_session.add(post)
    db_session.flush()
    db_session.add(LacesLedger(user_id=user.user_id, amount=5, transaction_type="POST_REWARD"))
    # another user's ledger row that points at the post must survive, detached from it
    db_session.add(LacesLedger(user_id=other.user_id, amount=-10, transaction_type="BOOST_SENT", related_post_id=post.post_id))
    db_session.commit()
    user_id, post_id = user.user_id, post.post_id

    # a plain SQL delete, so only the database's own ON DELETE rules are at work
    db_session.expunge_all()
    db_session.execute(text("DELETE FROM users WHERE user_id = :id"), {"id": user_id})
    db_session.commit()

    assert db_session.query(Post).filter(Post.post_id == post_id).count() == 0
    assert db_session.query(LacesLedger).filter(LacesLedger.user_id == user_id).count() == 0
    survivor = db_session.query(LacesLedger).filter(LacesLedger.user_id == other.user_id).one()
    assert survivor.related_post_id is None
    assert db_session.query(User).filter(User.user_id == other.user_id).count() == 1


def test_database_rejects_zero_amount_ledger_rows(db_session, make_user):
    import pytest
    from sqlalchemy.exc import IntegrityError

    user = make_user()
    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO laces_ledger (id, user_id, amount, transaction_type, balance_after) "
                "VALUES (gen_random_uuid(), :user_id, 0, 'ADMIN_ADD', 0)"
            ),
            {"user_id": user.user_id},
        )
    db_session.rollback()


def test_migrations_build_an_empty_database(migrated_db):
    """`alembic upgrade head`, as the API container runs it, on a database with nothing in it.

    The shared test database is migrated once and reused, so a migration run that
    silently rolls back (or only works on top of an older schema) goes unnoticed there.
    """
    root = Path(__file__).resolve().parent.parent
    name = f"migrate_check_{uuid.uuid4().hex[:12]}"
    url = migrated_db.url.set(database=name)
    admin = create_engine(migrated_db.url, isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as connection:
            connection.execute(text(f'CREATE DATABASE "{name}"'))
        fresh = create_engine(url, isolation_level="AUTOCOMMIT")
        with fresh.connect() as connection:
            connection.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))

        env = {**os.environ, "DATABASE_URL": url.render_as_string(hide_password=False), "PYTHONPATH": str(root)}
        result = subprocess.run(
            [sys.executable, "-W", "ignore", "-m", "alembic", "upgrade", "head"],
            cwd=str(root / "services"), env=env, capture_output=True, text=True, timeout=300,
        )
        assert result.returncode == 0, result.stderr[-2000:]

        config = Config(str(root / "services" / "alembic.ini"))
        config.set_main_option("script_location", str(root / "services" / "alembic"))
        head = ScriptDirectory.from_config(config).get_current_head()
        with fresh.connect() as connection:
            assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar() == head
            tables = set(connection.execute(text(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
            )).scalars())
        fresh.dispose()
        missing = {table.name for table in Base.metadata.tables.values()} - tables
        assert not missing, f"tables the models describe but the migrations did not create: {sorted(missing)}"
    finally:
        with admin.connect() as connection:
            connection.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        admin.dispose()
