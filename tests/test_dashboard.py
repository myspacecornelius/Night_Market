"""Dashboard endpoints return real numbers computed from the database."""
from datetime import datetime, timedelta, timezone

from services.models.laces import LacesLedger
from services.models.post import Post


def _post(db_session, user, text, **kwargs):
    post = Post(user_id=user.user_id, post_type="GENERAL", content_text=text, **kwargs)
    db_session.add(post)
    db_session.commit()
    return post


def test_dashboard_requires_authentication(client):
    for path in ("metrics", "activity", "timeseries", "leaderboard"):
        assert client.get(f"/v1/dashboard/{path}").status_code == 401


def test_metrics_reflect_the_callers_data(client, db_session, make_user, auth_headers):
    rich = make_user(laces_balance=900)
    user = make_user(laces_balance=300)
    make_user(laces_balance=50)
    _post(db_session, user, "mine", view_count=7)
    _post(db_session, user, "also mine", view_count=5)
    _post(db_session, rich, "someone else's")
    db_session.add(LacesLedger(user_id=user.user_id, amount=40, transaction_type="POST_REWARD", balance_after=300))
    db_session.add(LacesLedger(user_id=user.user_id, amount=-15, transaction_type="BOOST_SENT", balance_after=285))
    db_session.commit()

    response = client.get("/v1/dashboard/metrics", headers=auth_headers(user))

    assert response.status_code == 200
    metrics = response.json()
    assert metrics["lacesBalance"] == 300
    assert metrics["lacesEarnedToday"] == 40  # spending is not "earned"
    assert metrics["lacesEarnedThisWeek"] == 40
    assert metrics["weeklyGrowth"] is None  # nothing earned the week before
    assert metrics["communityRank"] == 2  # only `rich` holds more
    assert metrics["totalUsers"] == 3
    assert metrics["signalsPosted"] == 2
    assert metrics["totalViews"] == 12
    assert metrics["activeSignals"] == 3
    assert metrics["nearbyActivity"] is None  # no coordinates supplied


def test_weekly_growth_compares_with_the_previous_week(client, db_session, make_user, auth_headers):
    user = make_user()
    now = datetime.now(timezone.utc)
    db_session.add(
        LacesLedger(user_id=user.user_id, amount=20, transaction_type="POST_REWARD", created_at=now - timedelta(days=10))
    )
    db_session.add(LacesLedger(user_id=user.user_id, amount=30, transaction_type="POST_REWARD", created_at=now))
    db_session.commit()

    metrics = client.get("/v1/dashboard/metrics", headers=auth_headers(user)).json()

    assert (metrics["lacesEarnedThisWeek"], metrics["lacesEarnedLastWeek"]) == (30, 20)
    assert metrics["weeklyGrowth"] == 50.0


def test_nearby_activity_counts_posts_within_the_radius(client, make_user, auth_headers):
    user = make_user()
    headers = auth_headers(user)
    boston = {"content_text": "boston", "geo_tag_lat": 42.36, "geo_tag_long": -71.06}
    new_york = {"content_text": "nyc", "geo_tag_lat": 40.71, "geo_tag_long": -74.0}
    assert client.post("/v1/hyperlocal/signals", json=boston, headers=headers).status_code == 200
    assert client.post("/v1/hyperlocal/signals", json=new_york, headers=headers).status_code == 200

    near_boston = client.get("/v1/dashboard/metrics?lat=42.361&lng=-71.061&radius_km=2", headers=headers).json()
    assert near_boston["activeSignals"] == 2
    assert near_boston["nearbyActivity"] == 1

    nearby = client.get("/v1/dashboard/activity?filter=nearby&lat=40.71&lng=-74.0", headers=headers).json()
    assert [item["message"] for item in nearby["items"]] == ["nyc"]

    assert client.get("/v1/dashboard/activity?filter=nearby", headers=headers).status_code == 400


