"""Cell follows and heat subscriptions.

PLACEHOLDERS: nothing here is stored yet. The write endpoints validate their input
and answer "ok" without saving anything, and the read endpoints return fixed sample
data. They require a signed-in user so the contract matches the real feature.
"""
from fastapi import APIRouter, Depends, Path, Query
from typing import List

from services.core.auth import get_current_active_user

router = APIRouter(dependencies=[Depends(get_current_active_user)])

# A geohash cell: 1-12 characters of the geohash alphabet (digits and letters except a, i, l, o)
CELL_ID = Path(..., pattern=r"^[0-9bcdefghjkmnpqrstuvwxyz]{1,12}$", description="Geohash of the cell")

@router.post("/cells/{cell_id}/follow")
def follow_cell(cell_id: str = CELL_ID):
    return {"ok": True, "cell_id": cell_id}

@router.delete("/cells/{cell_id}/follow")
def unfollow_cell(cell_id: str = CELL_ID):
    return {"ok": True, "cell_id": cell_id}

@router.get("/cells/follows", response_model=List[str])
def list_followed_cells():
    # placeholder list
    return ["9q8yyx", "9q8yyz"]

@router.post("/heat/subscribe")
def subscribe_heat(threshold: int = Query(5, ge=1, le=1000)):
    return {"ok": True, "threshold": threshold}

@router.get("/heat/subscriptions")
def list_heat_subs():
    return {"items": [{"threshold": 5}]}
