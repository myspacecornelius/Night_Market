"""Drop zones: scheduling, check-ins, capacity, rewards, validation; and the public heatmap."""
import uuid
from datetime import datetime, timedelta, timezone

from services.models.laces import LacesLedger

CENTER = {"center_lat": 42.36, "center_lng": -71.06}
HERE = {"lat": 42.3601, "lng": -71.0601}


def _create(client, headers, **extra):
    response = client.post("/v1/dropzones", json={"name": "Newbury St", **CENTER, **extra}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def _iso(delta):
    return (datetime.now(timezone.utc) + delta).isoformat()


def test_check_in_works_for_zones_with_a_time_window(client, make_user, auth_headers):
    headers = auth_headers(make_user())

    ending = _create(client, headers, ends_at=_iso(timedelta(hours=2)))
    assert ending["status"] == "active"
    assert client.post(f"/v1/dropzones/{ending['id']}/checkin", json=HERE, headers=headers).status_code == 200

    # a start time already in the past means the zone is live, not "scheduled" forever
    started = _create(client, headers, starts_at=_iso(timedelta(hours=-1)), ends_at=_iso(timedelta(hours=1)))
    assert started["status"] == "active"
    assert client.post(f"/v1/dropzones/{started['id']}/checkin", json=HERE, headers=headers).status_code == 200

    # naive timestamps from a client are read as UTC
    naive = (datetime.now(timezone.utc) + timedelta(hours=3)).replace(tzinfo=None).isoformat()
    assert _create(client, headers, ends_at=naive)["status"] == "active"

    upcoming = _create(client, headers, starts_at=_iso(timedelta(hours=1)))
    assert upcoming["status"] == "scheduled"
    assert client.post(f"/v1/dropzones/{upcoming['id']}/checkin", json=HERE, headers=headers).status_code == 400


def test_check_in_pays_laces_once_per_day(client, db_session, make_user, auth_headers):
    user = make_user(laces_balance=100)
    headers = auth_headers(user)
    zone = _create(client, headers)

    first = client.post(f"/v1/dropzones/{zone['id']}/checkin", json=HERE, headers=headers)

    assert first.status_code == 200
    assert first.json()["points_earned"] == 10 and first.json()["laces_balance"] == 110
    db_session.expire_all()
    assert user.laces_balance == 110
    reward, = db_session.query(LacesLedger).filter(LacesLedger.user_id == user.user_id).all()
    assert (reward.transaction_type, reward.amount, reward.balance_after) == ("CHECKIN_REWARD", 10, 110)

    again = client.post(f"/v1/dropzones/{zone['id']}/checkin", json=HERE, headers=headers)
    assert again.status_code == 400
    db_session.expire_all()
    assert user.laces_balance == 110


def test_capacity_limits_members_and_attendees(client, make_user, auth_headers):
    owner, second, third = make_user(), make_user(), make_user()
    zone = _create(client, auth_headers(owner), max_capacity=2)  # the owner is the first member
    join = f"/v1/dropzones/{zone['id']}/join"
    checkin = f"/v1/dropzones/{zone['id']}/checkin"

    assert client.post(join, headers=auth_headers(second)).status_code == 200
    assert client.post(join, headers=auth_headers(second)).status_code == 400  # already a member
    assert client.post(join, headers=auth_headers(third)).status_code == 409

    assert client.post(checkin, json=HERE, headers=auth_headers(owner)).status_code == 200
    assert client.post(checkin, json=HERE, headers=auth_headers(second)).status_code == 200
    assert client.post(checkin, json=HERE, headers=auth_headers(third)).status_code == 409


def test_joining_an_unknown_zone_is_a_404(client, make_user, auth_headers):
    response = client.post(f"/v1/dropzones/{uuid.uuid4()}/join", headers=auth_headers(make_user()))
    assert response.status_code == 404


def test_dropzone_input_is_validated(client, make_user, auth_headers):
    headers = auth_headers(make_user())

    def create(**body):
        return client.post("/v1/dropzones", json={"name": "x", **CENTER, **body}, headers=headers).status_code

    assert create(center_lat=123, center_lng=-200) == 422  # used to be stored as a different place
    assert create(radius_meters=-5) == 422
    assert create(max_capacity=0) == 422
    assert create(name="") == 422
    assert create(starts_at=_iso(timedelta(hours=2)), ends_at=_iso(timedelta(hours=1))) == 422

    zone = _create(client, headers)
    assert client.post(f"/v1/dropzones/{zone['id']}/checkin", json={"lat": 999, "lng": 0}, headers=headers).status_code == 422

    for query in ("limit=-1", "offset=-1", "limit=1000", "bbox=1,2,3", "bbox=-180,-90,180,91"):
        assert client.get(f"/v1/dropzones?{query}").status_code in (400, 422), query


def test_list_filters_by_bbox_and_counts_members(client, make_user, auth_headers):
    owner, member = make_user(), make_user()
    boston = _create(client, auth_headers(owner))
    _create(client, auth_headers(owner), name="LA", center_lat=34.05, center_lng=-118.24)
    client.post(f"/v1/dropzones/{boston['id']}/join", headers=auth_headers(member))
    client.post(f"/v1/dropzones/{boston['id']}/checkin", json=HERE, headers=auth_headers(member))

    east = client.get("/v1/dropzones?bbox=-80,35,-60,50").json()
    assert [(zone["name"], zone["member_count"], zone["check_in_count"]) for zone in east] == [("Newbury St", 2, 1)]

    # a box wider than 180 degrees used to drop rows, and the whole world was a 500
    assert len(client.get("/v1/dropzones?bbox=-170,-60,170,70").json()) == 2
    assert len(client.get("/v1/dropzones?bbox=-180,-90,180,90").json()) == 2


def test_heatmap_only_aggregates_public_posts_and_handles_any_bbox(client, make_user, auth_headers):
    headers = auth_headers(make_user())
    cities = {"boston": (42.36, -71.06), "la": (34.05, -118.24), "chicago": (41.88, -87.63)}
    for name, (lat, lng) in cities.items():
        body = {"content_text": name, "geo_tag_lat": lat, "geo_tag_long": lng}
        assert client.post("/v1/hyperlocal/signals", json=body, headers=headers).status_code == 200
    secret = {"content_text": "secret spot", "geo_tag_lat": 40.71, "geo_tag_long": -74.0, "visibility": "private"}
    assert client.post("/v1/hyperlocal/signals", json=secret, headers=headers).status_code == 200

    def heatmap(bbox):
        # every bbox is unique per run so a cached response is never reused
        nudge = uuid.uuid4().int % 1000 / 1e7
        min_lng, min_lat, max_lng, max_lat = bbox
        response = client.get(f"/v1/heatmap?window=1h&zoom=5&bbox={min_lng},{min_lat},{max_lng},{max_lat - nudge}")
        assert response.status_code == 200, response.text
        return response.json()

    usa = heatmap((-125, 24, -66, 50))
    assert usa["total_posts"] == 3  # the private post is not counted
    samples = [post["content_text"] for bin_ in usa["bins"] for post in bin_["sample_posts"]]
    assert "secret spot" not in samples

    assert heatmap((-170, -60, 170, 70))["total_posts"] == 3
    assert heatmap((-180, -90, 180, 90))["total_posts"] == 3

    for bad in ("bbox=-71.2,42.3,-71.0", "bbox=1,2,3,4,5", "zoom=99", "window=1y"):
        assert client.get(f"/v1/heatmap?{bad}").status_code in (400, 422), bad

    assert client.post("/v1/heatmap/refresh").status_code == 401
    assert client.post("/v1/heatmap/refresh", headers=headers).status_code == 200
