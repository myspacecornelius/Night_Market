"""Drops, stores, the drop importer and the demo seed against a migrated PostGIS database."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import inspect, text

from services.admin.drop_importer import DropImporter, generate_demo_data, seed_demo_data
from services.models.drop import Drop, DropStore, Store
from services.models.dropzone import DropZone, DropZoneCheckIn, DropZoneMember
from services.models.laces import LacesLedger
from services.models.like import Like
from services.models.post import Post
from services.models.release import Release
from services.models.save import Save
from services.models.session import UserSession
from services.models.signal import Signal
from services.models.subscription import Subscription
from services.models.user import User

BOSTON = (42.3505, -71.0759)
NEW_YORK = (40.7235, -74.0027)


def _unique(prefix):
    return f"{prefix} {uuid.uuid4().hex[:8]}"


def _drop_payload(**overrides):
    payload = {"brand": "Nike", "name": _unique("Dunk Low"), "retail_price": 110.0, "regions": ["US"]}
    payload.update(overrides)
    return payload


def _store_payload(**overrides):
    payload = {
        "name": "Nike Boston",
        "slug": f"nike-boston-{uuid.uuid4().hex[:8]}",
        "latitude": BOSTON[0],
        "longitude": BOSTON[1],
        "city": "Boston",
        "state": "MA",
        "retailer_type": "NIKE",
    }
    payload.update(overrides)
    return payload


def _rejected(response):
    """The inputs request validation turned down, e.g. {("query", "status")}.

    A 422 whose detail is plain text comes from the database error handler: the
    value was not checked and went all the way to PostgreSQL.
    """
    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    assert isinstance(detail, list), f"rejected by the database, not by validation: {detail!r}"
    return {tuple(error["loc"]) for error in detail}


@pytest.fixture
def admin_headers(make_user, auth_headers):
    return auth_headers(make_user(is_admin=True))


@pytest.fixture
def database_time_zone(db_session):
    """Give the test's database session a time zone, as a deployment's setting would.

    PostgreSQL reads a timestamp without an offset, and returns every timestamptz,
    in the session's time zone, so on a UTC database a missing "this is UTC" goes
    unnoticed. The setting is undone when the test's transaction is rolled back.
    """
    def _set(name):
        db_session.execute(text("SELECT set_config('TimeZone', :name, true)"), {"name": name})
        db_session.commit()  # release the savepoint: a later rollback keeps the setting

    return _set


@pytest.fixture
def app_session(db_session):
    """The test session with autoflush off, like the application's SessionLocal."""
    db_session.autoflush = False
    yield db_session
    db_session.autoflush = True


# --- drops with a release date ------------------------------------------------


