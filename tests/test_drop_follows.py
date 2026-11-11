"""Following drops: one drop_interests row per follower, a counter that matches the rows, and is_following."""
import threading
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import event
from sqlalchemy.orm import Session

from services.models.drop import Drop, DropStore
from services.models.drop_interest import DropInterest
from services.models.user import User


def _in(**delta):
    return datetime.now(timezone.utc) + timedelta(**delta)


def _unique(prefix):
    return f"{prefix} {uuid.uuid4().hex[:8]}"


def _make_drop(db_session, **overrides):
    values = {"brand": "Nike", "name": _unique("Dunk Low"), "release_at": _in(days=3), "status": "upcoming"}
    values.update(overrides)
    drop = Drop(**values)
    db_session.add(drop)
    db_session.commit()
    return drop


def _interest(drop):
    return f"/v1/drops/{drop.id}/interest"


def _followers(db_session, drop):
    """The user ids in drop_interests for the drop."""
    rows = db_session.query(DropInterest.user_id).filter(DropInterest.drop_id == drop.id).all()
    return sorted(str(user_id) for user_id, in rows)


def _stored(db_session, drop):
    """(interest_count, hype_score) as the database has them now."""
    db_session.refresh(drop)
    return drop.interest_count, drop.hype_score


# --- follow and unfollow --------------------------------------------------------


def test_following_twice_counts_once(client, db_session, make_user, auth_headers):
    user = make_user()
    drop = _make_drop(db_session, hype_score=7)  # hype it already has from signals

    first = client.post(_interest(drop), headers=auth_headers(user))
    second = client.post(_interest(drop), headers=auth_headers(user))

    assert first.status_code == 200
    assert first.json() == {"following": True, "interest_count": 1, "hype_score": 8}
    assert second.status_code == 200
    assert second.json() == first.json()
    assert _followers(db_session, drop) == [str(user.user_id)]
    assert _stored(db_session, drop) == (1, 8)
    assert client.get(f"/v1/drops/{drop.id}").json()["interest_count"] == 1


def test_unfollow_removes_the_follow_and_gives_the_hype_back(client, db_session, make_user, auth_headers):
    user = make_user()
    headers = auth_headers(user)
    drop = _make_drop(db_session, hype_score=7)

    # nothing to remove yet: nothing changes
    never_followed = client.delete(_interest(drop), headers=headers)
    assert never_followed.status_code == 200
    assert never_followed.json() == {"following": False, "interest_count": 0, "hype_score": 7}

    client.post(_interest(drop), headers=headers)
    first = client.delete(_interest(drop), headers=headers)
    second = client.delete(_interest(drop), headers=headers)

    assert first.status_code == 200
    assert first.json() == {"following": False, "interest_count": 0, "hype_score": 7}
    assert second.status_code == 200
    assert second.json() == first.json()
    assert _followers(db_session, drop) == []
    assert _stored(db_session, drop) == (0, 7)

    # and it can be followed again
    assert client.post(_interest(drop), headers=headers).json() == {"following": True, "interest_count": 1, "hype_score": 8}


def test_each_follower_counts_once_and_leaves_alone(client, db_session, make_user, auth_headers):
    first, second = make_user(), make_user()
    drop = _make_drop(db_session)
    other_drop = _make_drop(db_session)

    assert client.post(_interest(drop), headers=auth_headers(first)).json()["interest_count"] == 1
    assert client.post(_interest(drop), headers=auth_headers(second)).json()["interest_count"] == 2
    assert _followers(db_session, drop) == sorted([str(first.user_id), str(second.user_id)])

    # one of them leaving does not take the other along, and another drop is untouched
    left = client.delete(_interest(drop), headers=auth_headers(first))
    assert left.json() == {"following": False, "interest_count": 1, "hype_score": 1}
    assert _followers(db_session, drop) == [str(second.user_id)]
    assert _stored(db_session, drop) == (1, 1)
    assert _followers(db_session, other_drop) == [] and _stored(db_session, other_drop) == (0, 0)


def test_unfollow_never_takes_a_counter_below_zero(client, db_session, make_user, auth_headers):
    """A follow written without the counter (a fixture, a repair script), or hype that was
    reset in the meantime, must not turn "unfollow" into a failed CHECK constraint."""
    user = make_user()
    drop = _make_drop(db_session)
    db_session.add(DropInterest(drop_id=drop.id, user_id=user.user_id))
    db_session.commit()

    response = client.delete(_interest(drop), headers=auth_headers(user))

    assert response.status_code == 200
    assert response.json() == {"following": False, "interest_count": 0, "hype_score": 0}
    assert _followers(db_session, drop) == []


