from fastapi import APIRouter, HTTPException
from app.services.planner import planner

# Set up API router with '/agent' prefix and tag for Swagger grouping
router = APIRouter(prefix="/agent", tags=["Agent Controller"])

@router.post("/step", summary="Trigger a single planning cycle")
async def execute_step():
    """
    Executes exactly one Observe-Plan-Act cycle.
    Grabs Minecraft state, asks Gemma for the next goal,
    sends it to Minecraft, and returns the result.
    """
    summary = await planner.run_single_step()
    if not summary.get("success"):
        raise HTTPException(status_code=500, detail=summary.get("error"))
    return summary

@router.post("/start", summary="Start autonomous background loop")
async def start_agent():
    """
    Spawns the planning cycle in the background.
    It will run continuously every N seconds.
    """
    if planner.is_active:
        return {"status": "already_running", "message": "Autonomous planner loop is already active."}
    await planner.start()
    return {"status": "started", "message": "Autonomous planner loop activated successfully."}

@router.post("/stop", summary="Stop autonomous background loop")
async def stop_agent():
    """
    Terminates the background planning cycle.
    Any active goal in Minecraft will continue executing, but no new goals will be generated.
    """
    if not planner.is_active:
        return {"status": "not_running", "message": "Autonomous planner loop is already idle."}
    await planner.stop()
    return {"status": "stopped", "message": "Autonomous planner loop deactivated successfully."}

@router.get("/status", summary="Get status for dashboard")
async def get_status():
    """
    Returns the current status of the planning loop:
    - active status (running/stopped)
    - current goal and reasoning (thought)
    - last execution result (success/elapsed time)
    - last observed game state (health, position, inventory)
    """
    return planner.get_status_summary()
