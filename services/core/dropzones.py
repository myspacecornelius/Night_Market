"""Drop zone lifecycle: zones open when their start time passes and end when their end time passes."""
from datetime import datetime, timezone
from typing import Dict, Optional

from sqlalchemy import or_, update
from sqlalchemy.orm import Session

from services.models.dropzone import DropZone, DropZoneStatus


def sync_dropzone_statuses(db: Session, now: Optional[datetime] = None) -> Dict[str, int]:
    """Move zones between scheduled, active and ended according to their time window.

    Cancelled zones are never touched. Does not commit.
    """
    now = now or datetime.now(timezone.utc)

    closed = db.execute(
        update(DropZone)
        .where(
            DropZone.status.in_([DropZoneStatus.SCHEDULED, DropZoneStatus.ACTIVE]),
            DropZone.ends_at.is_not(None),
            DropZone.ends_at <= now,
        )
        .values(status=DropZoneStatus.ENDED)
        .execution_options(synchronize_session=False)
    ).rowcount

    opened = db.execute(
        update(DropZone)
        .where(
            DropZone.status == DropZoneStatus.SCHEDULED,
            or_(DropZone.starts_at.is_(None), DropZone.starts_at <= now),
        )
        .values(status=DropZoneStatus.ACTIVE)
        .execution_options(synchronize_session=False)
    ).rowcount

    return {"zones_opened": opened, "zones_closed": closed}