def _follow_at_once(migrated_db, follower_count):
    """Send two follows of one drop at the same moment, each on its own connection.

    Returns (responses, errors, follower rows, interest_count, hype_score). The drop starts
    with a hype score of 5. With one follower both requests are that user's.
    """
    from services.routers.drops import follow_drop

    suffix = uuid.uuid4().hex[:12]
    with Session(migrated_db) as setup:
        users = [
            User(
                username=f"follow_{n}_{suffix}", email=f"follow_{n}_{suffix}@example.com", display_name="Follower",
                password_hash="x",
            )
            for n in range(follower_count)
        ]
        drop = Drop(brand="Nike", name=f"Race {suffix}", release_at=_in(days=1), hype_score=5)
        setup.add_all([*users, drop])
        setup.commit()
        user_ids = [user.user_id for user in users]
        drop_id = drop.id

    about_to_commit = threading.Barrier(2)
    responses, errors = [], []

    def meet_before_commit(_session):
        # Hold each request at "everything written, nothing committed" until the other one is
        # there too: the moment at which neither can see what the other did. A request that is
        # waiting for the other's row or lock never arrives, so stop waiting after a moment.
        try:
            about_to_commit.wait(timeout=1)
        except threading.BrokenBarrierError:
            pass

    def follow(user_id):
        with Session(migrated_db) as session:
            event.listen(session, "before_commit", meet_before_commit)
            try:
                responses.append(follow_drop(drop_id=drop_id, current_user=session.get(User, user_id), db=session))
            except Exception as error:  # a duplicate key would arrive as an IntegrityError
                session.rollback()
                errors.append(error)

    threads = [threading.Thread(target=follow, args=(user_ids[n % follower_count],)) for n in range(2)]
    try:
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)

        with Session(migrated_db) as check:
            rows = check.query(DropInterest).filter(DropInterest.drop_id == drop_id).count()
            stored = check.get(Drop, drop_id)
            return responses, errors, rows, stored.interest_count, stored.hype_score
    finally:
        with Session(migrated_db) as cleanup:
            cleanup.query(DropInterest).filter(DropInterest.drop_id == drop_id).delete()
            cleanup.query(Drop).filter(Drop.id == drop_id).delete()
            cleanup.query(User).filter(User.user_id.in_(user_ids)).delete()
            cleanup.commit()


def test_simultaneous_follows_by_one_user_count_once(migrated_db):
    """A double click or a retried request: two follows by one user in flight together."""
    responses, errors, rows, interest_count, hype_score = _follow_at_once(migrated_db, follower_count=1)

    assert not errors, errors
    assert [response.following for response in responses] == [True, True]
    assert rows == 1
    assert (interest_count, hype_score) == (1, 6)


def test_simultaneous_follows_by_two_users_are_both_counted(migrated_db):
    """Two people following at the same moment used to read the same count and both write count + 1."""
    responses, errors, rows, interest_count, hype_score = _follow_at_once(migrated_db, follower_count=2)

    assert not errors, errors
    assert sorted(response.interest_count for response in responses) == [1, 2]
    assert rows == 2
    assert (interest_count, hype_score) == (2, 7)


# --- is_following ---------------------------------------------------------------


