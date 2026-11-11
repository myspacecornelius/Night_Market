"""Celery wiring and the services the periodic tasks call."""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from geoalchemy2.elements import WKTElement

from services.models.dropzone import DropZone, DropZoneStatus
from services.models.laces import LacesLedger
from services.models.post import Post


def _zone(db_session, owner, status, starts_at=None, ends_at=None):
    zone = DropZone(
        name="zone", owner_id=owner.user_id, center_point=WKTElement("POINT(-71.06 42.36)", srid=4326),
        radius_meters=100, check_in_radius=50, status=status, starts_at=starts_at, ends_at=ends_at,
        is_public=True, allow_posts=True,
    )
    db_session.add(zone)
    db_session.commit()
    return zone


def test_celery_configuration_loads_and_every_scheduled_task_exists():
    from worker.tasks import app

    schedule = app.conf.beat_schedule  # raises if worker.celeryconfig cannot be imported
    assert {"refresh-heatmap-cache", "manage-dropzone-windows", "daily-laces-stipend"} <= set(schedule)
    for name, entry in schedule.items():
        assert entry["task"] in app.tasks, f"{name} schedules an unregistered task: {entry['task']}"
    # each job is scheduled once (tasks.py used to register the same jobs a second time)
    assert len({entry["task"] for entry in schedule.values()}) == len(schedule)


def test_worker_redis_client_uses_the_configured_url(monkeypatch):
    import importlib

    import worker.tasks

    monkeypatch.setenv("REDIS_URL", "redis://cache.internal:6380/3")
    try:
        reloaded = importlib.reload(worker.tasks)
        options = reloaded.redis_client.connection_pool.connection_kwargs
        assert (options["host"], options["port"], options["db"]) == ("cache.internal", 6380, 3)
    finally:
        monkeypatch.undo()
        importlib.reload(worker.tasks)


def test_daily_stipend_goes_to_recently_active_users_once(db_session, make_user):
    from services.core.laces import distribute_daily_stipends

    poster = make_user(laces_balance=10)
    idle = make_user(laces_balance=10)
    banned = make_user(laces_balance=10)
    already = make_user(laces_balance=10)
    for user in (poster, banned, already):
        db_session.add(Post(user_id=user.user_id, post_type="GENERAL", content_text="hi"))
    db_session.add(Post(
        user_id=idle.user_id, post_type="GENERAL", content_text="old",
        timestamp=datetime.now(timezone.utc) - timedelta(days=30),
    ))
    banned.is_active = False
    db_session.add(LacesLedger(user_id=already.user_id, amount=100, transaction_type="DAILY_STIPEND", balance_after=110))
    db_session.commit()

    assert distribute_daily_stipends(db_session) == 1
    db_session.commit()
    db_session.expire_all()

    assert [user.laces_balance for user in (poster, idle, banned, already)] == [110, 10, 10, 10]
    row = db_session.query(LacesLedger).filter(LacesLedger.user_id == poster.user_id).one()
    assert (row.transaction_type, row.amount, row.balance_after) == ("DAILY_STIPEND", 100, 110)
    assert distribute_daily_stipends(db_session) == 0  # nobody is paid twice


def test_dropzones_open_and_close_on_schedule(db_session, make_user):
    from services.core.dropzones import sync_dropzone_statuses

    owner = make_user()
    now = datetime.now(timezone.utc)
    hour = timedelta(hours=1)
    due = _zone(db_session, owner, DropZoneStatus.SCHEDULED, starts_at=now - hour, ends_at=now + hour)
    upcoming = _zone(db_session, owner, DropZoneStatus.SCHEDULED, starts_at=now + hour)
    over = _zone(db_session, owner, DropZoneStatus.ACTIVE, starts_at=now - 2 * hour, ends_at=now - hour)
    missed = _zone(db_session, owner, DropZoneStatus.SCHEDULED, starts_at=now - 2 * hour, ends_at=now - hour)
    open_ended = _zone(db_session, owner, DropZoneStatus.ACTIVE)
    cancelled = _zone(db_session, owner, DropZoneStatus.CANCELLED, starts_at=now - hour, ends_at=now + hour)

    assert sync_dropzone_statuses(db_session) == {"zones_opened": 1, "zones_closed": 2}
    db_session.commit()
    db_session.expire_all()

    assert [zone.status.value for zone in (due, upcoming, over, missed, open_ended, cancelled)] == [
        "active", "scheduled", "ended", "ended", "active", "cancelled",
    ]
    assert sync_dropzone_statuses(db_session) == {"zones_opened": 0, "zones_closed": 0}


def test_periodic_tasks_run_through_the_services(db_session, make_user, monkeypatch):
    import services.database
    from worker.tasks import cleanup_expired_sessions, daily_laces_stipend, manage_dropzone_windows

    @contextmanager
    def test_scope():
        yield db_session
        db_session.commit()

    monkeypatch.setattr(services.database, "session_scope", test_scope)
    owner = make_user(laces_balance=0)
    db_session.add(Post(user_id=owner.user_id, post_type="GENERAL", content_text="hi"))
    zone = _zone(db_session, owner, DropZoneStatus.SCHEDULED, starts_at=datetime.now(timezone.utc) - timedelta(minutes=1))

    assert daily_laces_stipend.run()["stipends_distributed"] == 1
    assert manage_dropzone_windows.run()["zones_opened"] == 1
    assert cleanup_expired_sessions.run()["sessions_revoked"] == 0
    db_session.expire_all()
    assert owner.laces_balance == 100
    assert zone.status == DropZoneStatus.ACTIVE
