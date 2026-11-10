"""End-to-end API tests against a migrated Postgres/PostGIS database."""
import uuid

PASSWORD = "Sup3r-Secret-Pass!"


def test_register_login_and_me(client):
    registered = client.post(
        "/users/",
        json={"username": "night_owl", "email": "night_owl@example.com", "display_name": "Night Owl", "password": PASSWORD},
    )
    assert registered.status_code == 200

    login = client.post("/auth/token", data={"username": "night_owl", "password": PASSWORD})
    assert login.status_code == 200
    tokens = login.json()
    assert tokens["refresh_token"]

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert me.status_code == 200
    assert me.json()["username"] == "night_owl"

    wrong_password = client.post("/auth/token", data={"username": "night_owl", "password": "nope"})
    assert wrong_password.status_code == 401


def test_weak_passwords_are_rejected(client):
    response = client.post(
        "/users/",
        json={"username": "weak", "email": "weak@example.com", "display_name": "Weak", "password": "short"},
    )
    assert response.status_code == 400


def test_user_listing_requires_authentication(client, make_user, auth_headers):
    user = make_user()

    assert client.get("/users/").status_code == 401
    assert client.get("/users/", headers=auth_headers(user)).status_code == 200
    assert client.get("/users/?limit=100000", headers=auth_headers(user)).status_code == 422


def test_uploads_presign_requires_authentication(client):
    response = client.post("/uploads/presign", params={"file_name": "a.png", "file_type": "image/png"})
    assert response.status_code == 401


def test_release_admin_routes_reject_regular_users(client, make_user, auth_headers):
    user = make_user()

    response = client.delete("/releases/00000000-0000-0000-0000-000000000000", headers=auth_headers(user))

    assert response.status_code == 403


def test_checkout_task_cost_must_be_positive(client, make_user, auth_headers):
    user = make_user(laces_balance=100)
    payload = {
        "product_url": "https://example.com/products/x",
        "variant_id": "1",
        "size": "10",
        "retailer": "shopify",
        "mode": "request",
        "profile_id": "p1",
        "cost": -500,
    }

    response = client.post("/v1/shop/purchase-checkout-task", json=payload, headers=auth_headers(user))

    assert response.status_code == 422
    assert user.laces_balance == 100


def test_post_create_and_feed(client, make_user, auth_headers):
    user = make_user()
    headers = auth_headers(user)

    created = client.post(
        "/posts/", json={"post_type": "GENERAL", "content_text": "hello night market"}, headers=headers
    )
    assert created.status_code == 200

    feed = client.get("/posts/feed", headers=headers)
    assert feed.status_code == 200
    assert any(post["post_id"] == created.json()["post_id"] for post in feed.json())


def test_dropzone_create_and_check_in(client, make_user, auth_headers):
    owner = make_user()
    headers = auth_headers(owner)

    assert client.post("/v1/dropzones", json={"name": "x", "center_lat": 0, "center_lng": 0}).status_code == 401

    created = client.post(
        "/v1/dropzones", json={"name": "Newbury St", "center_lat": 42.36, "center_lng": -71.06}, headers=headers
    )
    assert created.status_code == 200
    zone = created.json()
    assert zone["owner_id"] == str(owner.user_id)
    assert (zone["center_lat"], zone["center_lng"]) == (42.36, -71.06)

    far = client.post(f"/v1/dropzones/{zone['id']}/checkin", json={"lat": 40.71, "lng": -74.0}, headers=headers)
    assert far.status_code == 400

    near = client.post(f"/v1/dropzones/{zone['id']}/checkin", json={"lat": 42.3601, "lng": -71.0601}, headers=headers)
    assert near.status_code == 200
    assert near.json()["distance_from_center"] < 50

    again = client.post(f"/v1/dropzones/{zone['id']}/checkin", json={"lat": 42.3601, "lng": -71.0601}, headers=headers)
    assert again.status_code == 400


def test_signal_shows_up_in_heatmap(client, make_user, auth_headers):
    user = make_user()
    headers = auth_headers(user)

    signal = client.post(
        "/v1/signals",
        json={"content_text": "restock on the wall", "geo_tag_lat": 42.36, "geo_tag_long": -71.06},
        headers=headers,
    )
    assert signal.status_code == 200

    # The response is cached in Redis by bbox; a unique one avoids a stale hit.
    bbox = f"-71.2,42.2,-70.9,42.5{uuid.uuid4().int % 100000:05d}"
    heatmap = client.get(f"/v1/heatmap?bbox={bbox}&window=1h", headers=headers)
    assert heatmap.status_code == 200
    bins = heatmap.json()["bins"]
    assert bins
    assert all(isinstance(b["lat"], float) and isinstance(b["lng"], float) for b in bins)
