"""Quests and the quest leaderboard.

PLACEHOLDERS: there is no quest catalogue and nothing is stored yet. Progress and the
leaderboard are fixed sample data, and completing a quest only validates the id's
format. They require a signed-in user so the contract matches the real feature.
"""
from fastapi import APIRouter, Depends, Query

from services.core.auth import get_current_active_user

router = APIRouter(dependencies=[Depends(get_current_active_user)])

@router.get("/quests/progress")
def get_progress():
    return {"streak": 3, "today": 2, "weekly": 8}

@router.post("/quests/complete")
def complete_quest(quest_id: str = Query(..., min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")):
    return {"ok": True, "quest_id": quest_id}

@router.get("/leaderboard")
def leaderboard():
    return {"items": [{"user": "anon", "score": 120}]}
