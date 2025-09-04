from fastapi import APIRouter
from typing import List

router = APIRouter()

@router.post("/cells/{cell_id}/follow")
def follow_cell(cell_id: str):
    return {"ok": True, "cell_id": cell_id}

@router.delete("/cells/{cell_id}/follow")
def unfollow_cell(cell_id: str):
    return {"ok": True, "cell_id": cell_id}

@router.get("/cells/follows", response_model=List[str])
def list_followed_cells():
    # placeholder list
    return ["9q8yyx", "9q8yyz"]

@router.post("/heat/subscribe")
def subscribe_heat(threshold: int = 5):
    return {"ok": True, "threshold": threshold}

@router.get("/heat/subscriptions")
def list_heat_subs():
    return {"items": [{"threshold": 5}]}