def test_is_following_is_reported_to_the_follower_only(client, db_session, make_user, auth_headers):
    follower, someone_else, admin = make_user(), make_user(), make_user(is_admin=True)
    brand, city = _unique("Brand"), _unique("Followville")
    followed = _make_drop(db_session, brand=brand, release_at=_in(days=2))
    not_followed = _make_drop(db_session, brand=brand, release_at=_in(days=2, hours=1))
    store = client.post(
        "/v1/stores/",
        json={
            "name": "Follow Store", "slug": f"follow-{uuid.uuid4().hex[:8]}", "latitude": 42.35, "longitude": -71.07,
            "city": city, "retailer_type": "NIKE",
        },
        headers=auth_headers(admin),
    )
    assert store.status_code == 201, store.text
    for drop in (followed, not_followed):
        db_session.add(DropStore(drop_id=drop.id, store_id=uuid.UUID(store.json()["id"])))
    db_session.commit()
    assert client.post(_interest(followed), headers=auth_headers(follower)).status_code == 200

    def seen_by(headers):
        listed = client.get("/v1/drops/", params={"brand": brand}, headers=headers)
        assert listed.status_code == 200
        calendar = client.get(f"/v1/drops/calendar/{city}", headers=headers)
        assert calendar.status_code == 200
        return {
            "list": {drop["id"]: drop["is_following"] for drop in listed.json()["drops"]},
            "calendar": {
                drop["id"]: drop["is_following"] for week in calendar.json()["calendar"] for drop in week["drops"]
            },
            "detail": {
                str(drop.id): client.get(f"/v1/drops/{drop.id}", headers=headers).json()["is_following"]
                for drop in (followed, not_followed)
            },
        }

    yes_and_no = {str(followed.id): True, str(not_followed.id): False}
    no_and_no = {str(followed.id): False, str(not_followed.id): False}
    assert seen_by(auth_headers(follower)) == {"list": yes_and_no, "calendar": yes_and_no, "detail": yes_and_no}
    assert seen_by(auth_headers(someone_else)) == {"list": no_and_no, "calendar": no_and_no, "detail": no_and_no}
    assert seen_by({}) == {"list": no_and_no, "calendar": no_and_no, "detail": no_and_no}
    # a token that is not valid is an anonymous caller here, not an error
    assert seen_by({"Authorization": "Bearer not-a-token"})["list"] == no_and_no

    # unfollowing is visible on the next read
    client.delete(_interest(followed), headers=auth_headers(follower))
    assert seen_by(auth_headers(follower))["list"] == no_and_no

    created = client.post("/v1/drops/", json={"brand": brand, "name": _unique("New")}, headers=auth_headers(admin))
    assert created.status_code == 201
    assert created.json()["is_following"] is False


def test_is_following_is_one_query_for_the_whole_page(client, db_session, make_user, auth_headers):
    user = make_user()
    brand = _unique("Brand")
    drops = [_make_drop(db_session, brand=brand, release_at=_in(days=day)) for day in (1, 2, 3, 4)]
    for drop in drops[:3]:
        client.post(_interest(drop), headers=auth_headers(user))

    statements = []

    def record(_conn, _cursor, statement, _parameters, _context, _executemany):
        statements.append(statement)

    connection = db_session.connection()
    event.listen(connection, "before_cursor_execute", record)
    try:
        listed = client.get("/v1/drops/", params={"brand": brand}, headers=auth_headers(user))
        list_lookups = [statement for statement in statements if "drop_interests" in statement]
        statements.clear()
        following = client.get("/v1/drops/following", headers=auth_headers(user))
        following_lookups = [statement for statement in statements if "drop_interests" in statement]
    finally:
        event.remove(connection, "before_cursor_execute", record)

    assert [drop["is_following"] for drop in listed.json()["drops"]] == [True, True, True, False]
    assert len(list_lookups) == 1, list_lookups
    assert [drop["is_following"] for drop in following.json()["drops"]] == [True, True, True]
    # counting the followed drops and reading the page: neither grows with the page
    assert len(following_lookups) <= 2, following_lookups


