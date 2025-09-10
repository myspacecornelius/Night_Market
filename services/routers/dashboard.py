from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
import logging
from datetime import datetime, timedelta
import json
import random
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

try:
    from ..database import get_db
    from ..models import user as user_model
    from ..models import post as post_model
    from ..models import dropzone as dropzone_model
    from ..models import laces as laces_model
    from ..models import location as location_model
    from ..schemas import auth as auth_schemas
    from ..core.security import get_current_user
except ImportError:
    from database import get_db
    from models import user as user_model
    from models import post as post_model
    from models import dropzone as dropzone_model
    from models import laces as laces_model
    from models import location as location_model
    from schemas import auth as auth_schemas
    from core.security import get_current_user

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/dashboard",
    tags=["dashboard"],
    responses={404: {"description": "Not found"}},
)

@router.get("/metrics")
async def get_dashboard_metrics(
    current_user: auth_schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get personalized dashboard metrics for the current user
    """
    try:
        # Get user's LACES balance
        laces_balance = db.query(func.sum(laces_model.Transaction.amount)).filter(
            laces_model.Transaction.user_id == current_user.id
        ).scalar() or 0
        
        # Get laces earned today
        today = datetime.now().date()
        laces_earned_today = db.query(func.sum(laces_model.Transaction.amount)).filter(
            laces_model.Transaction.user_id == current_user.id,
            laces_model.Transaction.amount > 0,
            func.date(laces_model.Transaction.created_at) == today
        ).scalar() or 0
        
        # Count active signals (posts within the last 24 hours)
        last_24h = datetime.now() - timedelta(hours=24)
        active_signals = db.query(post_model.Post).filter(
            post_model.Post.created_at >= last_24h,
            post_model.Post.is_active == True
        ).count()
        
        # Get nearby activity - posts near user's last known location
        user_location = db.query(location_model.UserLocation).filter(
            location_model.UserLocation.user_id == current_user.id
        ).order_by(location_model.UserLocation.timestamp.desc()).first()
        
        nearby_activity = 0
        if user_location:
            # This is a simplification - in reality you'd use geospatial queries
            # to find posts within a certain radius of the user's location
            nearby_activity = db.query(post_model.Post).filter(
                post_model.Post.created_at >= last_24h,
                post_model.Post.latitude.between(user_location.latitude - 0.1, user_location.latitude + 0.1),
                post_model.Post.longitude.between(user_location.longitude - 0.1, user_location.longitude + 0.1)
            ).count()
        
        # Get community rank (simplified - just based on LACES balance)
        # In a real app, this would be a more complex calculation
        user_rank = db.query(func.count(user_model.User.id)).filter(
            user_model.User.id != current_user.id,
            # Count users with higher LACES balance
            user_model.User.id.in_(
                db.query(laces_model.Transaction.user_id).group_by(
                    laces_model.Transaction.user_id
                ).having(
                    func.sum(laces_model.Transaction.amount) > laces_balance
                )
            )
        ).scalar() + 1  # Add 1 to get rank (1-based)
        
        # Get profile views
        profile_views = current_user.profile_views or 0
        
        # Weekly growth (dummy calculation for now)
        # In a real app, you'd compare to last week's metrics
        weekly_growth = random.uniform(5.0, 15.0)
        
        # Signals posted by the user
        signals_posted = db.query(post_model.Post).filter(
            post_model.Post.user_id == current_user.id
        ).count()
        
        # Network size (simplified - just followers and following)
        network_size = db.query(user_model.UserFollower).filter(
            (user_model.UserFollower.follower_id == current_user.id) | 
            (user_model.UserFollower.user_id == current_user.id)
        ).count()
        
        return {
            "lacesBalance": laces_balance,
            "lacesEarnedToday": laces_earned_today,
            "activeSignals": active_signals,
            "nearbyActivity": nearby_activity,
            "communityRank": user_rank,
            "totalViews": profile_views,
            "weeklyGrowth": round(weekly_growth, 1),
            "signalsPosted": signals_posted,
            "networkSize": network_size,
            "updatedAt": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting dashboard metrics: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting dashboard metrics: {str(e)}")

@router.get("/activity")
async def get_activity_feed(
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0),
    filter: Optional[str] = None,
    current_user: auth_schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get activity feed with various filters:
    - global: all activity
    - friends: activity from followed users
    - nearby: activity near user's location
    - type: filter by activity type (post, laces, community)
    """
    try:
        last_24h = datetime.now() - timedelta(hours=24)
        
        # Base query for posts
        query = db.query(
            post_model.Post,
            user_model.User.username,
            user_model.User.avatar_url
        ).join(
            user_model.User, 
            post_model.Post.user_id == user_model.User.id
        ).filter(
            post_model.Post.created_at >= last_24h
        )
        
        # Apply filters
        if filter == "friends":
            # Get posts from users that the current user follows
            followed_users = db.query(user_model.UserFollower.user_id).filter(
                user_model.UserFollower.follower_id == current_user.id
            ).all()
            followed_user_ids = [user_id for (user_id,) in followed_users]
            query = query.filter(post_model.Post.user_id.in_(followed_user_ids))
        elif filter == "nearby":
            # Get posts near the user's last location
            user_location = db.query(location_model.UserLocation).filter(
                location_model.UserLocation.user_id == current_user.id
            ).order_by(location_model.UserLocation.timestamp.desc()).first()
            
            if user_location:
                # Simplified geospatial filtering
                query = query.filter(
                    post_model.Post.latitude.between(user_location.latitude - 0.1, user_location.latitude + 0.1),
                    post_model.Post.longitude.between(user_location.longitude - 0.1, user_location.longitude + 0.1)
                )
        
        # Order by most recent
        query = query.order_by(desc(post_model.Post.created_at))
        
        # Apply pagination
        posts = query.offset(offset).limit(limit).all()
        
        # Format the activity items
        activity_items = []
        for post, username, avatar_url in posts:
            # Determine if the post is urgent based on some criteria
            # In a real app, this would be a more complex calculation
            is_urgent = post.upvotes > 5 if post.upvotes else False
            
            # Calculate how long ago the post was created
            time_diff = datetime.now() - post.created_at
            if time_diff.days > 0:
                time_ago = f"{time_diff.days}d ago"
            elif time_diff.seconds // 3600 > 0:
                time_ago = f"{time_diff.seconds // 3600}h ago"
            else:
                time_ago = f"{time_diff.seconds // 60}m ago"
            
            activity_items.append({
                "id": post.id,
                "type": "signal",  # For now, only posts are supported
                "message": post.content,
                "time": time_ago,
                "urgent": is_urgent,
                "user": {
                    "username": username,
                    "avatar": avatar_url
                }
            })
        
        return {
            "items": activity_items,
            "total": query.count(),
            "offset": offset,
            "limit": limit,
            "filter": filter
        }
    except Exception as e:
        logger.error(f"Error getting activity feed: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting activity feed: {str(e)}")

@router.get("/heatmap")
async def get_heatmap_data(
    lat: float = Query(..., description="Center latitude"),
    lng: float = Query(..., description="Center longitude"),
    radius: float = Query(10.0, description="Radius in kilometers"),
    current_user: auth_schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get heatmap data for a specific area
    """
    try:
        # This is a simplified implementation - in a real app,
        # you'd use a proper geospatial database query
        
        # Get dropzones in the area
        dropzones = db.query(
            dropzone_model.Dropzone,
            func.count(post_model.Post.id).label('post_count')
        ).outerjoin(
            post_model.Post,
            dropzone_model.Dropzone.id == post_model.Post.dropzone_id
        ).filter(
            dropzone_model.Dropzone.latitude.between(lat - radius/111.0, lat + radius/111.0),
            dropzone_model.Dropzone.longitude.between(lng - radius/(111.0 * cos(lat * pi/180)), lng + radius/(111.0 * cos(lat * pi/180)))
        ).group_by(
            dropzone_model.Dropzone.id
        ).all()
        
        # Format the heatmap points
        heatmap_points = []
        for dropzone, post_count in dropzones:
            # Calculate intensity based on post count
            intensity = min(1.0, post_count / 10.0) if post_count else 0.3
            
            heatmap_points.append({
                "id": dropzone.id,
                "lat": dropzone.latitude,
                "lng": dropzone.longitude,
                "intensity": intensity,
                "type": "dropzone",
                "name": dropzone.name,
                "postCount": post_count
            })
        
        # Get posts in the area that aren't associated with a dropzone
        standalone_posts = db.query(post_model.Post).filter(
            post_model.Post.dropzone_id == None,
            post_model.Post.latitude.between(lat - radius/111.0, lat + radius/111.0),
            post_model.Post.longitude.between(lng - radius/(111.0 * cos(lat * pi/180)), lng + radius/(111.0 * cos(lat * pi/180)))
        ).all()
        
        # Add standalone posts to the heatmap
        for post in standalone_posts:
            heatmap_points.append({
                "id": f"post_{post.id}",
                "lat": post.latitude,
                "lng": post.longitude,
                "intensity": 0.4,  # Lower intensity for standalone posts
                "type": "post",
                "content": post.content
            })
        
        return {
            "points": heatmap_points,
            "center": {"lat": lat, "lng": lng},
            "radius": radius
        }
    except Exception as e:
        logger.error(f"Error getting heatmap data: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting heatmap data: {str(e)}")

@router.get("/leaderboard")
async def get_leaderboard(
    type: str = Query("laces", description="Leaderboard type: laces, posts, drops"),
    limit: int = Query(10, ge=1, le=50),
    current_user: auth_schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get leaderboard data by different metrics
    """
    try:
        if type == "laces":
            # Get users with highest LACES balance
            leaders = db.query(
                user_model.User,
                func.sum(laces_model.Transaction.amount).label('balance')
            ).join(
                laces_model.Transaction,
                user_model.User.id == laces_model.Transaction.user_id
            ).group_by(
                user_model.User.id
            ).order_by(
                desc('balance')
            ).limit(limit).all()
            
            leaderboard_items = [
                {
                    "rank": i + 1,
                    "userId": user.id,
                    "username": user.username,
                    "avatar": user.avatar_url,
                    "value": balance,
                    "isCurrentUser": user.id == current_user.id
                }
                for i, (user, balance) in enumerate(leaders)
            ]
            
            return {
                "type": "laces",
                "title": "LACES Leaderboard",
                "subtitle": "Top LACES holders in the community",
                "items": leaderboard_items,
                "unit": "LACES"
            }
            
        elif type == "posts":
            # Get users with most posts
            leaders = db.query(
                user_model.User,
                func.count(post_model.Post.id).label('post_count')
            ).join(
                post_model.Post,
                user_model.User.id == post_model.Post.user_id
            ).group_by(
                user_model.User.id
            ).order_by(
                desc('post_count')
            ).limit(limit).all()
            
            leaderboard_items = [
                {
                    "rank": i + 1,
                    "userId": user.id,
                    "username": user.username,
                    "avatar": user.avatar_url,
                    "value": post_count,
                    "isCurrentUser": user.id == current_user.id
                }
                for i, (user, post_count) in enumerate(leaders)
            ]
            
            return {
                "type": "posts",
                "title": "Signal Leaders",
                "subtitle": "Most active community members",
                "items": leaderboard_items,
                "unit": "signals"
            }
            
        elif type == "drops":
            # Get users who have attended the most drops
            leaders = db.query(
                user_model.User,
                func.count(dropzone_model.DropzoneAttendee.id).label('drop_count')
            ).join(
                dropzone_model.DropzoneAttendee,
                user_model.User.id == dropzone_model.DropzoneAttendee.user_id
            ).group_by(
                user_model.User.id
            ).order_by(
                desc('drop_count')
            ).limit(limit).all()
            
            leaderboard_items = [
                {
                    "rank": i + 1,
                    "userId": user.id,
                    "username": user.username,
                    "avatar": user.avatar_url,
                    "value": drop_count,
                    "isCurrentUser": user.id == current_user.id
                }
                for i, (user, drop_count) in enumerate(leaders)
            ]
            
            return {
                "type": "drops",
                "title": "Drop Hunters",
                "subtitle": "Most active at drops and releases",
                "items": leaderboard_items,
                "unit": "drops"
            }
        
        else:
            raise HTTPException(status_code=400, detail=f"Invalid leaderboard type: {type}")
            
    except Exception as e:
        logger.error(f"Error getting leaderboard: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting leaderboard: {str(e)}")
