"""Signals API: create, list, heatmap, boost and stats against PostGIS."""
import asyncio
import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from services.core.cache import CacheStrategy
from services.core.geohash_utils import GeohashUtils, SignalAggregator
from services.core.redis_client import r as redis_client
from services.models.signal import Signal
from services.models.user import User

# (latitude, longitude)
BOSTON = (42.3601, -71.0589)
BACK_BAY = (42.3503, -71.081)
NYC = (40.7128, -74.006)
LA = (34.0522, -118.2437)
CHICAGO = (41.8781, -87.6298)
MIAMI = (25.7617, -80.1918)
LONDON = (51.5074, -0.1278)
SEVEN_PLACES = [BOSTON, BACK_BAY, NYC, LA, CHICAGO, MIAMI, LONDON]


@pytest.fixture(autouse=True)
def fresh_heatmap_cache():
    """The signal heatmap is cached in Redis: start and finish each test without it."""

    def clear():
        for key in redis_client.scan_iter("*signals:heatmap*"):
            redis_client.delete(key)

    clear()
    yield
    clear()


@pytest.fixture
def make_signal(db_session):
    """Insert a signal row directly, skipping the API's rate limit and duplicate check."""

    def _make_signal(user, place, **fields):
        lat, lng = place
        fields.setdefault("signal_type", "SPOTTED")
        signal = Signal(
            user_id=user.user_id,
            geom=f"SRID=4326;POINT({lng} {lat})",
            geohash=GeohashUtils.encode(lat, lng),
            **fields,
        )
        db_session.add(signal)
        db_session.commit()
        db_session.refresh(signal)
        return signal

    return _make_signal


@pytest.fixture
def seven_signals(make_user, make_signal):
    """Boston x2, NYC, LA, Chicago, Miami and London."""
    user = make_user()
    return [make_signal(user, place) for place in SEVEN_PLACES]


def _create(client, headers, place, **body):
    lat, lng = place
    payload = {"latitude": lat, "longitude": lng, "signal_type": "SPOTTED", **body}
    return client.post("/v1/signals/", json=payload, headers=headers)


def _places(response):
    assert response.status_code == 200
    return sorted((round(s["latitude"], 4), round(s["longitude"], 4)) for s in response.json()["signals"])


# --- listing ------------------------------------------------------------------


def test_list_returns_created_signals_with_their_coordinates(client, make_user, auth_headers):
    headers = auth_headers(make_user())
    assert client.get("/v1/signals/").json()["total"] == 0

    for place, kind in ((BOSTON, "SPOTTED"), (NYC, "LINE_UPDATE"), (LA, "GENERAL")):
        created = _create(client, headers, place, signal_type=kind, text_content=f"seen at {place}")
        assert created.status_code == 201
        assert (created.json()["latitude"], created.json()["longitude"]) == place

    listed = client.get("/v1/signals/")
    assert _places(listed) == sorted([BOSTON, NYC, LA])
    assert listed.json()["total"] == 3

    # Every filter used to fail as soon as one signal existed.
    for query in (
        "bbox=-71.2,42.2,-70.9,42.5",
        "city=boston",
        "signal_type=SPOTTED",
        "brand=nike",
        "tags=restock",
        "time_window=7d",
        "page=1&per_page=2",
    ):
        assert client.get(f"/v1/signals/?{query}").status_code == 200, query


def test_list_filters_by_type_brand_and_tags(client, make_user, make_signal):
    user = make_user()
    make_signal(user, BOSTON, signal_type="DROP_ALERT", brand="Nike", tags=["restock", "dunk"])
    make_signal(user, NYC, signal_type="SPOTTED", brand="Nike SB", tags=["restock"])
    make_signal(user, LA, signal_type="SPOTTED", brand="Adidas")

    assert _places(client.get("/v1/signals/?signal_type=DROP_ALERT")) == [BOSTON]
    assert _places(client.get("/v1/signals/?brand=nike")) == sorted([BOSTON, NYC])
    assert _places(client.get("/v1/signals/?tags=restock")) == sorted([BOSTON, NYC])
    assert _places(client.get("/v1/signals/?tags=restock,dunk")) == [BOSTON]
    assert _places(client.get("/v1/signals/?tags=restock,")) == sorted([BOSTON, NYC])  # stray comma


