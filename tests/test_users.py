"""PATCH /users/me: a signed-in user edits their own profile, and nothing else."""
import pytest

from services.models.user import User

PROFILE = {
    "display_name": "Night Owl",
    "bio": "Lining up since 2009.",
    "location": "Boston, MA",
    "website_url": "https://nightowl.example.com/kicks?ref=profile",
    "avatar_url": "http://cdn.example.com/avatars/owl.png",
    "is_anonymous": True,
}


def _stored(db_session, user) -> User:
    """The user's row as the database holds it now."""
    db_session.expire_all()
    return db_session.get(User, user.user_id)


def _fields_with_errors(response) -> set:
    """The body fields a 422 complains about."""
    return {issue["loc"][-1] for issue in response.json()["detail"]}


def test_update_requires_authentication(client, db_session, make_user):
    user = make_user()

    assert client.patch("/users/me", json={"display_name": "Nobody"}).status_code == 401
    assert client.patch("/users/me", json={"display_name": "Nobody"}, headers={"Authorization": "Bearer nope"}).status_code == 401

    assert _stored(db_session, user).display_name == "Test User"


def test_update_changes_every_editable_field_and_returns_the_user(client, db_session, make_user, auth_headers):
    user = make_user(laces_balance=250)
    headers = auth_headers(user)

    response = client.patch("/users/me", json=PROFILE, headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert {name: body[name] for name in PROFILE} == PROFILE
    # the rest of the User schema is returned unchanged
    assert body["user_id"] == str(user.user_id)
    assert body["username"] == user.username
    assert body["email"] == user.email
    assert body["laces_balance"] == 250
    assert body["is_verified"] is False
    assert body["created_at"]
    assert "password_hash" not in body and "is_admin" not in body

    stored = _stored(db_session, user)
    assert {name: getattr(stored, name) for name in PROFILE} == PROFILE

    # the same values are what the rest of the app reads
    assert client.get("/auth/me", headers=headers).json() == body


def test_me_includes_website_url(client, make_user, auth_headers):
    user = make_user()

    assert client.get("/auth/me", headers=auth_headers(user)).json()["website_url"] is None


def test_the_answer_has_exactly_the_fields_the_profile_page_reads(client, make_user, auth_headers):
    """The frontend's UserProfile type (frontend/src/lib/api/users.ts) lists these twelve fields."""
    user = make_user()
    headers = auth_headers(user)
    fields = {
        "user_id", "username", "email", "display_name", "avatar_url", "is_anonymous",
        "bio", "location", "website_url", "laces_balance", "is_verified", "created_at",
    }

    assert set(client.patch("/users/me", json={"bio": "x"}, headers=headers).json()) == fields
    assert set(client.get("/auth/me", headers=headers).json()) == fields


def test_update_changes_only_the_fields_sent(client, db_session, make_user, auth_headers):
    user = make_user()
    headers = auth_headers(user)
    assert client.patch("/users/me", json=PROFILE, headers=headers).status_code == 200

    response = client.patch("/users/me", json={"bio": "Second draft."}, headers=headers)

    assert response.status_code == 200
    assert response.json()["bio"] == "Second draft."
    stored = _stored(db_session, user)
    assert stored.bio == "Second draft."
    for name in ("display_name", "location", "website_url", "avatar_url", "is_anonymous"):
        assert getattr(stored, name) == PROFILE[name]


def test_an_empty_update_changes_nothing(client, db_session, make_user, auth_headers):
    user = make_user()
    headers = auth_headers(user)
    client.patch("/users/me", json=PROFILE, headers=headers)

    response = client.patch("/users/me", json={}, headers=headers)

    assert response.status_code == 200
    assert {name: response.json()[name] for name in PROFILE} == PROFILE


def test_update_only_touches_the_caller(client, db_session, make_user, auth_headers):
    user = make_user()
    bystander = make_user()

    assert client.patch("/users/me", json=PROFILE, headers=auth_headers(user)).status_code == 200

    other = _stored(db_session, bystander)
    assert other.display_name == "Test User"
    assert other.bio is None and other.website_url is None
    assert other.is_anonymous is False


def test_text_is_trimmed(client, db_session, make_user, auth_headers):
    user = make_user()

    response = client.patch(
        "/users/me",
        json={"display_name": "  Night Owl  ", "location": "\tBoston ", "website_url": " https://example.com "},
        headers=auth_headers(user),
    )

    assert response.status_code == 200
    stored = _stored(db_session, user)
    assert (stored.display_name, stored.location, stored.website_url) == ("Night Owl", "Boston", "https://example.com")


def test_lengths_are_counted_in_characters_after_trimming(client, db_session, make_user, auth_headers):
    """The edit form counts the same way: code points of the trimmed text, not bytes or UTF-16 units."""
    user = make_user()
    headers = auth_headers(user)
    sneaker = "\U0001F45F"  # one character, four bytes in UTF-8, two UTF-16 units

    padded = client.patch("/users/me", json={"display_name": "  " + sneaker * 100 + "\n"}, headers=headers)
    assert padded.status_code == 200
    assert padded.json()["display_name"] == sneaker * 100
    assert _stored(db_session, user).display_name == sneaker * 100

    too_long = client.patch("/users/me", json={"display_name": sneaker * 101}, headers=headers)
    assert too_long.status_code == 422
    assert _fields_with_errors(too_long) == {"display_name"}
    assert _stored(db_session, user).display_name == sneaker * 100


@pytest.mark.parametrize("field", ["display_name", "bio", "location", "website_url"])
def test_text_that_is_not_valid_unicode_is_refused_not_a_server_error(client, db_session, make_user, auth_headers, field):
    user = make_user()
    # A lone surrogate is valid JSON but cannot be stored (or echoed back) as UTF-8
    body = b'{"%s": "a\\ud800b"}' % field.encode()

    response = client.patch("/users/me", content=body, headers={**auth_headers(user), "Content-Type": "application/json"})

    assert response.status_code == 422
    assert _fields_with_errors(response) == {field}
    assert getattr(_stored(db_session, user), field) in (None, "Test User")


@pytest.mark.parametrize("empty", [None, "", "   "])
def test_null_or_blank_clears_the_optional_fields(client, db_session, make_user, auth_headers, empty):
    user = make_user()
    headers = auth_headers(user)
    client.patch("/users/me", json=PROFILE, headers=headers)

    response = client.patch(
        "/users/me",
        json={"bio": empty, "location": empty, "website_url": empty, "avatar_url": empty},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert (body["bio"], body["location"], body["website_url"], body["avatar_url"]) == (None, None, None, None)
    stored = _stored(db_session, user)
    assert (stored.bio, stored.location, stored.website_url, stored.avatar_url) == (None, None, None, None)
    assert stored.display_name == PROFILE["display_name"]  # not sent, so kept


@pytest.mark.parametrize("display_name", [None, "", "   ", "x" * 101, 42])
def test_display_name_must_be_1_to_100_characters(client, db_session, make_user, auth_headers, display_name):
    user = make_user()

    response = client.patch("/users/me", json={"display_name": display_name}, headers=auth_headers(user))

    assert response.status_code == 422
    assert _fields_with_errors(response) == {"display_name"}
    assert _stored(db_session, user).display_name == "Test User"


def test_values_at_the_length_limits_are_accepted(client, db_session, make_user, auth_headers):
    user = make_user()
    at_limit = {
        "display_name": "n" * 100,
        "bio": "b" * 500,
        "location": "l" * 100,
        "website_url": "https://example.com/" + "w" * 480,
        "avatar_url": "https://example.com/" + "a" * 480,
    }
    assert all(len(at_limit[name]) == 500 for name in ("bio", "website_url", "avatar_url"))

    response = client.patch("/users/me", json=at_limit, headers=auth_headers(user))

    assert response.status_code == 200
    stored = _stored(db_session, user)
    assert {name: getattr(stored, name) for name in at_limit} == at_limit


@pytest.mark.parametrize(
    "field, value",
    [
        ("bio", "b" * 501),
        ("location", "l" * 101),
        ("website_url", "https://example.com/" + "w" * 481),
        ("avatar_url", "https://example.com/" + "a" * 481),
        ("bio", "nul\x00byte"),
        ("bio", ["not", "text"]),
    ],
)
def test_values_over_the_limits_are_rejected(client, db_session, make_user, auth_headers, field, value):
    user = make_user()

    response = client.patch("/users/me", json={field: value}, headers=auth_headers(user))

    assert response.status_code == 422
    assert _fields_with_errors(response) == {field}
    assert getattr(_stored(db_session, user), field) is None


@pytest.mark.parametrize("field", ["website_url", "avatar_url"])
@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "JavaScript://example.com/%0aalert(1)",
        "data:text/html,<script>alert(1)</script>",
        "ftp://example.com/file",
        "example.com",
        "//example.com/path",
        "http:example.com",
        "https://",
        "http://exa mple.com",
        "https://example.com/a\nb",
    ],
)
def test_urls_must_be_http_or_https(client, db_session, make_user, auth_headers, field, url):
    user = make_user()

    response = client.patch("/users/me", json={field: url}, headers=auth_headers(user))

    assert response.status_code == 422
    assert _fields_with_errors(response) == {field}
    assert getattr(_stored(db_session, user), field) is None


