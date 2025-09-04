
from sqlalchemy.orm import Session
from geoalchemy2.elements import WKTElement
from sqlalchemy import func
import geohash2
from uuid import UUID

from services.models import location as location_models
from services.models import post as post_models
from services.schemas import post as post_schemas

def create_location_and_post(
    db: Session,
    post_create: post_schemas.PostCreate,
    user_id: UUID,
):
    # Create a WKTElement for the location
    point = WKTElement(f'POINT({post_create.geo_tag_long} {post_create.geo_tag_lat})', srid=4326)

    # Check for existing location within a small radius to collapse duplicate signals
    # For simplicity, let's define a small radius (e.g., 10 meters) for collapsing
    # In a real-world scenario, this might involve more sophisticated spatial indexing and clustering
    search_radius_meters = 10 # Example: 10 meters

    # Query for existing locations within the radius
    # ST_DWithin is a PostGIS function that checks if two geometries are within a specified distance
    existing_location = db.query(location_models.Location).filter(
        func.ST_DWithin(location_models.Location.point, point, search_radius_meters)
    ).first()

    if existing_location:
        location_id = existing_location.id
    else:
        # Create new location entry
        # Generate geohash for the location
        location_geohash = geohash2.encode(post_create.geo_tag_lat, post_create.geo_tag_long, precision=12)
        db_location = location_models.Location(point=point, geohash=location_geohash)
        db.add(db_location)
        db.flush() # Flush to get the ID of the new location
        location_id = db_location.id

    # Create the post
    db_post = post_models.Post(
        content_text=post_create.content_text,
        user_id=user_id,
        location_id=location_id,
        post_type='GENERAL',  # Map from content_type, assuming 'GENERAL' for now
        media_url=post_create.media_url,
        tags=post_create.tags,
        visibility=post_create.visibility
        # boost_score will be handled by the laces module
    )
    db.add(db_post)
    db.commit()
    db.refresh(db_post)

    return db_post