def test_list_hides_flagged_and_non_public_signals(client, make_user, make_signal):
    user = make_user()
    make_signal(user, BOSTON)
    make_signal(user, BACK_BAY, visibility="local")
    make_signal(user, NYC, visibility="private")
    make_signal(user, LA, visibility="followers")
    make_signal(user, CHICAGO, is_flagged=True)

    assert _places(client.get("/v1/signals/")) == sorted([BOSTON, BACK_BAY])
    assert client.get("/v1/signals/heatmap").json()["total_signals"] == 2


def test_list_is_paginated_newest_first(client, make_user, make_signal):
    user = make_user()
    now = datetime.now(timezone.utc)
    newest_first = [
        make_signal(user, place, created_at=now - timedelta(minutes=age)) for age, place in enumerate(SEVEN_PLACES)
    ]

    seen = []
    for page in (1, 2, 3, 4):
        body = client.get(f"/v1/signals/?page={page}&per_page=3").json()
        assert (body["total"], body["page"], body["per_page"]) == (7, page, 3)
        assert body["has_next"] is (page < 3)
        seen += [signal["id"] for signal in body["signals"]]

    assert seen == [str(signal.id) for signal in newest_first]


def test_time_window_limits_how_far_back_signals_go(client, make_user, make_signal):
    user = make_user()
    now = datetime.now(timezone.utc)
    make_signal(user, BOSTON)
    make_signal(user, NYC, created_at=now - timedelta(hours=3))
    make_signal(user, LA, created_at=now - timedelta(days=3))
    make_signal(user, CHICAGO, created_at=now - timedelta(days=30))

    for window, expected in (("1h", 1), ("24h", 2), ("7d", 3)):
        assert client.get(f"/v1/signals/?time_window={window}").json()["total"] == expected
        assert client.get(f"/v1/signals/stats?time_window={window}").json()["total_signals"] == expected
        heatmap = client.get(f"/v1/signals/heatmap?time_window={window}").json()
        assert heatmap["time_window"] == window
        assert heatmap["total_signals"] == expected
        assert sum(bucket["signal_count"] for bucket in heatmap["buckets"]) == expected


def test_stats_count_signals_by_state_type_and_brand(client, make_user, make_signal):
    user = make_user()
    make_signal(user, BOSTON, signal_type="DROP_ALERT", brand="Nike")
    make_signal(user, NYC, signal_type="DROP_ALERT", brand="Nike")
    make_signal(user, LA, brand="Adidas", is_flagged=True)
    make_signal(user, CHICAGO)
    make_signal(user, MIAMI, created_at=datetime.now(timezone.utc) - timedelta(days=2))  # outside the window

    stats = client.get("/v1/signals/stats").json()

    assert stats["time_window"] == "24h"
    assert (stats["total_signals"], stats["active_signals"], stats["flagged_signals"]) == (4, 3, 1)
    assert sorted((row["type"], row["count"]) for row in stats["signal_types"]) == [("DROP_ALERT", 2), ("SPOTTED", 2)]
    assert stats["top_brands"] == [{"brand": "Nike", "count": 2}, {"brand": "Adidas", "count": 1}]


def test_create_rejects_a_repeat_and_then_a_burst(client, make_user, auth_headers):
    headers = auth_headers(make_user())

    assert _create(client, headers, BOSTON, text_content="restock").status_code == 201
    # Same author, type and text a few metres away within the hour.
    assert _create(client, headers, (42.3602, -71.0588), text_content="Restock ").status_code == 409
    for place in (NYC, LA, CHICAGO, MIAMI):
        assert _create(client, headers, place).status_code == 201
    # Five signals in fifteen minutes is the limit.
    assert _create(client, headers, LONDON).status_code == 429

    assert client.get("/v1/signals/").json()["total"] == 5


# --- city filter and expiry ---------------------------------------------------


