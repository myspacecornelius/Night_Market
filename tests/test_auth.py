"""Registration, login, token refresh and logout."""
PASSWORD = "Sup3r-Secret-Pass!"


def _register(client, username="night_owl", email="Night.Owl@Example.com", path="/auth/register"):
    return client.post(path, json={"username": username, "email": email, "display_name": "Night Owl", "password": PASSWORD})


def _login(client, identifier, password=PASSWORD, **kwargs):
    return client.post("/auth/token", data={"username": identifier, "password": password}, **kwargs)


def _bearer(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def test_register_endpoint_used_by_the_web_client(client):
    created = _register(client)
    assert created.status_code == 201
    assert created.json()["email"] == "night.owl@example.com"

    assert _register(client, username="someone_else").status_code == 409  # same e-mail, different case
    assert _register(client, email="other@example.com").status_code == 409  # same username
    assert _register(client, username="third", email="third@example.com", path="/users/").status_code == 200

    weak = client.post(
        "/users/",  # same code path; /auth/register allows only 3 attempts per hour per IP
        json={"username": "weak_one", "email": "weak@example.com", "display_name": "Weak", "password": "short"},
    )
    assert weak.status_code == 400


def test_login_accepts_username_or_email(client):
    _register(client)

    assert _login(client, "night_owl").status_code == 200
    assert _login(client, "night.owl@example.com").status_code == 200
    assert _login(client, "NIGHT.OWL@EXAMPLE.COM").status_code == 200
    assert _login(client, "night_owl", password="wrong").status_code == 401
    assert _login(client, "nobody@example.com").status_code == 401


def test_me_returns_the_fields_the_client_reads(client):
    _register(client)
    tokens = _login(client, "night_owl").json()

    me = client.get("/auth/me", headers=_bearer(tokens)).json()

    assert me["laces_balance"] == 100
    assert me["is_verified"] is False
    assert me["created_at"]


def test_refresh_rotates_the_token_pair(client):
    _register(client)
    first = _login(client, "night_owl").json()

    refreshed = client.post("/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert refreshed.status_code == 200  # used to be a 500 on every valid token
    second = refreshed.json()
    assert second["refresh_token"] != first["refresh_token"]

    assert client.get("/auth/me", headers=_bearer(second)).status_code == 200
    # the old pair is dead: the refresh token cannot be replayed and its access token is revoked
    assert client.post("/auth/refresh", json={"refresh_token": first["refresh_token"]}).status_code == 401
    assert client.get("/auth/me", headers=_bearer(first)).status_code == 401

    assert client.post("/auth/refresh", json={"refresh_token": second["refresh_token"]}).status_code == 200
    assert client.post("/auth/refresh", json={"refresh_token": "not-a-token"}).status_code == 401


def test_logout_ends_access(client):
    _register(client)
    tokens = _login(client, "night_owl").json()
    headers = _bearer(tokens)
    assert client.post("/posts/", json={"content_text": "before"}, headers=headers).status_code == 200

    assert client.post("/auth/logout", headers=headers).status_code == 200

    assert client.get("/auth/me", headers=headers).status_code == 401
    assert client.post("/posts/", json={"content_text": "after"}, headers=headers).status_code == 401
    assert client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401


def test_login_with_an_oversized_user_agent(client):
    _register(client)

    response = _login(client, "night_owl", headers={"User-Agent": "x" * 600})

    assert response.status_code == 200


def test_inactive_accounts_are_refused(client, db_session, make_user, auth_headers):
    from services.core.security import get_password_hash

    user = make_user(password_hash=get_password_hash(PASSWORD))
    user.is_active = False
    db_session.commit()

    assert _login(client, user.username).status_code == 403
    assert client.get("/auth/me", headers=auth_headers(user)).status_code == 403


def test_user_listing_does_not_expose_emails(client, db_session, make_user, auth_headers):
    viewer = make_user()
    make_user()
    hidden = make_user()
    hidden.is_anonymous = True
    db_session.commit()

    listing = client.get("/users/?limit=100", headers=auth_headers(viewer))

    assert listing.status_code == 200
    users = listing.json()
    assert len(users) == 2
    assert all("email" not in user and "laces_balance" not in user for user in users)
    assert hidden.username not in {user["username"] for user in users}


def test_activity_is_recorded_without_a_write_on_every_request(client, db_session, make_user, auth_headers):
    from datetime import datetime, timedelta, timezone

    user = make_user()
    headers = auth_headers(user)
    long_ago = datetime.now(timezone.utc) - timedelta(days=2)
    user.last_active_at = long_ago
    db_session.commit()
    db_session.refresh(user)
    updated_before = user.updated_at

    assert client.get("/auth/me", headers=headers).status_code == 200
    db_session.refresh(user)
    first_seen = user.last_active_at
    assert first_seen > long_ago
    assert user.updated_at == updated_before  # being seen is not a change to the account

    assert client.get("/auth/me", headers=headers).status_code == 200
    db_session.refresh(user)
    assert user.last_active_at == first_seen  # recorded moments ago: no second write


def test_old_sessions_are_deleted_and_expired_ones_revoked(db_session, make_user):
    """Every login and every token refresh adds a row with an IP address and a user
    agent. Nothing ever deleted one."""
    from datetime import datetime, timedelta, timezone

    from services.core.auth import SESSION_RETENTION_DAYS, cleanup_expired_sessions
    from services.models.session import UserSession

    user = make_user()
    now = datetime.now(timezone.utc)

    def session(name, expires_at, revoked="0"):
        row = UserSession(
            user_id=user.user_id, refresh_token_hash=UserSession.hash_refresh_token(name),
            expires_at=expires_at, is_revoked=revoked,
        )
        db_session.add(row)
        return row

    live = session("live", now + timedelta(days=3))
    just_expired = session("just-expired", now - timedelta(hours=1))
    rotated_recently = session("rotated", now + timedelta(days=2), revoked="1")
    long_gone = session("long-gone", now - timedelta(days=SESSION_RETENTION_DAYS + 1), revoked="1")
    db_session.commit()
    ids = {name: row.id for name, row in
           (("live", live), ("just_expired", just_expired), ("rotated", rotated_recently), ("long_gone", long_gone))}

    revoked = cleanup_expired_sessions(db_session)

    assert revoked == 1  # the one that had expired but was still marked active
    db_session.expire_all()
    remaining = {row.id: row.is_revoked for row in db_session.query(UserSession).filter(UserSession.user_id == user.user_id)}
    assert remaining == {ids["live"]: "0", ids["just_expired"]: "1", ids["rotated"]: "1"}  # long_gone is deleted