@pytest.mark.parametrize("url", ["http://example.com", "HTTPS://Example.com/path?q=1#top", "https://sub.example.co.uk:8443/a/b"])
def test_http_and_https_urls_are_stored_as_sent(client, db_session, make_user, auth_headers, url):
    user = make_user()

    response = client.patch("/users/me", json={"website_url": url, "avatar_url": url}, headers=auth_headers(user))

    assert response.status_code == 200
    assert (response.json()["website_url"], response.json()["avatar_url"]) == (url, url)
    assert _stored(db_session, user).website_url == url


@pytest.mark.parametrize("not_a_bool", [None, "true", "yes", 1, 0, "on"])
def test_is_anonymous_must_be_a_boolean(client, db_session, make_user, auth_headers, not_a_bool):
    user = make_user()

    response = client.patch("/users/me", json={"is_anonymous": not_a_bool}, headers=auth_headers(user))

    assert response.status_code == 422
    assert _fields_with_errors(response) == {"is_anonymous"}
    assert _stored(db_session, user).is_anonymous is False


def test_is_anonymous_can_be_switched_on_and_off(client, db_session, make_user, auth_headers):
    user = make_user()
    viewer = make_user()
    headers = auth_headers(user)

    def listed():
        return user.username in {row["username"] for row in client.get("/users/?limit=100", headers=auth_headers(viewer)).json()}

    assert listed()

    on = client.patch("/users/me", json={"is_anonymous": True}, headers=headers)
    assert on.status_code == 200 and on.json()["is_anonymous"] is True
    assert _stored(db_session, user).is_anonymous is True
    assert not listed()  # an anonymous member is left out of the member list

    off = client.patch("/users/me", json={"is_anonymous": False}, headers=headers)
    assert off.status_code == 200 and off.json()["is_anonymous"] is False
    assert listed()


