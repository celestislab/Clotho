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
        # Score System
        self.score = 0
        self.discovered_items = set()
        self.achievements = []
        self.prev_health = 20.0
        self.visited_chunks = set()
        self.world_memory = [] # Unique DB of known block positions (ore, tables, furnaces)

    def save_memory(self, state=None) -> None:
        import json
        import os
        import time
        memory_dir = settings.memory_dir
        os.makedirs(memory_dir, exist_ok=True)
        memory_path = os.path.join(memory_dir, "planner_memory.json")
        try:
            data = {
                "score": self.score,
                "discovered_items": list(self.discovered_items),
                "achievements": self.achievements,
                "prev_health": self.prev_health,
                "visited_chunks": list(self.visited_chunks),
                "history": [h if isinstance(h, str) else str(h) for h in self.history]
            }
            with open(memory_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            logger.info(f"[Memory] Saved planner memory to {memory_path}")
        except Exception as e:
            logger.error(f"[Memory] Failed to save memory: {e}")

        # Save world memory database
        world_memory_path = os.path.join(memory_dir, "world_memory.json")
        try:
            with open(world_memory_path, "w", encoding="utf-8") as f:
                json.dump(self.world_memory, f, ensure_ascii=False, indent=2)
            logger.info(f"[Memory] Saved world memory to {world_memory_path}")
        except Exception as e:
            logger.error(f"[Memory] Failed to save world memory: {e}")

        # Save live inventory viewer artifact (optional, for debugging dashboards)
        if state:
            inventory_viewer_path = os.path.join(memory_dir, "inventory_viewer.md")
            try:
                with open(inventory_viewer_path, "w", encoding="utf-8") as f:
                    f.write("# Oneiro Live Inventory\n\n")
                    f.write(f"**Health:** {state.health:.1f} / 20.0 | **Food:** {state.food:.1f} / 20.0 | **Score:** {self.score}\n\n")
                    f.write("### Inventory Items\n\n")
                    f.write("| Item | Count |\n")
                    f.write("| :--- | :--- |\n")
                    if hasattr(state, "inventory_summary") and state.inventory_summary:
                        for item in state.inventory_summary:
                            display = item.displayName or item.name
                            f.write(f"| {display} | {item.count} |\n")
                    else:
                        f.write("| *Inventory empty* | |\n")
                    f.write("\n\n*Updated: " + time.strftime("%Y-%m-%d %H:%M:%S") + "*\n")
                logger.info(f"[Memory] Saved live inventory view to {inventory_viewer_path}")
            except Exception as e:
                logger.error(f"[Memory] Failed to save inventory viewer: {e}")

    def load_memory(self) -> None:
        import json
        import os
        memory_path = os.path.join(settings.memory_dir, "planner_memory.json")
        if not os.path.exists(memory_path):
            logger.info("[Memory] No saved memory found. Starting fresh.")
            self.history.clear()
            self.score = 0
            self.discovered_items.clear()
            self.achievements.clear()
            self.prev_health = 20.0
            self.visited_chunks.clear()
            self.world_memory = []
            return
        try:
            with open(memory_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.score = data.get("score", 0)
            self.discovered_items = set(data.get("discovered_items", []))
            self.achievements = data.get("achievements", [])
            self.prev_health = data.get("prev_health", 20.0)
            self.visited_chunks = set(tuple(c) for c in data.get("visited_chunks", []))
            self.history = data.get("history", [])
            logger.info(f"[Memory] Successfully loaded planner memory from {memory_path} (Score: {self.score})")
        except Exception as e:
            logger.error(f"[Memory] Failed to load memory: {e}")

        # Load world memory
        world_memory_path = os.path.join(settings.memory_dir, "world_memory.json")
        if os.path.exists(world_memory_path):
            try:
                with open(world_memory_path, "r", encoding="utf-8") as f:
                    self.world_memory = json.load(f)
                logger.info(f"[Memory] Loaded {len(self.world_memory)} known locations from world memory.")
            except Exception as e:
                logger.error(f"[Memory] Failed to load world memory: {e}")
                self.world_memory = []
        else:
            self.world_memory = []

    async def start(self) -> None:
        """Starts the autonomous cognitive loop in the background."""
        async with self._lock:
            if self.is_active:
                logger.warning("Planner loop is already active.")
                return
            self.is_active = True
            # Load memory from disk
            self.load_memory()
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

    def update_score(self, state) -> None:
        # 1. Check for health changes (damage / healing)
        health_diff = state.health - self.prev_health
        if health_diff < 0:
            # Took damage
            penalty = int(health_diff * 5)  # e.g., -5 points per half-heart lost
            self.score += penalty
            logger.info(f"[Score] Took damage! Lost {-penalty} points. Current Score: {self.score}")
        elif health_diff > 0:
            # Healed
            reward = int(health_diff * 2)
            self.score += reward
            logger.info(f"[Score] Healed! Gained {reward} points. Current Score: {self.score}")
        self.prev_health = state.health

        # 2. Check for deaths
        if state.health <= 0 and self.prev_health > 0:
            self.score -= 100
            self.achievements.append("Died (Penalty: -100)")
            logger.info(f"[Score] Died! Lost 100 points. Current Score: {self.score}")

        # 3. Check for discovery of new items in inventory
        for item in state.inventory_summary:
            if item.name not in self.discovered_items:
                self.discovered_items.add(item.name)
                reward = 20
                # Tools and weapons yield higher score
                if any(tool_type in item.name for tool_type in ["pickaxe", "axe", "shovel", "sword", "crafting_table", "chest"]):
                    reward = 50
                self.score += reward
                achievement_msg = f"Discovered {item.displayName or item.name} (+{reward})"
                self.achievements.append(achievement_msg)
                logger.info(f"[Score] {achievement_msg}! Current Score: {self.score}")

        # 4. Check for spatial exploration (new chunk visited)
        if state.position and state.position.x is not None and state.position.z is not None:
            chunk_coords = (int(state.position.x // 16), int(state.position.z // 16))
            if chunk_coords not in self.visited_chunks:
                self.visited_chunks.add(chunk_coords)
                if len(self.visited_chunks) > 1: # don't award points for spawning chunk
                    self.score += 5
                    logger.info(f"[Score] Explored new chunk {chunk_coords}! Gained 5 points. Current Score: {self.score}")

        # 5. Check for goal success
        if self.last_result and self.last_result.success:
            # We only award goal success once per goal to prevent double counting
            if not getattr(self, '_last_result_counted', False):
                reward = 10
                # High priority goals yield more points
                if self.current_goal:
                    if self.current_goal.priority == "high":
                        reward = 25
                    elif self.current_goal.priority == "critical":
                        reward = 50
                self.score += reward
                logger.info(f"[Score] Successfully completed goal! Gained {reward} points. Current Score: {self.score}")
                self._last_result_counted = True
        else:
            self._last_result_counted = False

    def update_world_memory(self, state) -> None:
        import time
        # Interesting blocks to remember
        interesting_types = [
            "crafting_table", "furnace", "chest", 
            "coal_ore", "copper_ore", "iron_ore", "gold_ore", "redstone_ore", "lapis_ore", "diamond_ore",
            "deepslate_coal_ore", "deepslate_copper_ore", "deepslate_iron_ore", "deepslate_gold_ore",
            "deepslate_redstone_ore", "deepslate_lapis_ore", "deepslate_diamond_ore"
        ]
        
        # 1. Update/Add visible blocks
        visible_map = {}
        for block in getattr(state, "visible_blocks", []):
            name = block.name
            clean_name = name.split(":")[-1] if ":" in name else name
            visible_map[(int(block.position.x), int(block.position.y), int(block.position.z))] = name
            
            if any(t in clean_name for t in interesting_types):
                coords = (int(block.position.x), int(block.position.y), int(block.position.z))
                existing = next((loc for loc in self.world_memory if loc["x"] == coords[0] and loc["y"] == coords[1] and loc["z"] == coords[2]), None)
                
                if existing:
                    existing["name"] = name
                    existing["last_seen"] = time.time()
                else:
                    self.world_memory.append({
                        "name": name,
                        "x": coords[0],
                        "y": coords[1],
                        "z": coords[2],
                        "last_seen": time.time()
                    })
                    logger.info(f"[WorldMemory] Discovered and remembered interesting block: {name} at {coords}")

        # 2. Verify and remove stale blocks
        to_remove = []
        for loc in self.world_memory:
            coords = (loc["x"], loc["y"], loc["z"])
            if coords in visible_map:
                current_name = visible_map[coords]
                if current_name != loc["name"]:
                    to_remove.append(loc)
                    logger.info(f"[WorldMemory] Block {loc['name']} at {coords} is no longer there (now {current_name}). Removing from memory.")
        
        for r in to_remove:
            if r in self.world_memory:
                self.world_memory.remove(r)

    async def run_single_step(self) -> dict:
        """
        Executes a single step of the Observe-Plan-Act cycle.
        Now supports executing a sequence of up to 8 goals sequentially.
        """
        logger.info("---- START PLANNING CYCLE ----")
        try:
            # 1. OBSERVE: Fetch the latest game state from the TS MCP server
            logger.info("[Planner] Fetching game state...")
            state = await mcp_client.get_state()
            self.last_state = state.model_dump()
            logger.info(f"[Planner] State: HP={state.health:.0f} Food={state.food:.0f} danger={state.is_in_danger}")
            
            # Update Score and World Memory based on new state observations
            self.update_score(state)
            self.update_world_memory(state)
            
            # 2. PLAN: Pass the state, memory history, score, achievements and world memory to LLM
            logger.info("[Planner] Planning next goals sequence with LLM...")
            planner_response = await llm_client.get_next_goal(state, self.history, score=self.score, achievements=self.achievements, world_memory=self.world_memory)
            self.last_thought = planner_response.thought
            goals_to_execute = planner_response.goals
            
            logger.info(f"[Planner] Thought: '{self.last_thought}'")
            logger.info(f"[Planner] Planned sequence of {len(goals_to_execute)} goals.")
            
            executed_goals = []
            
            # 3. ACT: Send goals down to Minecraft sequentially and block until each completes/fails
            for idx, goal in enumerate(goals_to_execute):
                if not self.is_active:
                    logger.info("[Planner] Loop deactivated. Stopping goal execution sequence.")
                    break
                    
                self.current_goal = goal
                logger.info(f"[Planner] [{idx+1}/{len(goals_to_execute)}] Sending goal: {goal.intent} target={goal.target}")
                
                result = await mcp_client.set_goal(goal)
                self.last_result = result
                executed_goals.append({
                    "goal": goal.model_dump(exclude_none=True),
                    "result": result.model_dump()
                })
                
                # Fetch new state after this goal's completion to update score
                state = await mcp_client.get_state()
                self.last_state = state.model_dump()
                self.update_score(state)
                self.update_world_memory(state)
                
                logger.info(f"[Planner] Goal [{idx+1}] Result: success={result.success} message='{result.message}'")
                
                if not result.success:
                    logger.warning(f"[Planner] Goal [{idx+1}] failed! Aborting remaining goals in sequence.")
                    break
            
            # Record execution outcome into rolling memory history
            self.history.append({
                "thought": self.last_thought,
                "executed_goals": executed_goals,
                "success": all(g["result"]["success"] for g in executed_goals) if executed_goals else False
            })
            if len(self.history) > 5:
                self.history.pop(0)
            
            # Save memory to disk to persist achievements & score
            self.save_memory(state)
            
            logger.info("---- END PLANNING CYCLE (SUCCESS) ----")
            
            return {
                "success": True,
                "thought": self.last_thought,
                "goals_executed": executed_goals,
            }
            
        except Exception as e:
            logger.error(f"Exception during planning cycle execution: {e}", exc_info=True)
            logger.info("---- END PLANNING CYCLE (ERROR) ----")
            return {
                "success": False,
                "error": str(e)
            }

    def get_status_summary(self) -> dict:
        return {
            "is_active": self.is_active,
            "current_goal": self.current_goal.model_dump(exclude_none=True) if self.current_goal else None,
            "last_thought": self.last_thought,
            "last_result": self.last_result.model_dump() if self.last_result else None,
            "last_state": self.last_state,
            "score": self.score,
            "achievements": self.achievements[-10:],
        }

    async def _loop(self) -> None:
        """Background loop runner executing steps continuously at the configured interval."""
        while self.is_active:
            await self.run_single_step()
            
            # Sleep in small increments and poll state for interrupts (chat/danger)
            sleep_time = settings.loop_interval_seconds
            step = 2.0
            elapsed = 0.0
            logger.info(f"Sleeping for {sleep_time}s before next plan (polling for chat/danger interrupts)...")
            while elapsed < sleep_time and self.is_active:
                try:
                    await asyncio.sleep(step)
                    elapsed += step
                    # Quick state check
                    state = await mcp_client.get_state()
                    # Check if player sent a new chat message or danger arose
                    player = settings.player_name.strip()
                    has_new_chat = player and any(f"[Chat] {player}" in e for e in state.recent_events)
                    if has_new_chat or state.is_in_danger:
                        logger.info("[Planner] Interrupt detected! New player chat or danger during sleep. Waking up immediately!")
                        break
                except asyncio.CancelledError:
                    logger.info("Background loop cancelled during sleep.")
                    return
                except Exception as e:
                    logger.warning(f"Error during sleep state polling: {e}")
                    await asyncio.sleep(step)
                    elapsed += step

# Singleton planner controller
planner = AutonomousPlanner()
