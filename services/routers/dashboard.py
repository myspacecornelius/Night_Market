"""Dashboard endpoints: per-user metrics, activity feed, time series, leaderboards.

Everything here is computed from the real tables (users, posts, locations,
laces_ledger, dropzone_checkins); nothing is estimated or randomised.
"""
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from geoalchemy2 import Geography
from sqlalchemy import cast, func
from sqlalchemy.orm import Session

from services.core.auth import get_current_active_user
from services.database import get_db
from services.models.dropzone import DropZoneCheckIn
from services.models.laces import LacesLedger
from services.models.location import Location
from services.models.post import Post
from services.models.user import User

router = APIRouter(
    prefix="/dashboard",
    tags=["dashboard"],
    responses={404: {"description": "Not found"}},
)

ACTIVE_WINDOW = timedelta(hours=24)
MAX_RADIUS_KM = 100.0


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _start_of_utc_day(moment: datetime) -> datetime:
    return moment.replace(hour=0, minute=0, second=0, microsecond=0)


def _near(lat: float, lng: float, radius_km: float):
    """Filter clause: location within ``radius_km`` of the point."""
    point = cast(func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326), Geography)
    return func.ST_DWithin(Location.point, point, radius_km * 1000)


def _laces_earned(db: Session, user_id, start: datetime, end: Optional[datetime] = None) -> int:
    query = db.query(func.coalesce(func.sum(LacesLedger.amount), 0)).filter(
        LacesLedger.user_id == user_id,
        LacesLedger.amount > 0,
        LacesLedger.created_at >= start,
    )
    if end is not None:
        query = query.filter(LacesLedger.created_at < end)
    return int(query.scalar())


def _public_name(user: User) -> Dict[str, Optional[str]]:
    """How a user appears to other people, honouring the anonymous flag."""
    if user.is_anonymous:
        return {"username": "anonymous", "avatar": None}
    return {"username": user.username, "avatar": user.avatar_url}


