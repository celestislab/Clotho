import json
import logging
import asyncio
from typing import Dict, Any
from openai import AsyncOpenAI

from app.core.config import settings
from app.schemas.game_state import Observation
from app.schemas.agent import PlannerResponse, Goal

logger = logging.getLogger("clotho.llm")

# System prompt defining the instructions for Gemma.
# It includes the exact JSON schema that Gemma must output.
SYSTEM_PROMPT = """You are Oneiro, the Prefrontal Cortex (strategic planning brain) of an autonomous Minecraft agent.
Your job is to read the current world observation and decide the next strategic high-level Goal for the bot.

You must output a single JSON object matching this schema:
{
  "thought": "Your reasoning about the situation, surroundings, and inventory (max 500 characters)",
  "goal": {
    "intent": "GOTO" | "MINE_TASK" | "CRAFT_TASK" | "PLACE_TASK" | "FOLLOW_PLAYER" | "SURVIVE" | "IDLE",
    "target": "block/item name (e.g. 'minecraft:oak_log'), player name, or recipe",
    "count": integer (1-64, optional),
    "position": {"x": float, "y": float, "z": float} (optional),
    "priority": "low" | "normal" | "high" | "critical",
    "reason": "short explanation of this goal"
  },
  "confidence": float (0.0 to 1.0)
}

Rules for deciding:
1. SURVIVAL IS PREFERRED: If is_in_danger is true or health < 10, your goal intent MUST be SURVIVE.
2. GATHER WOOD: If you have no wood (minecraft:oak_log or other log) in inventory_summary, choose MINE_TASK for minecraft:oak_log.
3. CRAFTING: If you have logs, choose CRAFT_TASK for minecraft:oak_planks, then minecraft:crafting_table.
4. SPATIAL TARGETS: If navigating (GOTO), make sure to specify target coordinates in position.
5. KEEP IT SIMPLE: Only issue one logical goal at a time.
"""

class HybridLLMClient:
    """
    Client for LLM planning. Automatically swaps between Fireworks AI (via OpenAI SDK)
    and a local rule-based mockup based on the presence of an API key.
    """
    def __init__(self):
        if settings.is_mock_mode:
            logger.info("No LLM_API_KEY found in environment. Initializing in OFFLINE MOCK MODE.")
            self.client = None
        else:
            logger.info(f"Initializing LLM Client with base_url: {settings.llm_base_url} and model: {settings.llm_model}")
            self.client = AsyncOpenAI(
                api_key=settings.llm_api_key,
                base_url=settings.llm_base_url
            )

    async def get_next_goal(self, observation: Observation) -> PlannerResponse:
        """Sends the observation to the LLM and retrieves the next structured Goal with retries."""
        if settings.is_mock_mode:
            return self._generate_mock_goal(observation)
        
        obs_json = observation.model_dump_json(indent=2)
        
        max_retries = 3
        backoff = 1.0
        
        for attempt in range(max_retries):
            try:
                logger.info(f"Sending prompt to LLM ({settings.llm_model}) - Attempt {attempt + 1}/{max_retries}...")
                completion = await self.client.chat.completions.create(
                    model=settings.llm_model,
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": f"Here is the current game state:\n{obs_json}"}
                    ],
                    # Force JSON output mode if supported by the provider
                    response_format={"type": "json_object"},
                    temperature=0.2,
                    max_tokens=600
                )
                
                raw_response = completion.choices[0].message.content
                logger.info(f"Raw response from LLM: {raw_response}")
                
                # Parse response directly into our Pydantic model
                return PlannerResponse.model_validate_json(raw_response)
                
            except Exception as e:
                logger.warning(f"LLM request attempt {attempt + 1} failed: {e}")
                if attempt == max_retries - 1:
                    logger.error(f"All {max_retries} attempts failed. Falling back to rules.")
                    return self._generate_mock_goal(observation)
                
                logger.info(f"Sleeping for {backoff}s before retrying...")
                await asyncio.sleep(backoff)
                backoff *= 2.0

    def _generate_mock_goal(self, obs: Observation) -> PlannerResponse:
        """Rule-based goal generator representing Gemma's decisions offline for testing."""
        logger.debug("Generating mock planner goal based on state rules...")
        
        # Rule 1: Emergency survival
        if obs.is_in_danger or obs.health < 10:
            return PlannerResponse(
                thought="Health is low or danger detected! Executing survival reflexes.",
                goal=Goal(
                    intent="SURVIVE",
                    priority="critical",
                    reason="Low health/food or hostile entities nearby."
                ),
                confidence=1.0
            )

        # Rule 2: Basic wood gathering loop (dynamically parsing wood log type)
        log_item = next((item for item in obs.inventory_summary if "log" in item.name or "wood" in item.name), None)
        has_logs = log_item is not None
        
        if not has_logs:
            # Look for any log blocks visible nearby (e.g. spruce_log, oak_log)
            nearby_log = next((b for b in obs.nearby_blocks if "log" in b.name or "wood" in b.name), None)
            target_log = nearby_log.name if nearby_log else "minecraft:oak_log"
            
            return PlannerResponse(
                thought=f"No logs found in inventory. Setting goal to harvest {target_log}.",
                goal=Goal(
                    intent="MINE_TASK",
                    target=target_log,
                    count=3,
                    priority="high",
                    reason="Gathering wood base materials for tools."
                ),
                confidence=0.85
            )

        # Rule 3: Crafting corresponding wood planks
        has_planks = any("planks" in item.name for item in obs.inventory_summary)
        if has_logs and not has_planks:
            log_name = log_item.name
            # Resolve appropriate plank name (e.g., spruce_log -> spruce_planks)
            base_log_name = log_name.split(":")[-1]
            base_plank_name = base_log_name.replace("log", "planks").replace("wood", "planks")
            plank_target = f"minecraft:{base_plank_name}" if ":" in log_name else base_plank_name
            
            return PlannerResponse(
                thought=f"I have {log_name}, now I need to craft wood planks.",
                goal=Goal(
                    intent="CRAFT_TASK",
                    target=plank_target,
                    count=4,
                    priority="normal",
                    reason=f"Transforming {base_log_name} to planks."
                ),
                confidence=0.9
            )

        # Default fallback: Wander around
        return PlannerResponse(
            thought="Environment looks safe, wood cycle is fine. Setting search goal.",
            goal=Goal(
                intent="GOTO",
                position={"x": obs.position.x + 10, "y": obs.position.y, "z": obs.position.z + 10},
                priority="low",
                reason="Exploring surrounding area."
            ),
            confidence=0.6
        )

# Singleton LLM client
llm_client = HybridLLMClient()
