"""
Drop zone management and automation tasks
Handle zone schedules, member management, and activity tracking
"""
import json
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from celery import Task
from sqlalchemy import and_, func, text, or_
from sqlalchemy.orm import Session
import math

from worker.tasks import app
from services.database import SessionLocal
from services.models.dropzone import DropZone, DropZoneMember, DropZoneCheckIn, DropZoneStatus, MemberRole
from services.models.user import User
from services.models.laces import LacesLedger
from services.core.redis_client import get_redis


class DropZoneTask(Task):
    """Base task with database session management for drop zone operations"""
    _db = None
    
    @property
    def db(self):
        if self._db is None:
            self._db = SessionLocal()
        return self._db
    
    def after_return(self, status, retval, task_id, args, kwargs, einfo):
        if self._db:
            self._db.close()


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance between two points in meters"""
    R = 6371000  # Earth's radius in meters
    
    lat1_rad, lon1_rad = math.radians(lat1), math.radians(lon1)
    lat2_rad, lon2_rad = math.radians(lat2), math.radians(lon2)
    
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    
    a = math.sin(dlat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    
    return R * c


@app.task(bind=True, base=DropZoneTask)
def manage_zone_schedules(self):
    """
    Open and close drop zones based on their scheduled times
    Update zone status and notify members
    """
    try:
        now = datetime.utcnow()
        redis_client = get_redis()
        
        zones_opened = 0
        zones_closed = 0
        notifications_sent = 0
        
        # Find zones that should be opened
        zones_to_open = self.db.query(DropZone).filter(
            and_(
                DropZone.status == DropZoneStatus.SCHEDULED,
                DropZone.starts_at <= now,
                or_(DropZone.ends_at.is_(None), DropZone.ends_at > now)
            )
        ).all()
        
        for zone in zones_to_open:
            zone.status = DropZoneStatus.ACTIVE
            zones_opened += 1
            
            # Send opening notification to members
            members = self.db.query(DropZoneMember).filter(
                DropZoneMember.dropzone_id == zone.id
            ).all()
            
            for member in members:
                # Publish WebSocket notification
                notification = {
                    "type": "zone_opened",
                    "zone_id": str(zone.id),
                    "zone_name": zone.name,
                    "message": f"🎯 {zone.name} is now open for check-ins!",
                    "user_id": str(member.user_id)
                }
                redis_client.publish(f"user:{member.user_id}", json.dumps(notification))
                notifications_sent += 1
        
        # Find zones that should be closed
        zones_to_close = self.db.query(DropZone).filter(
            and_(
                DropZone.status == DropZoneStatus.ACTIVE,
                DropZone.ends_at.isnot(None),
                DropZone.ends_at <= now
            )
        ).all()
        
        for zone in zones_to_close:
            zone.status = DropZoneStatus.ENDED
            zones_closed += 1
            
            # Calculate final stats
            total_checkins = self.db.query(func.count(DropZoneCheckIn.id)).filter(
                DropZoneCheckIn.dropzone_id == zone.id
            ).scalar()
            
            unique_checkers = self.db.query(func.count(func.distinct(DropZoneCheckIn.user_id))).filter(
                DropZoneCheckIn.dropzone_id == zone.id
            ).scalar()
            
            # Send closing notification with stats
            members = self.db.query(DropZoneMember).filter(
                DropZoneMember.dropzone_id == zone.id
            ).all()
            
            for member in members:
                notification = {
                    "type": "zone_closed",
                    "zone_id": str(zone.id),
                    "zone_name": zone.name,
                    "message": f"📊 {zone.name} has ended! {unique_checkers} unique visitors, {total_checkins} total check-ins",
                    "stats": {
                        "total_checkins": total_checkins,
                        "unique_visitors": unique_checkers
                    },
                    "user_id": str(member.user_id)
                }
                redis_client.publish(f"user:{member.user_id}", json.dumps(notification))
                notifications_sent += 1
        
        self.db.commit()
        
        return {
            "zones_opened": zones_opened,
            "zones_closed": zones_closed,
            "notifications_sent": notifications_sent,
            "managed_at": now.isoformat()
        }
        
    except Exception as e:
        self.db.rollback()
        self.retry(countdown=60, max_retries=3, exc=e)


@app.task(bind=True, base=DropZoneTask)
def validate_checkin_locations(self, checkin_ids: List[str] = None):
    """
    Validate check-in locations for potential spoofing
    Flag suspicious check-ins and alert moderators
    """
    try:
        redis_client = get_redis()
        
        # Get recent check-ins if no specific IDs provided
        if not checkin_ids:
            cutoff_time = datetime.utcnow() - timedelta(hours=1)
            checkins = self.db.query(DropZoneCheckIn).filter(
                DropZoneCheckIn.checked_in_at >= cutoff_time
            ).all()
        else:
            checkins = self.db.query(DropZoneCheckIn).filter(
                DropZoneCheckIn.id.in_(checkin_ids)
            ).all()
        
        suspicious_checkins = []
        validated_checkins = 0
        
        for checkin in checkins:
            zone = checkin.dropzone
            
            # Get check-in coordinates
            checkin_coords = self.db.execute(
                text("SELECT ST_X(:point) as lng, ST_Y(:point) as lat"),
                {"point": checkin.check_in_location}
            ).fetchone()
            
            # Get zone center coordinates
            zone_coords = self.db.execute(
                text("SELECT ST_X(:point) as lng, ST_Y(:point) as lat"),
                {"point": zone.center_point}
            ).fetchone()
            
            # Calculate actual distance
            actual_distance = haversine_distance(
                checkin_coords.lat, checkin_coords.lng,
                zone_coords.lat, zone_coords.lng
            )
            
            # Check for discrepancies
            recorded_distance = checkin.distance_from_center
            distance_discrepancy = abs(actual_distance - recorded_distance)
            
            # Flag if distance discrepancy is > 10 meters or outside allowed radius
            is_suspicious = (
                distance_discrepancy > 10 or
                actual_distance > zone.check_in_radius * 1.5 or  # 50% tolerance
                actual_distance > zone.radius_meters
            )
            
            if is_suspicious:
                suspicious_checkins.append({
                    "checkin_id": str(checkin.id),
                    "user_id": str(checkin.user_id),
                    "zone_id": str(zone.id),
                    "zone_name": zone.name,
                    "actual_distance": actual_distance,
                    "recorded_distance": recorded_distance,
                    "discrepancy": distance_discrepancy,
                    "reason": "distance_mismatch" if distance_discrepancy > 10 else "outside_radius"
                })
                
                # Alert zone moderators
                moderators = self.db.query(DropZoneMember).filter(
                    and_(
                        DropZoneMember.dropzone_id == zone.id,
                        DropZoneMember.role.in_([MemberRole.MODERATOR, MemberRole.OWNER])
                    )
                ).all()
                
                for mod in moderators:
                    alert = {
                        "type": "suspicious_checkin",
                        "zone_id": str(zone.id),
                        "zone_name": zone.name,
                        "checkin_id": str(checkin.id),
                        "user_id": str(checkin.user_id),
                        "distance_discrepancy": distance_discrepancy,
                        "moderator_id": str(mod.user_id)
                    }
                    redis_client.publish(f"mod:{mod.user_id}", json.dumps(alert))
            else:
                validated_checkins += 1
        
        return {
            "checkins_validated": validated_checkins,
            "suspicious_checkins": len(suspicious_checkins),
            "suspicious_details": suspicious_checkins,
            "validated_at": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        self.retry(countdown=60, max_retries=3, exc=e)


@app.task(bind=True, base=DropZoneTask)
def calculate_zone_streaks(self, zone_id: str = None):
    """
    Calculate user streaks for drop zone check-ins
    Award bonus LACES for streak milestones
    """
    try:
        # Get zones to process
        if zone_id:
            zones = [self.db.query(DropZone).filter(DropZone.id == zone_id).first()]
        else:
            # Process all active zones
            zones = self.db.query(DropZone).filter(
                DropZone.status == DropZoneStatus.ACTIVE
            ).all()
        
        streaks_updated = 0
        bonus_laces_awarded = 0
        
        for zone in zones:
            if not zone:
                continue
                
            # Get all members of this zone
            members = self.db.query(DropZoneMember).filter(
                DropZoneMember.dropzone_id == zone.id
            ).all()
            
            for member in members:
                # Get user's check-ins for this zone, ordered by date
                user_checkins = self.db.query(DropZoneCheckIn).filter(
                    and_(
                        DropZoneCheckIn.dropzone_id == zone.id,
                        DropZoneCheckIn.user_id == member.user_id
                    )
                ).order_by(DropZoneCheckIn.checked_in_at.desc()).all()
                
                if not user_checkins:
                    continue
                
                # Calculate current streak
                current_streak = 1
                last_checkin_date = user_checkins[0].checked_in_at.date()
                
                for i in range(1, len(user_checkins)):
                    checkin_date = user_checkins[i].checked_in_at.date()
                    expected_date = last_checkin_date - timedelta(days=1)
                    
                    if checkin_date == expected_date:
                        current_streak += 1
                        last_checkin_date = checkin_date
                    else:
                        break
                
                # Update streak on latest check-in
                latest_checkin = user_checkins[0]
                if latest_checkin.streak_count != current_streak:
                    latest_checkin.streak_count = current_streak
                    streaks_updated += 1
                    
                    # Award bonus LACES for streak milestones
                    milestone_bonus = 0
                    if current_streak == 7:  # Weekly streak
                        milestone_bonus = 100
                    elif current_streak == 30:  # Monthly streak
                        milestone_bonus = 500
                    elif current_streak == 100:  # Legendary streak
                        milestone_bonus = 2000
                    elif current_streak % 10 == 0 and current_streak >= 10:  # Every 10 days
                        milestone_bonus = 50
                    
                    if milestone_bonus > 0:
                        # Create LACES transaction
                        laces_entry = LacesLedger(
                            user_id=member.user_id,
                            amount=milestone_bonus,
                            transaction_type='STREAK_BONUS',
                            description=f"{current_streak}-day streak at {zone.name}",
                            reference_id=str(zone.id)
                        )
                        self.db.add(laces_entry)
                        
                        # Update user balance
                        user = self.db.query(User).filter(User.user_id == member.user_id).first()
                        if user:
                            user.laces_balance += milestone_bonus
                        
                        bonus_laces_awarded += milestone_bonus
        
        self.db.commit()
        
        return {
            "zones_processed": len([z for z in zones if z]),
            "streaks_updated": streaks_updated,
            "bonus_laces_awarded": bonus_laces_awarded,
            "calculated_at": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        self.db.rollback()
        self.retry(countdown=60, max_retries=3, exc=e)


@app.task(bind=True, base=DropZoneTask)
def cleanup_old_checkins(self, days_to_keep: int = 30):
    """
    Clean up old check-in records to manage database size
    Keep recent data and important milestones
    """
    try:
        cutoff_date = datetime.utcnow() - timedelta(days=days_to_keep)
        
        # Delete old check-ins (but keep milestone streaks)
        old_checkins = self.db.query(DropZoneCheckIn).filter(
            and_(
                DropZoneCheckIn.checked_in_at < cutoff_date,
                DropZoneCheckIn.streak_count < 10  # Keep milestone check-ins
            )
        )
        
        deleted_count = old_checkins.count()
        old_checkins.delete()
        
        self.db.commit()
        
        return {
            "checkins_deleted": deleted_count,
            "cutoff_date": cutoff_date.isoformat(),
            "cleaned_at": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        self.db.rollback()
        raise


@app.task
def generate_zone_analytics(zone_id: str, days_back: int = 7):
    """
    Generate comprehensive analytics for a drop zone
    """
    try:
        db = SessionLocal()
        
        zone = db.query(DropZone).filter(DropZone.id == zone_id).first()
        if not zone:
            return {"error": "Zone not found"}
        
        cutoff_date = datetime.utcnow() - timedelta(days=days_back)
        
        # Basic stats
        total_members = db.query(func.count(DropZoneMember.id)).filter(
            DropZoneMember.dropzone_id == zone_id
        ).scalar()
        
        total_checkins = db.query(func.count(DropZoneCheckIn.id)).filter(
            and_(
                DropZoneCheckIn.dropzone_id == zone_id,
                DropZoneCheckIn.checked_in_at >= cutoff_date
            )
        ).scalar()
        
        unique_visitors = db.query(func.count(func.distinct(DropZoneCheckIn.user_id))).filter(
            and_(
                DropZoneCheckIn.dropzone_id == zone_id,
                DropZoneCheckIn.checked_in_at >= cutoff_date
            )
        ).scalar()
        
        # Peak activity hours
        hourly_activity = db.query(
            func.extract('hour', DropZoneCheckIn.checked_in_at).label('hour'),
            func.count(DropZoneCheckIn.id).label('checkins')
        ).filter(
            and_(
                DropZoneCheckIn.dropzone_id == zone_id,
                DropZoneCheckIn.checked_in_at >= cutoff_date
            )
        ).group_by(func.extract('hour', DropZoneCheckIn.checked_in_at)).all()
        
        # Top streakers
        top_streakers = db.query(
            DropZoneCheckIn.user_id,
            func.max(DropZoneCheckIn.streak_count).label('max_streak')
        ).filter(
            DropZoneCheckIn.dropzone_id == zone_id
        ).group_by(DropZoneCheckIn.user_id).order_by(
            func.max(DropZoneCheckIn.streak_count).desc()
        ).limit(10).all()
        
        db.close()
        
        return {
            "zone_id": zone_id,
            "zone_name": zone.name,
            "period_days": days_back,
            "total_members": total_members,
            "total_checkins": total_checkins,
            "unique_visitors": unique_visitors,
            "average_checkins_per_visitor": round(total_checkins / unique_visitors, 2) if unique_visitors > 0 else 0,
            "hourly_activity": [{"hour": int(hour), "checkins": checkins} for hour, checkins in hourly_activity],
            "top_streakers": [{"user_id": str(user_id), "max_streak": streak} for user_id, streak in top_streakers],
            "generated_at": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        if db:
            db.close()
        raise