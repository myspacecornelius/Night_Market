from fastapi import APIRouter

router = APIRouter()

@router.get("/quests/progress")
def get_progress():
    return {"streak": 3, "today": 2, "weekly": 8}

@router.post("/quests/complete")
def complete_quest(quest_id: str):
    return {"ok": True, "quest_id": quest_id}

@router.get("/leaderboard")
def leaderboard():
    return {"items": [{"user": "anon", "score": 120}]}

