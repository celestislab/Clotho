from typing import Optional, Literal
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
    "IDLE",
]

class Goal(BaseModel):
    intent: IntentType
    target: Optional[str] = Field(default=None, description="Block type (minecraft:oak_log), player name, or recipe id")
    count: Optional[int] = Field(default=None, ge=1, le=64)
    position: Optional[Position] = None
    priority: Literal["low", "normal", "high", "critical"] = "normal"
    reason: str = Field(default="", max_length=300, description="Why this goal was chosen")

class PlannerResponse(BaseModel):
    goal: Goal
    thought: str = Field(..., max_length=500, description="Brief reasoning about current situation and chosen goal")
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)

class GoalResult(BaseModel):
    goal_id: str
    success: bool
    message: str
    steps_taken: int
    elapsed_ms: float