def test_city_filter_matches_only_that_city(client, seven_signals):
    assert _places(client.get("/v1/signals/?city=boston")) == sorted([BOSTON, BACK_BAY])
    assert _places(client.get("/v1/signals/?city=nyc")) == [NYC]
    assert _places(client.get("/v1/signals/?city=la")) == [LA]
    assert _places(client.get("/v1/signals/?city=chicago")) == [CHICAGO]
    assert _places(client.get("/v1/signals/?city=Boston")) == sorted([BOSTON, BACK_BAY])  # case-insensitive


def test_unknown_city_is_rejected_instead_of_ignored(client, seven_signals):
    response = client.get("/v1/signals/?city=miami")

    assert response.status_code == 400
    assert all(city in response.json()["detail"] for city in ("boston", "nyc", "la", "chicago"))
    assert client.get("/v1/signals/", params={"city": "\x00"}).status_code == 400


def test_created_signal_records_its_city(client, db_session, make_user, auth_headers):
    headers = auth_headers(make_user())
    boston = _create(client, headers, BOSTON)
    london = _create(client, headers, LONDON)
    assert boston.status_code == london.status_code == 201

    assert db_session.get(Signal, uuid.UUID(boston.json()["id"])).city == "boston"
    assert db_session.get(Signal, uuid.UUID(london.json()["id"])).city is None


def test_expired_signals_are_hidden_everywhere(client, make_user, make_signal):
    user = make_user()
    now = datetime.now(timezone.utc)
    make_signal(user, BOSTON, brand="Nike", signal_type="DROP_ALERT", expires_at=now - timedelta(hours=5))
    make_signal(user, NYC, brand="Adidas", expires_at=now + timedelta(hours=5))
    make_signal(user, LA, brand="Adidas")  # never expires

    assert _places(client.get("/v1/signals/")) == sorted([NYC, LA])

    heatmap = client.get("/v1/signals/heatmap").json()
    assert heatmap["total_signals"] == 2
    assert sum(bucket["signal_count"] for bucket in heatmap["buckets"]) == 2

    stats = client.get("/v1/signals/stats").json()
    assert (stats["total_signals"], stats["active_signals"], stats["flagged_signals"]) == (2, 2, 0)
    assert stats["signal_types"] == [{"type": "SPOTTED", "count": 2}]
    assert stats["top_brands"] == [{"brand": "Adidas", "count": 2}]


def test_expires_hours_sets_a_future_expiry(client, db_session, make_user, auth_headers):
    created = _create(client, auth_headers(make_user()), BOSTON, expires_hours=2)
    assert created.status_code == 201

    signal = db_session.get(Signal, uuid.UUID(created.json()["id"]))
    db_session.refresh(signal)  # as stored: timezone-aware
    remaining = signal.expires_at - datetime.now(timezone.utc)
    assert timedelta(hours=1, minutes=59) < remaining <= timedelta(hours=2)
    assert not signal.is_expired() and signal.is_active()
    assert _places(client.get("/v1/signals/")) == [BOSTON]

    signal.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    assert signal.is_expired() and not signal.is_active()


def test_is_expired_reads_a_naive_expiry_as_utc():
    now = datetime.now(timezone.utc)

    assert Signal(expires_at=(now - timedelta(minutes=1)).replace(tzinfo=None)).is_expired()
    assert not Signal(expires_at=(now + timedelta(minutes=1)).replace(tzinfo=None)).is_expired()
    assert not Signal().is_expired()  # no expiry at all


@pytest.mark.parametrize("hours", [-5, 0, 721, 10**12])
def test_expires_hours_must_be_between_one_hour_and_thirty_days(client, db_session, make_user, auth_headers, hours):
    response = _create(client, auth_headers(make_user()), BOSTON, expires_hours=hours)

    assert response.status_code == 422
    assert [error["loc"] for error in response.json()["detail"]] == [["body", "expires_hours"]]
    assert db_session.query(Signal).count() == 0


# --- bounding boxes -----------------------------------------------------------


