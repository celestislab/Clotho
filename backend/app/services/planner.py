import asyncio
import logging
from typing import Optional

from app.core.config import settings
from app.services.mcp_client import mcp_client
from app.services.llm import llm_client
from app.schemas.agent import Goal, GoalResult

logger = logging.getLogger("clotho.planner")

class AutonomousPlanner:
    """
    The "Prefrontal Cortex" of Oneiro. Coordinates the cognitive loop:
    1. Observe the environment (get_state).
    2. Think and decide on a strategy (llm_client.get_next_goal).
    3. Execute the actions (set_goal).
    """
    def __init__(self):
        self.is_active = False
        self.current_goal: Optional[Goal] = None
        self.last_thought: str = "No planning cycle has run yet."
        self.last_result: Optional[GoalResult] = None
        self.last_state: Optional[dict] = None
        self.history = []  # Rolling memory buffer of past thoughts, goals, and results
        self._task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        """Starts the autonomous cognitive loop in the background."""
        async with self._lock:
            if self.is_active:
                logger.warning("Planner loop is already active.")
                return
            self.is_active = True
            # Clear history on loop start
            self.history.clear()
            # Spawn the ticker as a background task on the asyncio event loop
            self._task = asyncio.create_task(self._loop())
            logger.info("Autonomous planner loop activated.")

    async def stop(self) -> None:
        """Stops the autonomous loop and cancels the background task."""
        async with self._lock:
            if not self.is_active:
                return
            self.is_active = False
            if self._task:
                logger.info("Canceling planner background task...")
                self._task.cancel()
                try:
                    await self._task
                except asyncio.CancelledError:
                    pass  # Graceful cancellation
                self._task = None
            logger.info("Autonomous planner loop deactivated.")

    async def run_single_step(self) -> dict:
        """
        Executes a single step of the Observe-Plan-Act cycle.
        Returns a summary dictionary for logging and status tracking.
        """
        logger.info("---- START PLANNING CYCLE ----")
        try:
            # 1. OBSERVE: Fetch the latest game state from the TS MCP server
            logger.info("[Planner] Fetching game state...")
            state = await mcp_client.get_state()
            self.last_state = state.model_dump()
            logger.info(f"[Planner] State: HP={state.health:.0f} Food={state.food:.0f} danger={state.is_in_danger}")
            
            # 2. PLAN: Pass the state and memory history to LLM to decide next goal
            logger.info("[Planner] Planning next goal with LLM...")
            planner_response = await llm_client.get_next_goal(state, self.history)
            self.last_thought = planner_response.thought
            self.current_goal = planner_response.goal
            
            logger.info(f"[Planner] Thought: '{self.last_thought}'")
            logger.info(f"[Planner] Chosen Goal: {self.current_goal.intent} target={self.current_goal.target}")
            
            # 3. ACT: Send the goal down to Minecraft and block until it completes/fails
            logger.info("[Planner] Sending goal to Minecraft body...")
            result = await mcp_client.set_goal(self.current_goal)
            self.last_result = result
            
            # Record execution outcome into rolling memory history
            self.history.append({
                "thought": self.last_thought,
                "goal": self.current_goal.model_dump(exclude_none=True),
                "result": {
                    "success": result.success,
                    "message": result.message
                }
            })
            if len(self.history) > 5:
                self.history.pop(0)
            
            logger.info(f"[Planner] Goal Result: success={result.success} steps={result.steps_taken} elapsed={result.elapsed_ms/1000:.1f}s message='{result.message}'")
            logger.info("---- END PLANNING CYCLE (SUCCESS) ----")
            
            return {
                "success": True,
                "thought": self.last_thought,
                "goal": self.current_goal.model_dump(exclude_none=True),
                "result": self.last_result.model_dump()
            }
            
        except Exception as e:
            logger.error(f"Exception during planning cycle execution: {e}", exc_info=True)
            logger.info("---- END PLANNING CYCLE (ERROR) ----")
            return {
                "success": False,
                "error": str(e)
            }

    async def _loop(self) -> None:
        """Background loop runner executing steps continuously at the configured interval."""
        while self.is_active:
            await self.run_single_step()
            
            # Sleep until next interval, allowing cancellation
            logger.info(f"Sleeping for {settings.loop_interval_seconds}s before next plan...")
            try:
                await asyncio.sleep(settings.loop_interval_seconds)
            except asyncio.CancelledError:
                logger.info("Background loop cancelled during sleep.")
                break

# Singleton planner controller
planner = AutonomousPlanner()
