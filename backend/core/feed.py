from sqlalchemy.orm import Session
from geoalchemy2.elements import WKTElement
from sqlalchemy import func, desc
from typing import List

from backend.models import post as post_models
from backend.models import location as location_models

def get_hyperlocal_feed(
    db: Session,
    latitude: float,
    longitude: float,
    radius: float, # in kilometers
    limit: int = 100,
):
    # Create a WKTElement for the user's current location
    user_point = WKTElement(f'POINT({longitude} {latitude})', srid=4326)

    # Convert radius from kilometers to meters for ST_DWithin
    radius_meters = radius * 1000

    # Query for posts within the specified radius of the user's location
    # Order by boost_score (descending) and then by creation_date (descending)
    posts = (
        db.query(post_models.Post)
        .join(location_models.Location)
        .filter(
            func.ST_DWithin(
                location_models.Location.geopoint, user_point, radius_meters
            )
        )
        .order_by(desc(post_models.Post.boost_score), desc(post_models.Post.created_date))
        .limit(limit)
        .all()
    )

    return posts