@pytest.mark.parametrize(
    "bbox, expected",
    [
        pytest.param("-71.2,42.3,-71.0,42.4", 2, id="boston"),
        pytest.param("-125,24,-66,50", 6, id="continental-us"),  # everything but London
        pytest.param("-100,-80,100,80", 6, id="wider-than-180-degrees"),  # everything but LA
        pytest.param("-170,-60,170,70", 7, id="almost-all-longitudes"),
        pytest.param("-180,-85,180,85", 7, id="web-mercator-extent"),
        pytest.param("-180,-90,180,90", 7, id="whole-world"),
    ],
)
def test_bbox_is_a_planar_longitude_latitude_box(client, seven_signals, bbox, expected):
    assert client.get(f"/v1/signals/?bbox={bbox}").json()["total"] == expected

    heatmap = client.get(f"/v1/signals/heatmap?bbox={bbox}")
    assert heatmap.status_code == 200
    assert heatmap.json()["total_signals"] == expected
    assert sum(bucket["signal_count"] for bucket in heatmap.json()["buckets"]) == expected
    assert heatmap.json()["bbox"] == bbox.split(",")


@pytest.mark.parametrize(
    "bbox",
    [
        pytest.param("-71.2,42.3,-71.0", id="too-few-values"),
        pytest.param("-71.2,42.3,-71.0,42.4,5", id="too-many-values"),
        pytest.param("a,b,c,d", id="not-numbers"),
        pytest.param("-71.0,42.3,-71.2,42.4", id="min-lng-above-max-lng"),
        pytest.param("-71.2,42.4,-71.0,42.3", id="min-lat-above-max-lat"),
        pytest.param("-190,0,10,10", id="longitude-out-of-range"),
        pytest.param("0,-95,10,10", id="latitude-out-of-range"),
        pytest.param("nan,0,10,10", id="nan"),
        pytest.param("1e400,0,10,10", id="infinity"),
        pytest.param(",,,", id="empty-values"),
        pytest.param("0,0,0,0", id="empty-box"),
        pytest.param("\x00", id="nul"),
    ],
)
def test_malformed_bbox_is_a_400(client, seven_signals, bbox):
    for path in ("/v1/signals/", "/v1/signals/heatmap"):
        response = client.get(path, params={"bbox": bbox})
        assert response.status_code == 400, path
        assert "bbox" in response.json()["detail"]


def test_heatmap_keeps_a_bucket_whose_centre_is_outside_a_small_bbox(client, make_user, make_signal):
    make_signal(make_user(), BOSTON)

    # A zoom 4 cell is about 40 km wide, far larger than this box around the signal.
    heatmap = client.get("/v1/signals/heatmap?zoom=4&bbox=-71.06,42.35,-71.05,42.37").json()

    assert heatmap["total_signals"] == 1
    assert [bucket["signal_count"] for bucket in heatmap["buckets"]] == [1]


# --- heatmap ------------------------------------------------------------------


@pytest.mark.parametrize("time_window", ["1h", "24h", "7d"])
@pytest.mark.parametrize("zoom", [4, 7, 10])
def test_heatmap_buckets_signals_at_the_requested_precision(client, make_user, make_signal, zoom, time_window):
    user = make_user()
    make_signal(user, BOSTON, text_content="restock on the wall", brand="Nike", tags=["restock"])
    make_signal(user, NYC)  # no text: text_content is optional

    expected = sorted(GeohashUtils.encode(lat, lng, precision=zoom) for lat, lng in (BOSTON, NYC))
    query = f"zoom={zoom}&time_window={time_window}"
    for bbox in ("", "&bbox=-75,40,-70,43"):
        response = client.get(f"/v1/signals/heatmap?{query}{bbox}")
        assert response.status_code == 200
        heatmap = response.json()
        assert heatmap["total_signals"] == heatmap["total_buckets"] == 2
        assert heatmap["zoom_level"] == zoom
        assert sorted(bucket["geohash"] for bucket in heatmap["buckets"]) == expected


def test_heatmap_zoom_above_seven_splits_a_neighbourhood_bucket(client, make_user, make_signal):
    lat, lng = GeohashUtils.decode(GeohashUtils.encode(*BOSTON, precision=7))
    near, far = (lat - 0.0003, lng - 0.0003), (lat + 0.0003, lng + 0.0003)  # ~60 m apart, same zoom 7 cell
    user = make_user()
    make_signal(user, near)
    make_signal(user, far)

    def buckets(zoom):
        heatmap = client.get(f"/v1/signals/heatmap?zoom={zoom}").json()
        return {bucket["geohash"]: bucket["signal_count"] for bucket in heatmap["buckets"]}

    assert buckets(7) == {GeohashUtils.encode(*near, precision=7): 2}
    for zoom in (8, 9, 10):
        assert buckets(zoom) == {
            GeohashUtils.encode(*near, precision=zoom): 1,
            GeohashUtils.encode(*far, precision=zoom): 1,
        }


