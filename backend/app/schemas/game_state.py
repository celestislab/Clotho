from typing import List, Optional, Literal
from pydantic import BaseModel, Field

class Position(BaseModel):
    x: float
    y: float
    z: float

class ItemStack(BaseModel):
    name: str
    count: int = Field(..., ge=1, le=64)
    displayName: Optional[str] = None

class NearbyBlock(BaseModel):
    name: str
    count: int = Field(..., ge=1)
    closest_distance: float
    direction: Literal["north", "south", "east", "west", "up", "down", "nearby"]

class NearbyEntity(BaseModel):
    name: str
    type: Literal["mob", "player", "animal", "item"]
    position: Position
    distance: float
    is_hostile: bool

class TerrainRelief(BaseModel):
    center: float = Field(..., description="Relative height under feet")
    north: float = Field(..., description="Relative height 3 blocks North")
    south: float = Field(..., description="Relative height 3 blocks South")
    east: float = Field(..., description="Relative height 3 blocks East")
    west: float = Field(..., description="Relative height 3 blocks West")
    highest_nearby_block: Optional[str] = Field(default=None)
    lowest_nearby_block: Optional[str] = Field(default=None)

class Observation(BaseModel):
    timestamp: float
    health: float = Field(..., ge=0, le=20)
    food: float = Field(..., ge=0, le=20)
    saturation: float = Field(..., ge=0, le=20)
    oxygen: Optional[float] = Field(default=None, ge=0, le=20)
    position: Position
    biome: str
    time_of_day: Literal["day", "night", "dusk", "dawn"]
    is_in_danger: bool
    equipped_item: str
    inventory_summary: List[ItemStack] = Field(default_factory=list)
    nearby_blocks: List[NearbyBlock] = Field(default_factory=list)
    nearby_entities: List[NearbyEntity] = Field(default_factory=list)
    terrain_relief: TerrainRelief
    recent_events: List[str] = Field(default_factory=list)
