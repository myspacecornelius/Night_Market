"""Posts, feeds and hyperlocal signals: visibility, caching, validation, routing."""
from services.models.post import Post

BOSTON = {"geo_tag_lat": 42.36, "geo_tag_long": -71.06}


def _post(db_session, user, text, **kwargs):
    post = Post(user_id=user.user_id, post_type="GENERAL", content_text=text, **kwargs)
    db_session.add(post)
    db_session.commit()
    return post


def _texts(response):
    assert response.status_code == 200, response.text
    return {item["content_text"] for item in response.json()}


def test_no_two_routes_share_a_method_and_path():
    from services.main import app

    seen = {}
    for route in app.routes:
        for method in getattr(route, "methods", None) or ():
            key = (method, route.path.rstrip("/") or "/")
            assert key not in seen, f"{method} {route.path} is registered twice ({seen[key]} and {route.name})"
            seen[key] = route.name


def test_global_feed_only_shows_public_posts(client, db_session, make_user):
    author = make_user()
    _post(db_session, author, "public one")
    for visibility in ("local", "friends", "private"):
        _post(db_session, author, f"{visibility} one", visibility=visibility)
    _post(db_session, author, "archived one", is_archived=True)

    assert _texts(client.get("/posts/global?limit=50")) == {"public one"}


def test_user_posts_hide_non_public_posts_from_everyone_but_the_author(client, db_session, make_user, auth_headers):
    author = make_user()
    stranger = make_user()
    _post(db_session, author, "public one")
    _post(db_session, author, "friends one", visibility="friends")
    _post(db_session, author, "private one", visibility="private")
    url = f"/posts/user/{author.user_id}"

    assert _texts(client.get(url)) == {"public one"}
    assert _texts(client.get(url, headers=auth_headers(stranger))) == {"public one"}
    assert _texts(client.get(url, headers=auth_headers(author))) == {"public one", "friends one", "private one"}
    assert _texts(client.get(url, headers={"Authorization": "Bearer not-a-token"})) == {"public one"}


def test_feeds_show_new_posts_and_drop_deleted_ones_immediately(client, make_user, auth_headers):
    user = make_user()
    headers = auth_headers(user)
    client.get("/posts/global")  # warm both caches
    client.get("/posts/feed", headers=headers)

    created = client.post("/posts/", json={"content_text": "fresh"}, headers=headers)
    assert created.status_code == 200
    assert "fresh" in _texts(client.get("/posts/global"))
    assert "fresh" in _texts(client.get("/posts/feed", headers=headers))

    assert client.delete(f"/posts/{created.json()['post_id']}", headers=headers).status_code == 204
    assert "fresh" not in _texts(client.get("/posts/global"))
    assert "fresh" not in _texts(client.get("/posts/feed", headers=headers))


def test_feed_pagination_is_bounded(client, make_user, auth_headers):
    headers = auth_headers(make_user())
    for query in ("skip=-1", "limit=-1", "limit=0", "limit=100000"):
        assert client.get(f"/posts/global?{query}").status_code == 422
        assert client.get(f"/posts/feed?{query}", headers=headers).status_code == 422


def test_inactive_users_cannot_post(client, db_session, make_user, auth_headers):
    user = make_user()
    user.is_active = False
    db_session.commit()

    response = client.post("/posts/", json={"content_text": "hello"}, headers=auth_headers(user))

    assert response.status_code in (400, 403)
    assert db_session.query(Post).filter(Post.user_id == user.user_id).count() == 0


def test_hyperlocal_signal_requires_valid_coordinates(client, make_user, auth_headers):
    headers = auth_headers(make_user())

    assert client.post("/v1/hyperlocal/signals", json={"content_text": "no geo"}, headers=headers).status_code == 422
    for lat, lng in ((999, 999), (91, 0), (0, 181)):
        body = {"content_text": "bad", "geo_tag_lat": lat, "geo_tag_long": lng}
        assert client.post("/v1/hyperlocal/signals", json=body, headers=headers).status_code == 422


def test_hyperlocal_signal_keeps_its_type_and_reports_where_it_is(client, make_user, auth_headers):
    headers = auth_headers(make_user())

    created = client.post(
        "/v1/hyperlocal/signals", json={"content_text": "restock", "post_type": "SPOTTED", **BOSTON}, headers=headers
    )

    assert created.status_code == 200
    body = created.json()
    assert body["post_type"] == "SPOTTED"
    assert (round(body["geo_tag_lat"], 4), round(body["geo_tag_long"], 4)) == (42.36, -71.06)
    assert body["boost_score"] == 0


def test_scan_feed_respects_distance_and_visibility(client, make_user, auth_headers):
    author = make_user()
    stranger = make_user()
    headers = auth_headers(author)

    def signal(text, **extra):
        payload = {"content_text": text, **BOSTON, **extra}
        assert client.post("/v1/hyperlocal/signals", json=payload, headers=headers).status_code == 200

    signal("public here")
    signal("local here", visibility="local")
    signal("friends here", visibility="friends")
    signal("private here", visibility="private")
    signal("public far away", geo_tag_lat=40.71, geo_tag_long=-74.0)

    scan = client.get("/v1/feed/scan?latitude=42.3605&longitude=-71.0605&radius=2", headers=auth_headers(stranger))

    assert _texts(scan) == {"public here", "local here"}
    assert all(round(item["geo_tag_lat"], 2) == 42.36 for item in scan.json())

    for query in ("latitude=inf&longitude=0", "latitude=0&longitude=0&radius=0", "latitude=0&longitude=0&radius=5000"):
        assert client.get(f"/v1/feed/scan?{query}", headers=headers).status_code == 422


def test_hyperlocal_boost_reaches_the_post(client, db_session, make_user, auth_headers):
    author = make_user(laces_balance=100)
    booster = make_user(laces_balance=100)
    created = client.post(
        "/v1/hyperlocal/signals", json={"content_text": "boost me", **BOSTON}, headers=auth_headers(author)
    )
    post_id = created.json()["post_id"]

    response = client.post(f"/v1/hyperlocal/signals/{post_id}/boost", headers=auth_headers(booster))

    assert response.status_code == 200
    assert response.json()["username"] == booster.username
    db_session.expire_all()
    assert (booster.laces_balance, author.laces_balance) == (90, 105)
    assert db_session.get(Post, post_id).boost_score == 10