def test_heatmap_cache_miss_and_hit_return_the_same_payload(client, make_user, make_signal):
    signal = make_signal(make_user(), BOSTON, text_content=None, tags=["restock"])

    first = client.get("/v1/signals/heatmap")
    second = client.get("/v1/signals/heatmap")  # served from Redis

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    bucket = first.json()["buckets"][0]
    assert bucket["top_tags"] == ["restock"]
    sample = bucket["sample_signals"][0]
    assert sample["id"] == str(signal.id)
    assert sample["text_content"] == ""
    assert datetime.fromisoformat(sample["created_at"]) == signal.created_at


def test_heatmap_buckets_cover_every_signal_counted_in_total_signals(client, make_user, make_signal, monkeypatch):
    """The query picks the signals; the aggregator must not re-apply the window with a later clock."""
    from services.core import geohash_utils

    class LaterClock(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime.now(tz) + timedelta(minutes=5)

    monkeypatch.setattr(geohash_utils, "datetime", LaterClock)
    make_signal(make_user(), BOSTON, created_at=datetime.now(timezone.utc) - timedelta(minutes=58))

    heatmap = client.get("/v1/signals/heatmap?time_window=1h").json()

    assert heatmap["total_signals"] == 1
    assert [bucket["signal_count"] for bucket in heatmap["buckets"]] == [1]


def test_heatmap_ignores_the_workers_differently_shaped_cache_entry(client, make_user, make_signal):
    make_signal(make_user(), BOSTON)
    # worker/processors/signal_processing.py caches raw geohash buckets under this key.
    redis_client.setex("signals:heatmap:7:24h", 60, json.dumps({"drt2zp1": {"signal_count": 99}}))

    heatmap = client.get("/v1/signals/heatmap?zoom=7&time_window=24h").json()

    assert heatmap["total_signals"] == 1
    assert [bucket["signal_count"] for bucket in heatmap["buckets"]] == [1]


def test_cache_returns_the_same_payload_on_a_miss_as_on_a_hit():
    cache = CacheStrategy(redis_client)
    key = f"signals:heatmap:test:{uuid.uuid4()}"
    moment = datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc)

    async def loader():
        return {"at": moment, "id": uuid.UUID(int=7), "count": 1}

    miss = asyncio.run(cache.get_or_set(key, loader=loader))
    hit = asyncio.run(cache.get_or_set(key, loader=loader))

    assert miss == hit == {"at": str(moment), "id": str(uuid.UUID(int=7)), "count": 1}


def test_aggregator_accepts_aware_naive_and_iso_timestamps():
    now = datetime.now(timezone.utc)
    recent, old = now - timedelta(hours=1), now - timedelta(hours=30)
    rows = [
        {"id": "aware", "geohash": "drt2zp1", "created_at": recent},
        {"id": "naive", "geohash": "drt2zp1", "created_at": recent.replace(tzinfo=None)},  # read as UTC
        {"id": "iso", "geohash": "drt2zp1", "created_at": recent.isoformat().replace("+00:00", "Z")},
        {"id": "undated", "geohash": "drt2zp1"},
        {"id": "old", "geohash": "drt2zp1", "created_at": old},
        {"id": "old-naive", "geohash": "drt2zp1", "created_at": old.replace(tzinfo=None)},
        {"id": "old-iso", "geohash": "drt2zp1", "created_at": old.isoformat()},
    ]

    aggregated = SignalAggregator.aggregate_by_geohash(rows, 7, time_window_hours=24)

    bucket = aggregated["drt2zp1"]
    assert bucket["signal_count"] == 4
    assert [sample["id"] for sample in bucket["sample_signals"]] == ["aware", "naive", "iso"]
    assert bucket["sample_signals"][0]["created_at"] == recent.isoformat()
    json.dumps(aggregated)  # the API and the worker both serialise the buckets