def test_dated_drops_can_be_created_listed_and_fetched(client, admin_headers):
    brand = _unique("Brand")
    release_at = datetime.now(timezone.utc) + timedelta(days=3, hours=1)

    created = client.post(
        "/v1/drops/", json=_drop_payload(brand=brand, release_at=release_at.isoformat()), headers=admin_headers
    )
    assert created.status_code == 201
    drop = created.json()
    assert datetime.fromisoformat(drop["release_at"]) == release_at
    assert drop["time_until_drop"]["status"] == "upcoming"
    assert drop["time_until_drop"]["days"] == 3

    window = {"from_date": (release_at - timedelta(days=1)).isoformat(), "to_date": (release_at + timedelta(days=1)).isoformat()}
    for params in ({}, {"status": "upcoming"}, {"region": "US"}, window, {"page": 1, "per_page": 5}):
        listed = client.get("/v1/drops/", params={"brand": brand, **params})
        assert listed.status_code == 200, params
        assert [d["id"] for d in listed.json()["drops"]] == [drop["id"]], params

    fetched = client.get(f"/v1/drops/{drop['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["time_until_drop"]["status"] == "upcoming"

    stats = client.get("/v1/drops/stats/overview")
    assert stats.status_code == 200
    assert stats.json()["upcoming_drops"] >= 1


def test_past_and_undated_drops_report_their_own_countdown(client, admin_headers):
    yesterday = datetime.now(timezone.utc) - timedelta(days=1)

    past = client.post("/v1/drops/", json=_drop_payload(release_at=yesterday.isoformat()), headers=admin_headers)
    assert past.status_code == 201
    assert past.json()["time_until_drop"] == {"status": "live_or_past"}
    assert client.get(f"/v1/drops/{past.json()['id']}").json()["time_until_drop"] == {"status": "live_or_past"}

    undated = client.post("/v1/drops/", json=_drop_payload(), headers=admin_headers)
    assert undated.status_code == 201
    assert undated.json()["time_until_drop"] == {"status": "no_date"}


# PostgreSQL would read them as local time: hours later than UTC in one zone, earlier in the other
@pytest.mark.parametrize("time_zone", ["America/Los_Angeles", "Asia/Tokyo"])
def test_release_dates_without_an_offset_are_read_as_utc(client, admin_headers, database_time_zone, time_zone):
    database_time_zone(time_zone)
    payload = _drop_payload(release_at="2031-05-01T10:00:00")
    created = client.post("/v1/drops/", json=payload, headers=admin_headers)

    assert created.status_code == 201
    assert datetime.fromisoformat(created.json()["release_at"]) == datetime(2031, 5, 1, 10, tzinfo=timezone.utc)

    listed = client.get("/v1/drops/", params={"from_date": "2031-05-01T09:59:00", "to_date": "2031-05-01T10:01:00"})
    assert listed.status_code == 200
    assert created.json()["id"] in [d["id"] for d in listed.json()["drops"]]

    # the same moment, however it is written, is the same drop
    for same_moment in ("2031-05-01T10:00:00", "2031-05-01T10:00:00Z", "2031-05-01T12:00:00+02:00"):
        duplicate = client.post("/v1/drops/", json={**payload, "release_at": same_moment}, headers=admin_headers)
        assert duplicate.status_code == 409, same_moment


def test_countdown_helpers_accept_aware_naive_and_missing_dates():
    future = datetime.now(timezone.utc) + timedelta(days=2, hours=3)
    past = future - timedelta(days=5)

    assert Drop(release_at=future).get_time_until_drop()["days"] == 2
    assert Drop(release_at=future.replace(tzinfo=None)).get_time_until_drop()["status"] == "upcoming"
    assert Drop(release_at=past).get_time_until_drop() == {"status": "live_or_past"}
    assert Drop().get_time_until_drop() == {"status": "no_date"}

    assert Drop(status="upcoming", release_at=future).is_upcoming() is True
    assert Drop(status="upcoming", release_at=past).is_upcoming() is False
    assert Drop(status="upcoming").is_upcoming() is True


def test_city_calendar_groups_dated_drops_by_week(client, db_session, admin_headers):
    city = _unique("Calendarville")
    store = client.post("/v1/stores/", json=_store_payload(city=city), headers=admin_headers).json()
    release_at = datetime.now(timezone.utc) + timedelta(days=3)
    drop = Drop(brand="Nike", name=_unique("Dunk Low"), release_at=release_at, status="upcoming")
    db_session.add(drop)
    db_session.flush()
    db_session.add(DropStore(drop_id=drop.id, store_id=uuid.UUID(store["id"])))
    db_session.commit()

    response = client.get(f"/v1/drops/calendar/{city}")

    assert response.status_code == 200
    calendar = response.json()
    assert calendar["total_drops"] == 1
    assert len(calendar["calendar"]) == 4
    weeks_with_drops = [week for week in calendar["calendar"] if week["drop_count"]]
    assert len(weeks_with_drops) == 1
    week = weeks_with_drops[0]
    assert [d["id"] for d in week["drops"]] == [str(drop.id)]
    assert week["drops"][0]["store_count"] == 1
    week_start = datetime.fromisoformat(week["week_start"])
    assert week_start <= release_at < week_start + timedelta(days=7)

    in_city = client.get("/v1/drops/", params={"city": city})
    assert in_city.status_code == 200
    assert [d["id"] for d in in_city.json()["drops"]] == [str(drop.id)]


def _this_week_start():
    now = datetime.now(timezone.utc)
    return (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)


def test_city_calendar_puts_the_last_moment_of_a_week_in_that_week(client, db_session, admin_headers):
    city = _unique("Calendarville")
    store = client.post("/v1/stores/", json=_store_payload(city=city), headers=admin_headers).json()
    # Sunday 23:59:59.5 of next week: after the old "week end" of 23:59:59, before Monday
    release_at = _this_week_start() + timedelta(weeks=2) - timedelta(milliseconds=500)
    drop = Drop(brand="Nike", name=_unique("Dunk Low"), release_at=release_at, status="upcoming", retail_price=0)
    db_session.add(drop)
    db_session.flush()
    db_session.add(DropStore(drop_id=drop.id, store_id=uuid.UUID(store["id"])))
    db_session.commit()

    calendar = client.get(f"/v1/drops/calendar/{city}").json()

    assert calendar["total_drops"] == 1
    assert sum(week["drop_count"] for week in calendar["calendar"]) == 1  # used to fall between two weeks
    week = next(week for week in calendar["calendar"] if week["drop_count"])
    assert datetime.fromisoformat(week["week_start"]) + timedelta(weeks=1) - release_at == timedelta(milliseconds=500)
    assert week["drops"][0]["retail_price"] == 0  # free is a price, not a missing one

    listed = client.get("/v1/drops/", params={"city": city}).json()["drops"]
    assert [(d["id"], d["retail_price"]) for d in listed] == [(str(drop.id), 0)]


def test_stats_count_the_last_moment_of_this_week(client, db_session):
    def this_week():
        response = client.get("/v1/drops/stats/overview")
        assert response.status_code == 200
        return response.json()["this_week_drops"]

    before = this_week()
    last_moment = _this_week_start() + timedelta(weeks=1) - timedelta(milliseconds=500)
    first_moment_of_next_week = _this_week_start() + timedelta(weeks=1)
    db_session.add_all([
        Drop(brand="Nike", name=_unique("Dunk Low"), release_at=last_moment),
        Drop(brand="Nike", name=_unique("Dunk Low"), release_at=first_moment_of_next_week),
    ])
    db_session.commit()

    assert this_week() == before + 1


def test_a_failed_response_does_not_leave_a_committed_drop(client, db_session, admin_headers, monkeypatch):
    payload = _drop_payload(release_at=(datetime.now(timezone.utc) + timedelta(days=2)).isoformat())

    def explode(self):
        raise RuntimeError("cannot build the response")

    with monkeypatch.context() as patched:
        patched.setattr(Drop, "get_time_until_drop", explode)
        failed = client.post("/v1/drops/", json=payload, headers=admin_headers)
    assert failed.status_code == 500  # unhandled errors are answered as a JSON 500
    db_session.rollback()  # what get_db does when a request fails

    assert db_session.query(Drop).filter(Drop.name == payload["name"]).count() == 0
    retried = client.post("/v1/drops/", json=payload, headers=admin_headers)
    assert retried.status_code == 201  # not a 409 against a half-created drop


# --- store coordinates and proximity ------------------------------------------


def test_store_coordinates_survive_a_round_trip(client, admin_headers):
    city = _unique("Roundtrip")

    created = client.post("/v1/stores/", json=_store_payload(city=city), headers=admin_headers)
    assert created.status_code == 201
    store = created.json()
    assert (store["latitude"], store["longitude"]) == pytest.approx(BOSTON)

    fetched = client.get(f"/v1/stores/{store['id']}")
    assert fetched.status_code == 200
    assert (fetched.json()["latitude"], fetched.json()["longitude"]) == pytest.approx(BOSTON)

    listed = client.get("/v1/stores/", params={"city": city})
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert [(s["id"], s["latitude"], s["longitude"]) for s in listed.json()["stores"]] == [
        (store["id"], pytest.approx(BOSTON[0]), pytest.approx(BOSTON[1]))
    ]


def test_stores_near_a_city_are_returned_as_geojson_points(client, admin_headers):
    city = _unique("Geojson")
    store = client.post("/v1/stores/", json=_store_payload(city=city), headers=admin_headers).json()

    response = client.get(f"/v1/stores/near/{city}")

    assert response.status_code == 200
    collection = response.json()
    assert collection["store_count"] == 1
    feature = collection["features"][0]
    assert feature["properties"]["id"] == store["id"]
    assert feature["geometry"] == {"type": "Point", "coordinates": [pytest.approx(BOSTON[1]), pytest.approx(BOSTON[0])]}


def test_proximity_search_filters_by_real_distance(client, admin_headers):
    tag = uuid.uuid4().hex[:8]

    def add(name, lat, lng):
        payload = _store_payload(name=name, city=f"{name} {tag}", latitude=lat, longitude=lng)
        assert client.post("/v1/stores/", json=payload, headers=admin_headers).status_code == 201

    add("Boston", *BOSTON)
    add("New York", *NEW_YORK)
    add("Same Longitude", 10.0, BOSTON[1])  # a longitude-only box used to let this through

    def near(**params):
        response = client.get("/v1/stores/", params={"city": tag, **params})
        assert response.status_code == 200, response.text
        assert response.json()["total"] == len(response.json()["stores"])
        return {store["name"] for store in response.json()["stores"]}

    assert near(near_lat=42.35, near_lng=-71.07, radius_km=5) == {"Boston"}
    assert near(near_lat=42.35, near_lng=-71.07, radius_km=400) == {"Boston", "New York"}
    assert near(near_lat=42.35, near_lng=-71.07) == {"Boston"}  # default radius
    assert near(near_lat=10.0, near_lng=-71.07, radius_km=5) == {"Same Longitude"}
    assert near(near_lat=0, near_lng=0, radius_km=5) == set()  # used to divide by zero
    assert near() == {"Boston", "New York", "Same Longitude"}

    assert client.get("/v1/stores/", params={"near_lat": 42.35}).status_code == 400
    assert client.get("/v1/stores/", params={"near_lng": -71.07}).status_code == 400
    bad_values = (
        {"radius_km": 0}, {"radius_km": -1}, {"radius_km": 500.01}, {"near_lat": 91}, {"near_lng": -181}, {"near_lat": "nan"},
    )
    for bad in bad_values:
        params = {"near_lat": 42.35, "near_lng": -71.07, **bad}
        assert _rejected(client.get("/v1/stores/", params=params)) == {("query", field) for field in bad}, bad
    assert client.get("/v1/stores/", params={"near_lat": 42.35, "near_lng": -71.07, "radius_km": 500}).status_code == 200


# --- input validation ---------------------------------------------------------


def test_bad_drop_filters_and_ids_are_client_errors(client, make_user, auth_headers):
    headers = auth_headers(make_user())
    missing = uuid.uuid4()

    assert _rejected(client.get("/v1/drops/", params={"status": "bogus"})) == {("query", "status")}
    assert _rejected(client.get("/v1/drops/", params={"status": "LIVE"})) == {("query", "status")}
    assert client.get("/v1/drops/", params={"status": "sold_out"}).status_code == 200
    # an OFFSET PostgreSQL cannot hold is turned down here, not by the database
    for page in (0, 100_001, 10**19):
        assert _rejected(client.get("/v1/drops/", params={"page": page})) == {("query", "page")}, page
    assert client.get("/v1/drops/", params={"page": 100_000, "per_page": 100}).json()["drops"] == []
    assert _rejected(client.get("/v1/drops/not-a-uuid")) == {("path", "drop_id")}
    assert client.get(f"/v1/drops/{missing}").status_code == 404
    assert _rejected(client.post("/v1/drops/not-a-uuid/interest", headers=headers)) == {("path", "drop_id")}
    assert client.post(f"/v1/drops/{missing}/interest", headers=headers).status_code == 404


@pytest.mark.parametrize("bad", [
    {"retail_price": -5},
    {"retail_price": 1e9},  # does not fit numeric(10, 2)
    {"brand": ""},
    {"brand": "   "},
    {"brand": "x" * 101},
    {"name": ""},
    {"name": " \t "},
    {"name": "x" * 201},
    {"sku": "x" * 101},
    {"image_url": "https://example.com/" + "x" * 500},
    {"release_type": "x" * 51},
])
def test_drop_create_rejects_bad_values_before_the_database(client, db_session, admin_headers, bad):
    payload = _drop_payload(**bad)

    response = client.post("/v1/drops/", json=payload, headers=admin_headers)

    assert _rejected(response) == {("body", field) for field in bad}
    assert db_session.query(Drop).filter(Drop.brand == payload["brand"], Drop.name == payload["name"]).count() == 0


@pytest.mark.parametrize("release_at", [
    "9999-12-31T23:59:59-10:00",  # no UTC equivalent: PostgreSQL would store year 10000
    "0001-01-01T00:00:00+10:00",  # ... and 1 BC
    "0001-01-01T00:00:00Z",  # readable on a UTC database only: 1 BC in Los Angeles
    "9999-12-31T23:59:59Z",  # ... and year 10000 in Tokyo
    "0001-12-31T23:59:59Z",
    "9999-01-01T00:00:00Z",
])
def test_drop_create_rejects_a_release_date_that_could_not_be_read_back(client, db_session, admin_headers, release_at):
    payload = _drop_payload(release_at=release_at)

    response = client.post("/v1/drops/", json=payload, headers=admin_headers)

    assert _rejected(response) == {("body", "release_at")}
    assert db_session.query(Drop.id).filter(Drop.name == payload["name"]).count() == 0


@pytest.mark.parametrize("time_zone", ["UTC", "America/Los_Angeles", "Asia/Tokyo", "Pacific/Kiritimati"])
def test_drop_create_accepts_the_widest_range_of_dates_any_time_zone_can_read_back(
    client, admin_headers, database_time_zone, time_zone
):
    database_time_zone(time_zone)

    for release_at in ("0002-01-01T00:00:00Z", "9998-12-31T23:59:59Z"):
        brand = _unique("Brand")
        created = client.post("/v1/drops/", json=_drop_payload(brand=brand, release_at=release_at), headers=admin_headers)
        assert created.status_code == 201, release_at
        fetched = client.get(f"/v1/drops/{created.json()['id']}")
        assert fetched.status_code == 200, release_at
        window = {"from_date": "0001-01-01T00:00:00Z", "to_date": "9999-12-31T23:59:59Z"}
        listed = client.get("/v1/drops/", params={"brand": brand, **window})
        assert [d["id"] for d in listed.json()["drops"]] == [created.json()["id"]], release_at
        if time_zone == "UTC":
            assert fetched.json()["release_at"] == release_at


def test_drop_create_requires_an_admin_and_keeps_a_zero_price(client, make_user, auth_headers, admin_headers):
    assert client.post("/v1/drops/", json=_drop_payload(), headers=auth_headers(make_user())).status_code == 403

    brand = _unique("Brand")
    free = client.post("/v1/drops/", json=_drop_payload(brand=brand, retail_price=0), headers=admin_headers)
    assert free.status_code == 201
    assert free.json()["retail_price"] == 0
    assert client.get(f"/v1/drops/{free.json()['id']}").json()["retail_price"] == 0
    listed = client.get("/v1/drops/", params={"brand": brand}).json()["drops"]
    assert [(d["id"], d["retail_price"]) for d in listed] == [(free.json()["id"], 0)]


def test_names_are_stored_without_surrounding_whitespace(client, admin_headers):
    name = _unique("Dunk Low")
    drop = client.post("/v1/drops/", json=_drop_payload(brand=" Nike ", name=f"  {name}\n"), headers=admin_headers)
    assert drop.status_code == 201
    assert (drop.json()["brand"], drop.json()["name"]) == ("Nike", name)
    assert client.post("/v1/drops/", json=_drop_payload(brand="Nike", name=name), headers=admin_headers).status_code == 409

    slug = f"nike-boston-{uuid.uuid4().hex[:8]}"
    payload = _store_payload(name=" Nike Boston ", slug=f" {slug} ", city=" Boston ", country=" US ")
    store = client.post("/v1/stores/", json=payload, headers=admin_headers)
    assert store.status_code == 201
    assert [store.json()[field] for field in ("name", "slug", "city", "country")] == ["Nike Boston", slug, "Boston", "US"]
    assert client.post("/v1/stores/", json=_store_payload(slug=slug), headers=admin_headers).status_code == 409


def test_bad_store_filters_and_ids_are_client_errors(client):
    assert _rejected(client.get("/v1/stores/", params={"retailer_type": "KITH"})) == {("query", "retailer_type")}
    assert client.get("/v1/stores/", params={"retailer_type": "NIKE"}).status_code == 200
    for page in (0, 100_001, 10**19):
        assert _rejected(client.get("/v1/stores/", params={"page": page})) == {("query", "page")}, page
    assert client.get("/v1/stores/", params={"page": 100_000, "per_page": 100}).json()["stores"] == []
    assert _rejected(client.get("/v1/stores/nike-boston")) == {("path", "store_id")}
    assert client.get(f"/v1/stores/{uuid.uuid4()}").status_code == 404


@pytest.mark.parametrize("bad", [
    {"latitude": 999, "longitude": -999},  # used to be stored as POINT(81 -81)
    {"latitude": 90.1},
    {"longitude": 180.5},
    {"phone": "+1 (617) 555-0100 ext. 12345"},
    {"name": ""},
    {"name": "   "},
    {"name": "x" * 201},
    {"slug": ""},
    {"slug": "  "},
    {"slug": "x" * 101},
    {"city": ""},
    {"city": " \n"},
    {"city": "x" * 101},
    {"state": "x" * 51},
    {"country": ""},
    {"country": "  "},
    {"country": "x" * 51},
    {"postal_code": "x" * 21},
    {"website_url": "https://example.com/" + "x" * 500},
    {"retailer_type": "KITH"},
])
def test_store_create_rejects_bad_values_before_the_database(client, db_session, admin_headers, bad):
    payload = _store_payload(**bad)

    response = client.post("/v1/stores/", json=payload, headers=admin_headers)

    assert _rejected(response) == {("body", field) for field in bad}
    assert db_session.query(Store).filter(Store.slug == payload["slug"]).count() == 0


def test_store_create_accepts_the_edges_of_the_coordinate_range(client, admin_headers):
    created = client.post("/v1/stores/", json=_store_payload(latitude=-90, longitude=180), headers=admin_headers)

    assert created.status_code == 201
    fetched = client.get(f"/v1/stores/{created.json()['id']}").json()
    assert (fetched["latitude"], fetched["longitude"]) == (-90, 180)


# --- drop importer and the sprint 1 seed --------------------------------------


def test_importer_links_drops_to_stores_on_the_first_run(client, app_session):
    data = generate_demo_data()
    drop_names = [drop["name"] for drop in data["drops"]]

    def link_count():
        return app_session.query(DropStore).join(Drop, Drop.id == DropStore.drop_id).filter(Drop.name.in_(drop_names)).count()

    first = DropImporter(app_session).import_from_dict(data)
    assert first["success"] is True and first["errors"] == []
    assert (first["imported_stores"], first["imported_drops"]) == (8, 7)
    assert link_count() == 32
    assert first["linked_drop_stores"] == len(data["drop_stores"]) == 32

    # Five Nike/Jordan drops at Nike Boston, plus the featured Adidas one at the boutique
    in_boston = client.get("/v1/drops/", params={"city": "Boston", "per_page": 100}).json()
    ours = [drop for drop in in_boston["drops"] if drop["name"] in drop_names]
    assert len(ours) == 6
    assert all(drop["store_count"] >= 4 for drop in ours)
    assert in_boston["total"] == len(in_boston["drops"])  # a drop at two Boston stores counts once
    calendar = client.get("/v1/drops/calendar/Boston").json()
    assert calendar["total_drops"] == 6
    assert sum(week["drop_count"] for week in calendar["calendar"]) in (5, 6)  # the last one can fall after week 4

    nike_boston = client.get("/v1/stores/", params={"city": "Boston", "retailer_type": "NIKE"}).json()["stores"]
    assert [(s["slug"], s["latitude"], s["longitude"]) for s in nike_boston if s["slug"] == "nike-boston"] == [
        ("nike-boston", pytest.approx(42.3505), pytest.approx(-71.0759))
    ]

    second = DropImporter(app_session).import_from_dict(data)
    assert second["success"] is True and second["errors"] == []
    assert (second["imported_stores"], second["imported_drops"], second["linked_drop_stores"]) == (0, 0, 0)
    assert link_count() == 32


def test_sprint1_seed_links_drops_to_stores_on_a_fresh_database(app_session, monkeypatch):
    monkeypatch.setattr("services.admin.drop_importer.SessionLocal", lambda: app_session)

    result = seed_demo_data()

    assert result["success"] is True and result["errors"] == []
    assert (app_session.query(Store).count(), app_session.query(Drop).count()) == (8, 7)
    assert app_session.query(DropStore).count() == 32
    assert result["linked_drop_stores"] == 32


def test_importer_reports_links_it_cannot_resolve(app_session):
    data = {
        "stores": [_store_payload(slug="importer-known-store")],
        "drops": [{"brand": "Nike", "name": "Importer Known Drop"}],
        "drop_stores": [
            {"drop_name": "Importer Known Drop", "store_slug": "importer-known-store"},
            {"drop_name": "Importer Missing Drop", "store_slug": "importer-known-store"},
            {"drop_name": "Importer Known Drop", "store_slug": "importer-missing-store"},
        ],
    }

    result = DropImporter(app_session).import_from_dict(data)

    assert len(result["errors"]) == 2  # used to be skipped without a word
    assert "Importer Missing Drop" in result["errors"][0] and "drop not found" in result["errors"][0]
    assert "importer-missing-store" in result["errors"][1] and "store not found" in result["errors"][1]
    assert app_session.query(DropStore).count() == 1
    assert result["linked_drop_stores"] == 1


def test_importer_skips_bad_rows_without_losing_the_good_ones(app_session):
    data = {
        "stores": [
            _store_payload(slug="importer-good-store"),
            _store_payload(slug="importer-off-the-map", latitude=999, longitude=-999),
            _store_payload(slug="importer-bad-retailer", retailer_type="KITH"),
            "not-a-store",  # used to abort the whole import, good rows included
            _store_payload(slug="importer-other-good-store"),
        ],
        "drops": [
            {"brand": "Nike", "name": "Importer Good Drop", "release_at": "2031-05-01T10:00:00Z"},
            {"brand": "Nike", "name": "Importer Negative Price", "retail_price": -5},
            # PostgreSQL would store year 10000, and no list of drops could be read again
            {"brand": "Nike", "name": "Importer Year 10000", "release_at": "9999-12-31T23:59:59-10:00"},
            {"brand": "Nike", "name": "Importer Year 9999", "release_at": "9999-12-31T23:59:59Z"},
            {"brand": "Nike", "name": "Importer Not A Date", "release_at": "next tuesday"},
            None,
            {"brand": "Nike", "name": "Importer Other Good Drop"},
        ],
        "drop_stores": [
            {"drop_name": "Importer Good Drop", "store_slug": "importer-good-store"},
            ["Importer Good Drop", "importer-other-good-store"],
            {"drop_name": "Importer Other Good Drop", "store_slug": "importer-other-good-store"},
        ],
    }

    result = DropImporter(app_session).import_from_dict(data)

    assert result["success"] is True
    assert (result["imported_stores"], result["imported_drops"], result["linked_drop_stores"]) == (2, 2, 2)
    assert len(result["errors"]) == 3 + 5 + 1
    for row in ("Nike Boston", "'not-a-store'", "Importer Year 10000", "Importer Year 9999", "Importer Not A Date", "None"):
        assert any(row in error for error in result["errors"]), row
    slugs = {slug for (slug,) in app_session.query(Store.slug).filter(Store.slug.like("importer-%"))}
    assert slugs == {"importer-good-store", "importer-other-good-store"}
    names = {name for (name,) in app_session.query(Drop.name).filter(Drop.name.like("Importer %"))}
    assert names == {"Importer Good Drop", "Importer Other Good Drop"}


def test_importer_reads_release_dates_without_an_offset_as_utc(app_session, database_time_zone):
    database_time_zone("America/Los_Angeles")  # PostgreSQL would read them as Pacific time
    naive = {"brand": "Nike", "name": "Importer Naive Date", "release_at": "2031-05-01T10:00:00"}

    assert DropImporter(app_session).import_from_dict({"drops": [naive]})["imported_drops"] == 1

    app_session.expire_all()
    stored = app_session.query(Drop.release_at).filter(Drop.name == "Importer Naive Date").scalar()
    assert stored == datetime(2031, 5, 1, 10, tzinfo=timezone.utc)
    # the same moment written with its offset, or as a datetime, is the same drop
    for same_moment in ("2031-05-01T10:00:00Z", "2031-05-01T12:00:00+02:00", datetime(2031, 5, 1, 10)):
        again = DropImporter(app_session).import_from_dict({"drops": [{**naive, "release_at": same_moment}]})
        assert (again["imported_drops"], again["errors"]) == (0, []), same_moment


@pytest.mark.parametrize("result, exit_code", [
    ({"success": True, "imported_stores": 8, "imported_drops": 7, "linked_drop_stores": 32, "errors": []}, None),
    ({"success": True, "imported_stores": 8, "imported_drops": 6, "linked_drop_stores": 28,
      "errors": ["Error importing drop Dunk Low: boom"]}, 1),
    ({"success": False, "error": "connection refused", "errors": []}, 1),
])
def test_sprint1_seed_command_fails_when_anything_was_not_imported(monkeypatch, capsys, result, exit_code):
    from services import seed_sprint1

    monkeypatch.setattr(seed_sprint1, "seed_demo_data", lambda: result)

    if exit_code is None:
        seed_sprint1.main()
    else:
        with pytest.raises(SystemExit) as stopped:
            seed_sprint1.main()
        assert stopped.value.code == exit_code
        assert (result.get("error") or result["errors"][0]) in capsys.readouterr().out


def test_importer_survives_a_row_whose_lookup_fails(app_session):
    # A number where a string belongs makes the duplicate check itself fail in
    # the database, which used to abort the transaction for every later row
    data = {
        "stores": [
            _store_payload(slug="importer-first-store"),
            _store_payload(slug=550, name="Importer Numeric Slug"),
            _store_payload(slug="importer-last-store"),
        ],
        "drops": [
            {"brand": "Nike", "name": "Importer First Drop"},
            {"brand": "New Balance", "name": 550},
            {"brand": "Nike", "name": "Importer Last Drop"},
        ],
        "drop_stores": [
            {"drop_name": "Importer First Drop", "store_slug": "importer-first-store"},
            {"drop_name": 550, "store_slug": "importer-first-store"},
            {"drop_name": "Importer Last Drop", "store_slug": "importer-last-store"},
        ],
    }

    result = DropImporter(app_session).import_from_dict(data)

    assert result["success"] is True
    assert len(result["errors"]) == 3
    assert (result["imported_stores"], result["imported_drops"], result["linked_drop_stores"]) == (2, 2, 2)
    slugs = {slug for (slug,) in app_session.query(Store.slug).filter(Store.slug.like("importer-%"))}
    assert slugs == {"importer-first-store", "importer-last-store"}
    names = {name for (name,) in app_session.query(Drop.name).filter(Drop.name.like("Importer %"))}
    assert names == {"Importer First Drop", "Importer Last Drop"}
    linked = app_session.query(DropStore).join(Drop, Drop.id == DropStore.drop_id).filter(Drop.name.in_(names)).count()
    assert linked == 2


# --- demo seed ----------------------------------------------------------------


@pytest.fixture
def seed_env(db_session, monkeypatch):
    """Point services.seed at the test transaction and keep the demo small."""
    from services import seed

    monkeypatch.setattr(seed, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(seed, "get_password_hash", lambda password: "not-a-real-hash")  # bcrypt is slow
    monkeypatch.setenv("AUTO_SEED_DATA", "true")
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.delenv("SEED_RESET", raising=False)
    monkeypatch.delenv("SEED_ALLOW_PRODUCTION", raising=False)
    monkeypatch.setenv("DEMO_USERS_COUNT", "5")
    monkeypatch.setenv("DEMO_POSTS_COUNT", "6")
    monkeypatch.setenv("DEMO_RELEASES_COUNT", "2")
    return seed


def _user_with_a_dropzone(client, make_user, auth_headers):
    """A user who owns a dropzone, as (user id, headers, dropzone id).

    The seed closes the session it is given, so no ORM object is handed back.
    """
    owner = make_user()
    headers = auth_headers(owner)
    zone = client.post("/v1/dropzones", json={"name": "Newbury St", "center_lat": 42.36, "center_lng": -71.06}, headers=headers)
    assert zone.status_code == 200
    return owner.user_id, headers, zone.json()["id"]


def test_seed_fills_an_empty_database(seed_env, db_session):
    assert db_session.query(User).count() == 0

    seed_env.seed_data()

    assert db_session.query(User).count() == 5
    assert db_session.query(Release).count() == 2


def test_seed_can_be_rerun_once_app_data_references_its_users(seed_env, client, db_session, make_user, auth_headers, monkeypatch):
    owner_id, _, _ = _user_with_a_dropzone(client, make_user, auth_headers)
    monkeypatch.setenv("SEED_RESET", "true")

    seed_env.seed_data()  # used to fail on dropzones_owner_id_fkey

    assert db_session.query(User).filter(User.user_id == owner_id).count() == 0
    assert db_session.query(DropZone).count() == 0
    assert db_session.query(User).count() == 5


def test_seed_reset_clears_every_kind_of_row_that_references_a_user_or_post(
    seed_env, client, db_session, make_user, auth_headers, monkeypatch
):
    owner_id, headers, zone_id = _user_with_a_dropzone(client, make_user, auth_headers)
    assert client.post(f"/v1/dropzones/{zone_id}/checkin", json={"lat": 42.3601, "lng": -71.0601}, headers=headers).status_code == 200
    post = client.post(
        "/v1/hyperlocal/signals", json={"content_text": "restock", "geo_tag_lat": 42.36, "geo_tag_long": -71.06}, headers=headers
    )
    assert post.status_code == 200
    post_id = uuid.UUID(post.json()["post_id"])
    release = Release(sneaker_name="Dunk Low", brand="Nike", release_date=datetime.now(timezone.utc), retail_price=110)
    db_session.add(release)
    db_session.flush()
    db_session.add_all([
        Like(user_id=owner_id, post_id=post_id),
        Save(user_id=owner_id, post_id=post_id),
        Subscription(user_id=owner_id, release_id=release.release_id),
        LacesLedger(user_id=owner_id, amount=5, transaction_type="POST_REWARD", related_post_id=post_id),
        UserSession(user_id=owner_id, refresh_token_hash=uuid.uuid4().hex, expires_at=datetime.now(timezone.utc) + timedelta(days=1)),
        DropZoneMember(dropzone_id=uuid.UUID(zone_id), user_id=make_user().user_id),
        Signal(user_id=owner_id, geom="SRID=4326;POINT(-71.06 42.36)", geohash="drt2zp", signal_type="GENERAL"),
    ])
    db_session.commit()
    leftovers = (Like, Save, Subscription, UserSession, Signal, DropZoneCheckIn, DropZoneMember, DropZone)
    assert all(db_session.query(model).count() for model in leftovers)
    monkeypatch.setenv("SEED_RESET", "true")

    seed_env.seed_data()

    assert {model.__tablename__: db_session.query(model).count() for model in leftovers} == {
        model.__tablename__: 0 for model in leftovers
    }
    assert db_session.query(Post).filter(Post.post_id == post_id).count() == 0
    assert (db_session.query(User).count(), db_session.query(Release).count()) == (5, 2)


def test_seed_does_not_wipe_existing_data_unless_asked(seed_env, db_session, make_user):
    user_id = make_user().user_id

    with pytest.raises(RuntimeError, match="--reset") as refused:
        seed_env.seed_data()  # used to delete every user, post and release without asking

    assert isinstance(refused.value, seed_env.SeedRefused)
    assert [found for (found,) in db_session.query(User.user_id)] == [user_id]  # kept, and nothing seeded on top


def _set_environment(monkeypatch, environment):
    if environment is None:
        monkeypatch.delenv("ENVIRONMENT", raising=False)
    else:
        monkeypatch.setenv("ENVIRONMENT", environment)


# Like the rest of the application, anything that is not explicitly a development
# environment counts as production: unset, empty (docker compose without the
# variable in .env) or a name the application does not know
NOT_DEVELOPMENT = ["production", "Production", "prod", "staging", "live", "", None]


@pytest.mark.parametrize("environment", NOT_DEVELOPMENT)
def test_seed_never_wipes_data_outside_development(seed_env, db_session, make_user, monkeypatch, environment):
    user_id = make_user().user_id
    _set_environment(monkeypatch, environment)
    monkeypatch.setenv("SEED_RESET", "true")
    monkeypatch.setenv("SEED_ALLOW_PRODUCTION", "true")

    with pytest.raises(RuntimeError, match="never deletes data outside development") as refused:
        seed_env.seed_data(reset=True, allow_production=True)

    assert isinstance(refused.value, seed_env.SeedRefused)
    assert [found for (found,) in db_session.query(User.user_id)] == [user_id]
    assert seed_env.main(["--reset", "--allow-production"]) == 1
    assert [found for (found,) in db_session.query(User.user_id)] == [user_id]


@pytest.mark.parametrize("environment", ["development", "Dev", "local", "test", " testing ", "ci"])
def test_seed_resets_in_every_development_environment(seed_env, db_session, make_user, monkeypatch, environment):
    user_id = make_user().user_id
    monkeypatch.setenv("ENVIRONMENT", environment)

    seed_env.seed_data(reset=True)

    assert db_session.query(User).filter(User.user_id == user_id).count() == 0
    assert db_session.query(User).count() == 5


@pytest.mark.parametrize("environment", NOT_DEVELOPMENT)
def test_seed_creates_no_demo_accounts_outside_development_unless_told_to(seed_env, db_session, monkeypatch, capsys, environment):
    # every demo account has the same published password
    _set_environment(monkeypatch, environment)

    with pytest.raises(RuntimeError, match="--allow-production") as refused:
        seed_env.seed_data()
    assert isinstance(refused.value, seed_env.SeedRefused)
    assert seed_env.main([]) == 1
    assert "--allow-production" in capsys.readouterr().err
    assert db_session.query(User).count() == 0

    assert seed_env.main(["--allow-production"]) == 0
    assert db_session.query(User).count() == 5


def test_seed_outside_development_can_be_allowed_by_the_environment(seed_env, db_session, monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "staging")
    monkeypatch.setenv("SEED_ALLOW_PRODUCTION", "true")

    seed_env.seed_data()

    assert db_session.query(User).count() == 5


def test_seed_command_refuses_with_a_reason_and_resets_on_request(seed_env, db_session, make_user, capsys):
    user_id = make_user().user_id

    assert seed_env.main([]) == 1
    assert "--reset" in capsys.readouterr().err
    assert [found for (found,) in db_session.query(User.user_id)] == [user_id]

    assert seed_env.main(["--reset"]) == 0
    assert db_session.query(User).filter(User.user_id == user_id).count() == 0
    assert db_session.query(User).count() == 5


def test_seed_wipe_order_covers_every_table_that_would_block_the_reset(seed_env, db_session):
    inspector = inspect(db_session.connection())
    wiped = [model.__tablename__ for model in seed_env.WIPE_ORDER]
    checked = set()

    for table in inspector.get_table_names():
        for foreign_key in inspector.get_foreign_keys(table):
            parent = foreign_key["referred_table"]
            if parent not in wiped or parent == table:
                continue
            on_delete = (foreign_key.get("options", {}).get("ondelete") or "NO ACTION").upper()
            if table not in wiped and on_delete in ("CASCADE", "SET NULL", "SET DEFAULT"):
                continue  # the database removes or detaches these rows itself
            checked.add((table, parent))
            assert table in wiped, f"{table} references {parent} (ON DELETE {on_delete}) and would block the reset"
            assert wiped.index(table) < wiped.index(parent), f"{table} must be cleared before {parent}"

    assert {("likes", "posts"), ("dropzones", "users"), ("posts", "locations")} <= checked  # the schema was really read