@router.get("/metrics")
def get_dashboard_metrics(
    lat: Optional[float] = Query(None, ge=-90, le=90, description="Latitude for nearby activity"),
    lng: Optional[float] = Query(None, ge=-180, le=180, description="Longitude for nearby activity"),
    radius_km: float = Query(5.0, gt=0, le=MAX_RADIUS_KM),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Personal dashboard metrics for the current user."""
    now = _utcnow()
    today = _start_of_utc_day(now)
    week_ago = now - timedelta(days=7)
    two_weeks_ago = now - timedelta(days=14)
    active_since = now - ACTIVE_WINDOW

    recent_public_posts = db.query(func.count(Post.post_id)).filter(
        Post.timestamp >= active_since,
        Post.visibility == "public",
        Post.is_archived.is_(False),
    )

    nearby_activity = None
    if lat is not None and lng is not None:
        nearby_activity = (
            recent_public_posts.join(Location, Location.id == Post.location_id)
            .filter(_near(lat, lng, radius_km))
            .scalar()
        )

    earned_this_week = _laces_earned(db, current_user.user_id, week_ago)
    earned_last_week = _laces_earned(db, current_user.user_id, two_weeks_ago, week_ago)
    weekly_growth = None
    if earned_last_week > 0:
        weekly_growth = round((earned_this_week - earned_last_week) / earned_last_week * 100, 1)

    users_ahead = db.query(func.count(User.user_id)).filter(
        User.is_active.is_(True),
        User.laces_balance > current_user.laces_balance,
    ).scalar()

    signals_posted, total_views = db.query(
        func.count(Post.post_id), func.coalesce(func.sum(Post.view_count), 0)
    ).filter(Post.user_id == current_user.user_id).one()

    return {
        "lacesBalance": current_user.laces_balance,
        "lacesEarnedToday": _laces_earned(db, current_user.user_id, today),
        "lacesEarnedThisWeek": earned_this_week,
        "lacesEarnedLastWeek": earned_last_week,
        "weeklyGrowth": weekly_growth,
        "activeSignals": recent_public_posts.scalar(),
        "nearbyActivity": nearby_activity,
        "communityRank": users_ahead + 1,
        "totalUsers": db.query(func.count(User.user_id)).filter(User.is_active.is_(True)).scalar(),
        "totalViews": int(total_views),
        "signalsPosted": signals_posted,
        "checkIns": db.query(func.count(DropZoneCheckIn.id))
        .filter(DropZoneCheckIn.user_id == current_user.user_id)
        .scalar(),
        "updatedAt": now.isoformat(),
    }


@router.get("/activity")
def get_activity_feed(
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0),
    filter: str = Query("global", pattern="^(global|mine|nearby)$"),
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lng: Optional[float] = Query(None, ge=-180, le=180),
    radius_km: float = Query(5.0, gt=0, le=MAX_RADIUS_KM),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Recent posts: everyone's public posts, the caller's own, or public posts nearby."""
    query = db.query(Post, User).join(User, User.user_id == Post.user_id).filter(Post.is_archived.is_(False))

    if filter == "mine":
        query = query.filter(Post.user_id == current_user.user_id)
    else:
        query = query.filter(Post.visibility == "public")
        if filter == "nearby":
            if lat is None or lng is None:
                raise HTTPException(status_code=400, detail="lat and lng are required for filter=nearby")
            query = query.join(Location, Location.id == Post.location_id).filter(_near(lat, lng, radius_km))

    total = query.count()
    rows = query.order_by(Post.timestamp.desc(), Post.post_id).offset(offset).limit(limit).all()

    items = []
    for post, author in rows:
        is_own = author.user_id == current_user.user_id
        user = {"username": author.username, "avatar": author.avatar_url} if is_own else _public_name(author)
        items.append(
            {
                "id": str(post.post_id),
                "type": "signal",
                "postType": post.post_type,
                "message": post.content_text,
                "createdAt": post.timestamp.isoformat(),
                "boostScore": post.boost_score,
                "views": post.view_count,
                "replies": post.reply_count,
                "isOwn": is_own,
                "user": user,
            }
        )

    return {"items": items, "total": total, "offset": offset, "limit": limit, "filter": filter}


@router.get("/timeseries")
def get_activity_timeseries(
    days: int = Query(7, ge=1, le=90),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Per-day (UTC) series: community public posts, and the caller's posts and LACES earned."""
    today = _utcnow().date()
    first_day = today - timedelta(days=days - 1)
    since = datetime.combine(first_day, datetime.min.time(), tzinfo=timezone.utc)

    post_day = func.date(func.timezone("UTC", Post.timestamp))
    community = dict(
        db.query(post_day, func.count(Post.post_id))
        .filter(Post.timestamp >= since, Post.visibility == "public", Post.is_archived.is_(False))
        .group_by(post_day)
        .all()
    )
    own_posts = dict(
        db.query(post_day, func.count(Post.post_id))
        .filter(Post.timestamp >= since, Post.user_id == current_user.user_id)
        .group_by(post_day)
        .all()
    )
    ledger_day = func.date(func.timezone("UTC", LacesLedger.created_at))
    earned = dict(
        db.query(ledger_day, func.sum(LacesLedger.amount))
        .filter(
            LacesLedger.created_at >= since,
            LacesLedger.user_id == current_user.user_id,
            LacesLedger.amount > 0,
        )
        .group_by(ledger_day)
        .all()
    )

    points: List[Dict[str, Any]] = []
    for offset in range(days):
        day: date = first_day + timedelta(days=offset)
        points.append(
            {
                "date": day.isoformat(),
                "signals": community.get(day, 0),
                "posts": own_posts.get(day, 0),
                "laces": int(earned.get(day, 0)),
            }
        )
    return {"days": days, "points": points}


LEADERBOARDS = {
    "laces": {"title": "LACES Leaderboard", "subtitle": "Top LACES holders in the community", "unit": "LACES"},
    "posts": {"title": "Signal Leaders", "subtitle": "Most active community members", "unit": "signals"},
    "checkins": {"title": "Drop Hunters", "subtitle": "Most check-ins at drop zones", "unit": "check-ins"},
}


@router.get("/leaderboard")
def get_leaderboard(
    type: str = Query("laces", pattern="^(laces|posts|checkins)$"),
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Top active users by LACES balance, posts, or drop-zone check-ins."""
    if type == "laces":
        value = User.laces_balance
        query = db.query(User, value).filter(User.is_active.is_(True))
    elif type == "posts":
        value = func.count(Post.post_id)
        query = (
            db.query(User, value)
            .join(Post, Post.user_id == User.user_id)
            .filter(User.is_active.is_(True), Post.visibility == "public", Post.is_archived.is_(False))
            .group_by(User.user_id)
        )
    else:
        value = func.count(DropZoneCheckIn.id)
        query = (
            db.query(User, value)
            .join(DropZoneCheckIn, DropZoneCheckIn.user_id == User.user_id)
            .filter(User.is_active.is_(True))
            .group_by(User.user_id)
        )

    leaders = query.order_by(value.desc(), User.username).limit(limit).all()

    items = []
    for rank, (user, amount) in enumerate(leaders, start=1):
        is_current = user.user_id == current_user.user_id
        shown = {"username": user.username, "avatar": user.avatar_url} if is_current else _public_name(user)
        items.append(
            {
                "rank": rank,
                "userId": None if (user.is_anonymous and not is_current) else str(user.user_id),
                "username": shown["username"],
                "avatar": shown["avatar"],
                "value": int(amount),
                "isCurrentUser": is_current,
            }
        )

    return {"type": type, "items": items, **LEADERBOARDS[type]}