def test_aggregator_tolerates_missing_text_and_truncates_long_text():
    rows = [
        {"id": "none", "geohash": "drt2zp1", "text_content": None},
        {"id": "absent", "geohash": "drt2zp1"},
        {"id": "long", "geohash": "drt2zp1", "text_content": "x" * 250},
    ]

    samples = SignalAggregator.aggregate_by_geohash(rows, 7)["drt2zp1"]["sample_signals"]

    assert [sample["text_content"] for sample in samples] == ["", "", "x" * 100]


def test_aggregator_buckets_finer_than_the_stored_geohash_from_coordinates():
    lat, lng = BOSTON
    row = {"geohash": GeohashUtils.encode(lat, lng, 7), "lat": lat, "lng": lng}

    for precision in (4, 7, 8, 10):
        buckets = SignalAggregator.aggregate_by_geohash([row], precision)
        assert list(buckets) == [GeohashUtils.encode(lat, lng, precision)]

    # Without coordinates the stored hash is the finest bucket available.
    assert list(SignalAggregator.aggregate_by_geohash([{"geohash": "drt2zp1"}], 10)) == ["drt2zp1"]
    only_coordinates = SignalAggregator.aggregate_by_geohash([{"lat": lat, "lng": lng}], 9)
    assert list(only_coordinates) == [GeohashUtils.encode(lat, lng, 9)]


# --- user stats ---------------------------------------------------------------


def test_creating_signals_counts_towards_the_authors_total_posts(client, db_session, make_user, auth_headers):
    author, bystander = make_user(), make_user()
    headers = auth_headers(author)

    assert _create(client, headers, BOSTON).status_code == 201
    assert _create(client, headers, NYC).status_code == 201

    def stored_total(user):
        return db_session.execute(select(User.total_posts).where(User.user_id == user.user_id)).scalar_one()

    assert stored_total(author) == 2
    assert stored_total(bystander) == 0


def _dependency_calls(dependant):
    for sub_dependant in dependant.dependencies:
        yield sub_dependant.call
        yield from _dependency_calls(sub_dependant)


def test_signal_creation_authenticates_and_writes_through_one_session(client):
    """total_posts was lost when auth loaded the user in a second session factory."""
    from services import database

    route = next(
        route
        for route in client.app.routes
        if getattr(route, "path", None) == "/v1/signals/" and "POST" in route.methods
    )
    session_providers = {
        call for call in _dependency_calls(route.dependant) if getattr(call, "__name__", "") == "get_db"
    }

    assert session_providers == {database.get_db}


# --- validation ---------------------------------------------------------------


def test_signal_type_filter_accepts_only_known_types(client, make_user, make_signal):
    make_signal(make_user(), BOSTON)

    for unknown in ("BOGUS", "spotted"):
        response = client.get(f"/v1/signals/?signal_type={unknown}")
        assert response.status_code == 422, unknown
        assert [error["loc"] for error in response.json()["detail"]] == [["query", "signal_type"]]
    for signal_type in Signal.signal_type.type.enums:
        assert client.get(f"/v1/signals/?signal_type={signal_type}").status_code == 200, signal_type


@pytest.mark.parametrize("path", ["/v1/signals/", "/v1/signals/heatmap", "/v1/signals/stats"])
def test_unknown_time_window_is_rejected(client, path):
    response = client.get(f"{path}?time_window=1y")
    assert response.status_code == 422
    assert [error["loc"] for error in response.json()["detail"]] == [["query", "time_window"]]
    for window in ("1h", "24h", "7d"):
        assert client.get(f"{path}?time_window={window}").status_code == 200, window


