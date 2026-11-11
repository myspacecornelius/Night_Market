from sqlalchemy.orm import Session
from geoalchemy2.elements import WKTElement
from sqlalchemy import func
import geohash2
from uuid import UUID

from services.core.metrics import POSTS_CREATED
from services.models import location as location_models
from services.models import post as post_models
from services.schemas import post as post_schemas

# Posts closer together than this share one location row
COLLAPSE_RADIUS_METERS = 10


def create_location_and_post(
    db: Session,
    post_create: post_schemas.HyperlocalPostCreate,
    user_id: UUID,
):
    """Create a post pinned to a place, reusing a location within a few metres."""
    point = WKTElement(f'POINT({post_create.geo_tag_long} {post_create.geo_tag_lat})', srid=4326)

    existing_location = db.query(location_models.Location).filter(
        func.ST_DWithin(location_models.Location.point, point, COLLAPSE_RADIUS_METERS)
    ).first()

    if existing_location:
        location = existing_location
    else:
        location_geohash = geohash2.encode(post_create.geo_tag_lat, post_create.geo_tag_long, precision=12)
        location = location_models.Location(point=point, geohash=location_geohash)
        db.add(location)
        db.flush()  # Flush to get the ID of the new location

    db_post = post_models.Post(
        content_text=post_create.content_text,
        user_id=user_id,
        location_id=location.id,
        post_type=post_create.post_type.value,
        media_url=post_create.media_url,
        tags=post_create.tags,
        visibility=post_create.visibility.value,
    )
    db.add(db_post)
    db.commit()
    db.refresh(db_post)
    POSTS_CREATED.labels("hyperlocal").inc()

    return db_post