def _store(client, headers, city):
    """A store in the city, created through the API; returns its id."""
    response = client.post(
        "/v1/stores/",
        json={
            "name": "Count Store", "slug": f"count-{uuid.uuid4().hex[:8]}", "latitude": 42.35, "longitude": -71.07,
            "city": city, "retailer_type": "NIKE",
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return uuid.UUID(response.json()["id"])


def _selects(db_session, client, url, **kwargs):
    """The response to a GET and how many SELECT statements it took.

    The session forgets every object first: the requests of a test share it, and a drop
    whose stores an earlier request already read would cost this one nothing.
    """
    statements = []

    def record(_conn, _cursor, statement, _parameters, _context, _executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)

    db_session.expunge_all()
    connection = db_session.connection()
    event.listen(connection, "before_cursor_execute", record)
    try:
        response = client.get(url, **kwargs)
    finally:
        event.remove(connection, "before_cursor_execute", record)
    assert response.status_code == 200, response.text
    return response.json(), len(statements)


def test_a_page_of_drops_costs_the_same_queries_whatever_its_size(client, db_session, make_user, auth_headers):
    """store_count used to read every store of every drop on the page, one query per drop."""
    user, admin = make_user(), make_user(is_admin=True)
    headers = auth_headers(user)
    brand, city, quiet_city = _unique("Brand"), _unique("Countville"), _unique("Quietville")
    first_store, second_store = _store(client, auth_headers(admin), city), _store(client, auth_headers(admin), city)
    quiet_store = _store(client, auth_headers(admin), quiet_city)
    drops = [_make_drop(db_session, brand=brand, release_at=_in(days=day)) for day in (1, 2, 3, 4, 5)]
    lone_drop = _make_drop(db_session, brand=_unique("Other"), release_at=_in(days=1))
    # two stores, one store, one store, one store, no store
    carried = [(drops[0], first_store), (drops[0], second_store), (lone_drop, quiet_store)]
    carried += [(drop, first_store) for drop in drops[1:4]]
    db_session.add_all([DropStore(drop_id=drop.id, store_id=store_id) for drop, store_id in carried])
    db_session.commit()
    for drop in drops:
        assert client.post(_interest(drop), headers=headers).status_code == 200
    drop_ids = [str(drop.id) for drop in drops]
    store_counts = dict(zip(drop_ids, [2, 1, 1, 1, 0]))

    def counts(listed):
        return {drop["id"]: drop["store_count"] for drop in listed}

    one, cost_of_one = _selects(db_session, client, "/v1/drops/", params={"brand": brand, "per_page": 1}, headers=headers)
    five, cost_of_five = _selects(db_session, client, "/v1/drops/", params={"brand": brand}, headers=headers)
    assert counts(one["drops"]) == {drop_ids[0]: 2}
    assert counts(five["drops"]) == store_counts
    assert cost_of_five == cost_of_one

    one, cost_of_one = _selects(db_session, client, "/v1/drops/following", params={"per_page": 1}, headers=headers)
    five, cost_of_five = _selects(db_session, client, "/v1/drops/following", headers=headers)
    assert counts(one["drops"]) == {drop_ids[0]: 2}
    assert counts(five["drops"]) == store_counts
    assert cost_of_five == cost_of_one

    quiet, cost_of_one = _selects(db_session, client, f"/v1/drops/calendar/{quiet_city}", headers=headers)
    busy, cost_of_four = _selects(db_session, client, f"/v1/drops/calendar/{city}", headers=headers)
    assert counts(drop for week in quiet["calendar"] for drop in week["drops"]) == {str(lone_drop.id): 1}
    assert counts(drop for week in busy["calendar"] for drop in week["drops"]) == {
        drop_id: store_counts[drop_id] for drop_id in drop_ids[:4]
    }
    assert cost_of_four == cost_of_one

    detail, _cost = _selects(db_session, client, f"/v1/drops/{drop_ids[0]}", headers=headers)
    assert detail["store_count"] == 2


def test_the_calendar_lists_a_drop_as_the_other_routes_do(client, db_session, make_user, auth_headers):
    """The calendar's entries are built in the router now; they must not lose or rename a field."""
    user, admin = make_user(), make_user(is_admin=True)
    city = _unique("Sameville")
    drop = _make_drop(
        db_session, brand=_unique("Brand"), release_at=_in(days=2), retail_price=129.5, sku="SKU-1", regions=["US"],
        release_type="RAFFLE", links={"snkrs": "https://example.com/x"}, description="A drop", is_featured=True,
    )
    db_session.add(DropStore(drop_id=drop.id, store_id=_store(client, auth_headers(admin), city)))
    db_session.commit()
    client.post(_interest(drop), headers=auth_headers(user))

    calendar = client.get(f"/v1/drops/calendar/{city}", headers=auth_headers(user)).json()
    detail = client.get(f"/v1/drops/{drop.id}", headers=auth_headers(user)).json()

    [entry] = [entry for week in calendar["calendar"] for entry in week["drops"]]
    assert set(entry) == set(detail)
    assert datetime.fromisoformat(entry.pop("release_at")) == datetime.fromisoformat(detail.pop("release_at"))
    for countdown in (entry.pop("time_until_drop"), detail.pop("time_until_drop")):
        assert countdown["status"] == "upcoming" and countdown["days"] == 1
    assert entry == detail
    assert (entry["retail_price"], entry["store_count"], entry["interest_count"], entry["is_following"]) == (129.5, 1, 1, True)


def test_drops_that_tie_are_listed_in_the_same_order_on_every_page(client, db_session):
    """Same day, same hype: without a last word on the order, a drop could show up on two
    pages and another on none."""
    brand = _unique("Brand")
    release_at = _in(days=2)
    drops = [_make_drop(db_session, brand=brand, release_at=release_at, hype_score=3) for _ in range(5)]
    by_id = sorted(str(drop.id) for drop in drops)

    def ids(**params):
        response = client.get("/v1/drops/", params={"brand": brand, **params})
        assert response.status_code == 200
        return [drop["id"] for drop in response.json()["drops"]]

    assert ids() == by_id
    assert ids(per_page=2) + ids(per_page=2, page=2) + ids(per_page=2, page=3) == by_id


# --- the caller's followed drops ------------------------------------------------


def test_following_lists_the_callers_drops_soonest_first_in_pages(client, db_session, make_user, auth_headers):
    user, someone_else = make_user(), make_user()
    headers = auth_headers(user)
    later = _make_drop(db_session, name="later", release_at=_in(days=9))
    soon = _make_drop(db_session, name="soon", release_at=_in(hours=5))
    undated = _make_drop(db_session, name="undated", release_at=None)
    middle = _make_drop(db_session, name="middle", release_at=_in(days=2))
    last_week = _make_drop(db_session, name="last week", release_at=_in(days=-7), status="ended")
    yesterday = _make_drop(db_session, name="yesterday", release_at=_in(days=-1), status="live")
    not_mine = _make_drop(db_session, name="not mine", release_at=_in(hours=1))
    # followed in an order that is neither the release order nor the order they were created in
    for drop in (undated, last_week, later, yesterday, soon, middle):
        assert client.post(_interest(drop), headers=headers).status_code == 200
    client.post(_interest(not_mine), headers=auth_headers(someone_else))

    def page(**params):
        response = client.get("/v1/drops/following", params=params, headers=headers)
        assert response.status_code == 200, response.text
        body = response.json()
        return [drop["name"] for drop in body["drops"]], {key: body[key] for key in ("total", "page", "per_page", "has_next")}

    # by default: what is still to come, at the page size the list route uses
    assert page() == (["soon", "middle", "later", "undated"], {"total": 4, "page": 1, "per_page": 20, "has_next": False})
    assert page(per_page=3) == (["soon", "middle", "later"], {"total": 4, "page": 1, "per_page": 3, "has_next": True})
    assert page(per_page=3, page=2) == (["undated"], {"total": 4, "page": 2, "per_page": 3, "has_next": False})
    assert page(per_page=3, page=3) == ([], {"total": 4, "page": 3, "per_page": 3, "has_next": False})
    assert page(upcoming_only="true")[0] == ["soon", "middle", "later", "undated"]

    # with the released ones: they follow, most recent first
    everything = ["soon", "middle", "later", "undated", "yesterday", "last week"]
    assert page(upcoming_only="false") == (everything, {"total": 6, "page": 1, "per_page": 20, "has_next": False})
    assert page(upcoming_only="false", per_page=4, page=2)[0] == ["yesterday", "last week"]

    # every entry is a full drop, marked as followed
    first = client.get("/v1/drops/following", headers=headers).json()["drops"][0]
    assert (first["id"], first["is_following"], first["interest_count"]) == (str(soon.id), True, 1)
    assert first["time_until_drop"]["status"] == "upcoming"

    # someone else's list is their own
    theirs = client.get("/v1/drops/following", headers=auth_headers(someone_else)).json()
    assert [drop["name"] for drop in theirs["drops"]] == ["not mine"]
    assert client.get("/v1/drops/following", headers=auth_headers(make_user())).json()["drops"] == []


@pytest.mark.parametrize("params", [
    {"page": 0}, {"page": 100_001}, {"per_page": 0}, {"per_page": 101}, {"upcoming_only": "sometimes"},
])
def test_following_rejects_bad_paging(client, make_user, auth_headers, params):
    response = client.get("/v1/drops/following", params=params, headers=auth_headers(make_user()))

    assert response.status_code == 422
    assert [tuple(error["loc"]) for error in response.json()["detail"]] == [("query", next(iter(params)))]


# --- who may call, and on what --------------------------------------------------


def test_following_an_unknown_drop_is_a_404(client, db_session, make_user, auth_headers):
    headers = auth_headers(make_user())
    missing = uuid.uuid4()

    assert client.post(f"/v1/drops/{missing}/interest", headers=headers).status_code == 404
    assert client.delete(f"/v1/drops/{missing}/interest", headers=headers).status_code == 404
    assert client.delete("/v1/drops/not-a-uuid/interest", headers=headers).status_code == 422
    assert db_session.query(DropInterest).filter(DropInterest.drop_id == missing).count() == 0


def test_follow_routes_need_a_token(client, db_session):
    drop = _make_drop(db_session)

    assert client.post(_interest(drop)).status_code == 401
    assert client.delete(_interest(drop)).status_code == 401
    assert client.get("/v1/drops/following").status_code == 401
    assert client.post(_interest(drop), headers={"Authorization": "Bearer not-a-token"}).status_code == 401
    assert _followers(db_session, drop) == []
    assert _stored(db_session, drop) == (0, 0)