def test_list_rejects_pagination_and_filters_postgres_cannot_take(client, make_user, make_signal):
    make_signal(make_user(), BOSTON, brand="Nike", tags=["restock"])

    def rejected_parameter(path, query):
        response = client.get(f"{path}?{query}")
        assert response.status_code == 422, query
        return [error["loc"] for error in response.json()["detail"]]

    for query in (
        "page=0",
        "page=99999999999999999999",
        "per_page=0",
        "per_page=101",
        "brand=%00",
        "tags=%00",
        "brand=" + "b" * 101,
        "tags=" + "t" * 501,
    ):
        assert rejected_parameter("/v1/signals/", query) == [["query", query.split("=")[0]]]

    for query in ("zoom=3", "zoom=11", "zoom=abc"):
        assert rejected_parameter("/v1/signals/heatmap", query) == [["query", "zoom"]]


def test_boost_validates_the_signal_id(client, make_user, make_signal, auth_headers):
    author, fan = make_user(), make_user()
    signal = make_signal(author, BOSTON)

    assert client.post(f"/v1/signals/{signal.id}/boost").status_code == 401
    malformed = client.post("/v1/signals/not-a-uuid/boost", headers=auth_headers(fan))
    assert malformed.status_code == 422
    assert [error["loc"] for error in malformed.json()["detail"]] == [["path", "signal_id"]]
    assert client.post(f"/v1/signals/{uuid.uuid4()}/boost", headers=auth_headers(fan)).status_code == 404
    assert client.post(f"/v1/signals/{signal.id}/boost", headers=auth_headers(author)).status_code == 400

    boosted = client.post(f"/v1/signals/{signal.id}/boost", headers=auth_headers(fan))
    assert boosted.status_code == 200
    assert boosted.json()["boost_count"] == 1


@pytest.mark.parametrize(
    "field, value",
    [
        pytest.param("latitude", 999, id="latitude-above-90"),
        pytest.param("latitude", -90.01, id="latitude-below-minus-90"),
        pytest.param("longitude", -999, id="longitude-below-minus-180"),
        pytest.param("longitude", 180.5, id="longitude-above-180"),
        pytest.param("signal_type", "BOGUS", id="unknown-signal-type"),
        pytest.param("visibility", "everyone", id="unknown-visibility"),
        pytest.param("text_content", "t" * 5001, id="text-too-long"),
        pytest.param("media_url", "https://example.com/" + "m" * 500, id="media-url-too-long"),
        pytest.param("brand", "b" * 101, id="brand-too-long"),
        pytest.param("product_sku", "s" * 101, id="sku-too-long"),
        pytest.param("tags", ["t"] * 21, id="too-many-tags"),
        pytest.param("tags", ["t" * 51], id="tag-too-long"),
        pytest.param("tags", [""], id="empty-tag"),
        pytest.param("text_content", "nul\x00byte", id="text-with-nul"),
        pytest.param("media_url", "nul\x00byte", id="media-url-with-nul"),
        pytest.param("brand", "nul\x00byte", id="brand-with-nul"),
        pytest.param("product_sku", "nul\x00byte", id="sku-with-nul"),
        pytest.param("tags", ["nul\x00byte"], id="tag-with-nul"),
    ],
)
def test_create_rejects_values_the_database_cannot_store(client, db_session, make_user, auth_headers, field, value):
    response = _create(client, auth_headers(make_user()), BOSTON, **{field: value})

    assert response.status_code == 422
    assert field in {error["loc"][1] for error in response.json()["detail"]}
    assert db_session.query(Signal).count() == 0


def test_create_keeps_multi_line_text_and_emoji(client, make_user, auth_headers):
    text = "line one\nline two \U0001f525\r\n\ttabbed"

    created = _create(client, auth_headers(make_user()), BOSTON, text_content=text, tags=["two\nlines"])

    assert created.status_code == 201
    assert created.json()["text_content"] == text
    listed = client.get("/v1/signals/?tags=two%0Alines").json()["signals"]
    assert [(signal["text_content"], signal["tags"]) for signal in listed] == [(text, ["two\nlines"])]


def test_create_accepts_values_at_the_limits(client, make_user, auth_headers):
    response = _create(
        client,
        auth_headers(make_user()),
        (90, -180),
        text_content="t" * 5000,
        media_url="https://example.com/" + "m" * 480,
        brand="b" * 100,
        product_sku="s" * 100,
        tags=["t" * 50] * 20,
        expires_hours=720,
    )

    assert response.status_code == 201
    assert _places(client.get("/v1/signals/")) == [(90, -180)]
