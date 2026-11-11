from sqlalchemy.orm import Session, contains_eager
from sqlalchemy import func, desc, or_

from services.core.geospatial import geography_point
from services.models import post as post_models
from services.models import location as location_models

# What a stranger standing nearby may see
NEARBY_VISIBILITY = ('public', 'local')


def get_hyperlocal_feed(
    db: Session,
    latitude: float,
    longitude: float,
    radius: float, # in kilometers
    limit: int = 100,
):
    """Posts within ``radius`` km, most boosted first, that a nearby stranger may see."""
    Post = post_models.Post
    Location = location_models.Location

    return (
        db.query(Post)
        .join(Location, Location.id == Post.location_id)
        .options(contains_eager(Post.location))
        .filter(
            func.ST_DWithin(Location.point, geography_point(latitude, longitude), radius * 1000),
            Post.visibility.in_(NEARBY_VISIBILITY),
            Post.is_archived.is_(False),
            or_(Post.expires_at.is_(None), Post.expires_at > func.now()),
        )
        .order_by(desc(Post.boost_score), desc(Post.timestamp))
        .limit(limit)
        .all()
    )
