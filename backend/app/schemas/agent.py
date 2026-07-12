from typing import Optional, Literal, List
from pydantic import BaseModel, Field
from .game_state import Position

# High-level actions the bot is capable of executing
IntentType = Literal[
    "GOTO",
    "MINE_TASK",
    "CRAFT_TASK",
    "PLACE_TASK",
    "FOLLOW_PLAYER",
    "SURVIVE",
    "EQUIP_TASK",
    "SMELT_TASK",
    "DROP_TASK",
    "ATTACK_TASK",
    "DEPOSIT_TASK",
    "WITHDRAW_TASK",
    "IDLE",
]

class Goal(BaseModel):
    intent: IntentType
    target: Optional[str] = Field(default=None, description="Block type (minecraft:oak_log), player name, or recipe id")
    count: Optional[int] = Field(default=None, ge=1, le=10000)
    position: Optional[Position] = None
    priority: Literal["low", "normal", "high", "critical"] = "normal"
    reason: str = Field(default="", max_length=300, description="Why this goal was chosen")
    chat: Optional[str] = Field(default=None, max_length=200, description="Optional chat message in Russian, friendly, cute tone, can complain or joke")

class PlannerResponse(BaseModel):
    goals: List[Goal] = Field(..., description="List of sequential goals to execute (up to 8)")
    thought: str = Field(..., max_length=500, description="Brief reasoning about current situation and chosen goals")
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)

class GoalResult(BaseModel):
    goal_id: str
    success: bool
    message: str
    steps_taken: int
    elapsed_ms: float
