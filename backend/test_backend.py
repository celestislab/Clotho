import sys
import os
from unittest.mock import AsyncMock, patch

# Ensure the app folder is in the python path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from fastapi.testclient import TestClient
from app.main import app
from app.schemas.game_state import Observation, Position, ItemStack
from app.schemas.agent import GoalResult

# Initialize the FastAPI TestClient
client = TestClient(app)

# Create a sample fake observation to simulate Minecraft state
FAKE_OBSERVATION = Observation(
    timestamp=123456789.0,
    health=18.0,
    food=16.0,
    saturation=10.0,
    position=Position(x=10.0, y=64.0, z=20.0),
    biome="plains",
    time_of_day="day",
    is_in_danger=False,
    equipped_item="minecraft:wooden_axe",
    inventory_summary=[
        ItemStack(name="minecraft:oak_log", count=2),
        ItemStack(name="minecraft:dirt", count=5)
    ],
    nearby_blocks=[],
    nearby_entities=[],
    terrain_relief={
        "center": -1.0,
        "north": 0.0,
        "south": 0.0,
        "east": 0.0,
        "west": 0.0,
        "highest_nearby_block": "minecraft:grass_block",
        "lowest_nearby_block": "minecraft:stone"
    },
    recent_events=["Spawned in world"]
)

# Create a sample goal result to simulate Minecraft executing a goal
FAKE_GOAL_RESULT = GoalResult(
    goal_id="goal_123",
    success=True,
    message="Task completed successfully",
    steps_taken=5,
    elapsed_ms=1200.0
)

@patch("app.main.mcp_client")  # Mock mcp_client in main lifecycle
@patch("app.api.routes.planner")  # Mock the planner in routes
def test_root_endpoint(mock_planner, mock_mcp):
    """Tests that the root endpoint is online and correctly reports status."""
    response = client.get("/")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["status"] == "online"
    assert "service" in json_data

@patch("app.services.planner.mcp_client")
def test_manual_step_endpoint(mock_mcp):
    """
    Tests the POST /agent/step route.
    Mocks the MCP client returns, verifies that the planning step:
    1. Grabs the state.
    2. Runs prompt/mock rules.
    3. Calls the TS bridge.
    4. Returns a success summary.
    """
    # Program our mock MCP client to return our fake state and action completion
    mock_mcp.get_state = AsyncMock(return_value=FAKE_OBSERVATION)
    mock_mcp.set_goal = AsyncMock(return_value=FAKE_GOAL_RESULT)

    # Make the HTTP POST call
    response = client.post("/agent/step")
    assert response.status_code == 200
    
    data = response.json()
    assert data["success"] is True
    assert "thought" in data
    assert "goal" in data
    assert data["result"]["success"] is True
    assert data["result"]["message"] == "Task completed successfully"

    # Verify that get_state and set_goal were indeed called
    mock_mcp.get_state.assert_called_once()
    mock_mcp.set_goal.assert_called_once()

@patch("app.api.routes.planner")
def test_start_stop_endpoints(mock_planner):
    """Tests starting and stopping the background loop control routes."""
    # Program planner mock properties
    mock_planner.is_active = False
    mock_planner.start = AsyncMock()
    mock_planner.stop = AsyncMock()

    # Test Start Route
    response = client.post("/agent/start")
    assert response.status_code == 200
    assert response.json()["status"] == "started"
    mock_planner.start.assert_called_once()

    # Test Stop Route
    mock_planner.is_active = True
    response = client.post("/agent/stop")
    assert response.status_code == 200
    assert response.json()["status"] == "stopped"
    mock_planner.stop.assert_called_once()

if __name__ == "__main__":
    import pytest
    print("Running backend tests...")
    # Invoke pytest programmatically on this file
    sys.exit(pytest.main([__file__, "-v"]))