@pytest.mark.parametrize(
    "field, value",
    [
        ("username", "someone_else"),
        ("email", "attacker@example.com"),
        ("is_admin", True),
        ("is_active", False),
        ("is_verified", True),
        ("laces_balance", 1_000_000),
        ("password_hash", "chosen-by-the-client"),
        ("password", "Sup3r-Secret-Pass!"),
        ("user_id", "00000000-0000-4000-8000-000000000000"),
        ("privacy_level", "anon"),
        ("total_posts", 99),
        ("created_at", "2001-01-01T00:00:00Z"),
        ("nickname", "unknown field"),
    ],
)
def test_other_account_fields_are_rejected_not_ignored(client, db_session, make_user, auth_headers, field, value):
    user = make_user(laces_balance=100)
    before = {
        name: getattr(user, name)
        for name in ("username", "email", "is_admin", "is_active", "is_verified", "laces_balance", "password_hash", "user_id", "privacy_level", "total_posts", "created_at")
    }

    # sent together with an allowed field: the whole request is refused, nothing is half-applied
    response = client.patch("/users/me", json={"display_name": "Sneaky", field: value}, headers=auth_headers(user))

    assert response.status_code == 422
    assert _fields_with_errors(response) == {field}
    stored = _stored(db_session, user)
    assert stored.display_name == "Test User"
    assert {name: getattr(stored, name) for name in before} == before


def test_an_admin_cannot_be_made_by_editing_a_profile(client, db_session, make_user, auth_headers):
    user = make_user()

    client.patch("/users/me", json={"is_admin": True}, headers=auth_headers(user))
    client.patch("/users/me", json={"bio": "still a member", "is_admin": True}, headers=auth_headers(user))

    assert _stored(db_session, user).is_admin is False
    assert _stored(db_session, user).bio is None


@pytest.mark.parametrize("body", [[], ["display_name"], "display_name=Owl", 7, None])
def test_the_body_must_be_a_json_object(client, make_user, auth_headers, body):
    user = make_user()

    assert client.patch("/users/me", json=body, headers=auth_headers(user)).status_code == 422


def test_a_deactivated_account_cannot_edit_its_profile(client, db_session, make_user, auth_headers):
    user = make_user()
    headers = auth_headers(user)
    user.is_active = False
    db_session.commit()

    response = client.patch("/users/me", json={"display_name": "Back again"}, headers=headers)

    assert response.status_code == 403
    assert _stored(db_session, user).display_name == "Test User"