def test_activity_feed_filters_and_hides_private_posts(client, db_session, make_user, auth_headers):
    me = make_user()
    other = make_user()
    _post(db_session, me, "my public post")
    _post(db_session, me, "my private post", visibility="private")
    _post(db_session, other, "their public post")
    _post(db_session, other, "their private post", visibility="private")

    everyone = client.get("/v1/dashboard/activity", headers=auth_headers(me)).json()
    assert everyone["total"] == 2
    assert {item["message"] for item in everyone["items"]} == {"my public post", "their public post"}

    mine = client.get("/v1/dashboard/activity?filter=mine", headers=auth_headers(me)).json()
    assert {item["message"] for item in mine["items"]} == {"my public post", "my private post"}
    assert all(item["isOwn"] for item in mine["items"])

    page = client.get("/v1/dashboard/activity?limit=1&offset=1", headers=auth_headers(me)).json()
    assert len(page["items"]) == 1 and page["total"] == 2

    assert client.get("/v1/dashboard/activity?filter=bogus", headers=auth_headers(me)).status_code == 422


def test_timeseries_has_one_point_per_day(client, db_session, make_user, auth_headers):
    user = make_user()
    other = make_user()
    _post(db_session, user, "today")
    _post(db_session, other, "today too")
    db_session.add(LacesLedger(user_id=user.user_id, amount=25, transaction_type="POST_REWARD"))
    db_session.commit()

    series = client.get("/v1/dashboard/timeseries?days=7", headers=auth_headers(user)).json()

    assert len(series["points"]) == 7
    today = series["points"][-1]
    assert today["date"] == datetime.now(timezone.utc).date().isoformat()
    assert (today["signals"], today["posts"], today["laces"]) == (2, 1, 25)
    assert all(point["signals"] == 0 for point in series["points"][:-1])
    assert client.get("/v1/dashboard/timeseries?days=500", headers=auth_headers(user)).status_code == 422


def test_leaderboards_rank_users_and_mask_anonymous_ones(client, db_session, make_user, auth_headers):
    top = make_user(laces_balance=1000)
    me = make_user(laces_balance=500)
    hidden = make_user(laces_balance=750)
    hidden.is_anonymous = True
    banned = make_user(laces_balance=5000)
    banned.is_active = False
    db_session.commit()
    _post(db_session, me, "one")
    _post(db_session, me, "two")
    _post(db_session, top, "one")

    laces = client.get("/v1/dashboard/leaderboard", headers=auth_headers(me)).json()
    assert [item["value"] for item in laces["items"]] == [1000, 750, 500]  # banned user excluded
    assert laces["items"][0]["username"] == top.username
    assert laces["items"][1]["username"] == "anonymous" and laces["items"][1]["userId"] is None
    assert laces["items"][2]["isCurrentUser"] is True

    posts = client.get("/v1/dashboard/leaderboard?type=posts", headers=auth_headers(me)).json()
    assert [(item["username"], item["value"]) for item in posts["items"]] == [(me.username, 2), (top.username, 1)]

    assert client.get("/v1/dashboard/leaderboard?type=checkins", headers=auth_headers(me)).json()["items"] == []
    assert client.get("/v1/dashboard/leaderboard?type=nope", headers=auth_headers(me)).status_code == 422


def test_tied_members_share_a_rank_on_both_dashboard_endpoints(client, make_user, auth_headers):
    """New accounts all start with the same balance, so ties are the normal case. The
    leaderboard numbered tied rows 1, 2, 3 by username while the metrics counted only
    members strictly ahead, so the home page said "#3" where the leaderboard said "#4"."""
    make_user(laces_balance=900)
    tied = [make_user(laces_balance=500) for _ in range(3)]
    make_user(laces_balance=100)

    for member in tied:
        headers = auth_headers(member)
        board = client.get("/v1/dashboard/leaderboard?type=laces", headers=headers).json()["items"]
        own_row = next(row for row in board if row["isCurrentUser"])
        metrics = client.get("/v1/dashboard/metrics", headers=headers).json()

        assert own_row["rank"] == 2
        assert metrics["communityRank"] == 2

    board = client.get("/v1/dashboard/leaderboard?type=laces", headers=auth_headers(tied[0])).json()["items"]
    assert [row["rank"] for row in board] == [1, 2, 2, 2, 5]
