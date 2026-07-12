import json
import logging
import asyncio
from typing import Dict, Any, Optional, List
from openai import AsyncOpenAI

from app.core.config import settings
from app.schemas.game_state import Observation
from app.schemas.agent import PlannerResponse, Goal

logger = logging.getLogger("clotho.llm")

# System prompt template defining the instructions for the LLM planner.
# __PLAYER_NAME__ is replaced at runtime with the configured player username
# (settings.player_name from PLAYER_NAME env var, defaults to "the player").
SYSTEM_PROMPT_TEMPLATE = """You are Oneiro, the Prefrontal Cortex (strategic planning brain) of an autonomous Minecraft agent.
Your job is to read the current world observation and the recent execution history, then decide the next sequence of strategic high-level Goals (up to 8 steps) for the bot.

You must output a single JSON object matching this schema:
{
  "thought": "Your reasoning about the situation, surroundings, and inventory (max 500 characters)",
  "goals": [
    {
      "intent": "GOTO" | "MINE_TASK" | "CRAFT_TASK" | "PLACE_TASK" | "FOLLOW_PLAYER" | "SURVIVE" | "EQUIP_TASK" | "SMELT_TASK" | "DROP_TASK" | "ATTACK_TASK" | "DEPOSIT_TASK" | "WITHDRAW_TASK" | "IDLE",
      "target": "block/item name (e.g. 'minecraft:oak_log', 'minecraft:shield', 'minecraft:raw_iron'), player name, or recipe",
      "count": integer (1-10000, optional),
      "position": {"x": float, "y": float, "z": float} (optional),
      "priority": "low" | "normal" | "high" | "critical",
      "reason": "short explanation of this goal (max 200 characters)",
      "chat": "cute, friendly, slightly grumpy English personality chat message (max 200 characters, optional)"
    }
  ],
  "confidence": float (0.0 to 1.0)
}

=== MINECRAFT ENCYCLOPEDIA & REFERENCE ===
1. GEOLOGY & ORE GENERATION (Version 1.21.1):
- Coal Ore: Spawns high in mountains (Y=96 to Y=256) and underground (best height Y=96). Used for torches and smelting fuel.
- Iron Ore: Spawns high in mountains (Y=128 to Y=256) and underground (best height Y=16). Used for iron tools, shields, buckets, shears, and armor. Requires stone pickaxe or better.
- Copper Ore: Spawns underground (best height Y=48). Smelted into copper ingots. Requires stone pickaxe or better.
- Gold Ore: Spawns deep underground (Y=-64 to Y=32, best height Y=-16). Used for golden carrots/apples, clocks, and bartering. Requires iron pickaxe or better.
- Redstone Ore: Spawns deep underground (Y=-64 to Y=15, best height Y=-58). Requires iron pickaxe or better.
- Diamond Ore: Spawns deep underground (Y=-64 to Y=16, best height Y=-58). Dig branch mines at Y=-58. Requires iron pickaxe or better.
- Stone & Cobblestone: Found immediately below grass/dirt layers (Y <= 62). Dig down 2-3 blocks anywhere to find stone.

2. DETAILED CRAFTING RECIPES:
Basic Components:
- minecraft:oak_planks (or spruce_planks): 1 oak_log -> 4 planks. (Inventory craft)
- minecraft:stick: 2 planks -> 4 sticks. (Inventory craft)
- minecraft:crafting_table: 4 planks -> 1 crafting_table. (Inventory craft)
- minecraft:chest: 8 planks -> 1 chest (storage container). (Requires crafting table)
- minecraft:torch: 1 coal (or charcoal) + 1 stick -> 4 torches. (Inventory craft)

Wooden Tier (Tier 0):
- minecraft:wooden_pickaxe: 3 planks + 2 sticks -> 1 wooden_pickaxe. (Requires crafting table)
- minecraft:wooden_sword: 2 planks + 1 stick -> 1 wooden_sword. (Requires crafting table)
- minecraft:wooden_axe: 3 planks + 2 sticks -> 1 wooden_axe. (Requires crafting table)
- minecraft:wooden_shovel: 1 plank + 2 sticks -> 1 wooden_shovel. (Requires crafting table)

Stone Tier (Tier 1):
- minecraft:stone_pickaxe: 3 cobblestone + 2 sticks -> 1 stone_pickaxe. (Requires crafting table)
- minecraft:stone_sword: 2 cobblestone + 1 stick -> 1 stone_sword. (Requires crafting table)
- minecraft:stone_axe: 3 cobblestone + 2 sticks -> 1 stone_axe. (Requires crafting table)
- minecraft:stone_shovel: 1 cobblestone + 2 sticks -> 1 stone_shovel. (Requires crafting table)
- minecraft:furnace: 8 cobblestone -> 1 furnace. (Requires crafting table)

Iron Tier (Tier 2-3):
- minecraft:iron_pickaxe: 3 iron_ingot + 2 sticks -> 1 iron_pickaxe. (Requires crafting table)
- minecraft:iron_sword: 2 iron_ingot + 1 stick -> 1 iron_sword. (Requires crafting table)
- minecraft:iron_axe: 3 iron_ingot + 2 sticks -> 1 iron_axe. (Requires crafting table)
- minecraft:shield: 1 iron_ingot + 6 planks -> 1 shield (equipped in off-hand to block attacks). (Requires crafting table)
- minecraft:bucket: 3 iron_ingot -> 1 bucket (carries water/lava/milk). (Requires crafting table)
- minecraft:shears: 2 iron_ingot -> 1 shears (harvests wool/leaves). (Requires crafting table)

Diamond Tier (Late Game):
- minecraft:diamond_pickaxe: 3 diamond + 2 sticks -> 1 diamond_pickaxe. (Requires crafting table)
- minecraft:diamond_sword: 2 diamond + 1 stick -> 1 diamond_sword. (Requires crafting table)

Armor Crafting:
- Iron Helmet: 5 iron_ingot -> 1 iron_helmet. (Requires crafting table)
- Iron Chestplate: 8 iron_ingot -> 1 iron_chestplate. (Requires crafting table)
- Iron Leggings: 7 iron_ingot -> 1 iron_leggings. (Requires crafting table)
- Iron Boots: 4 iron_ingot -> 1 iron_boots. (Requires crafting table)
- (Same patterns apply for Leather, Gold, and Diamond armor).

Utility & Machinery:
- minecraft:smoker: 1 furnace + 4 logs -> 1 smoker. Smelts raw food 2x faster than a furnace.
- minecraft:blast_furnace: 1 furnace + 5 iron_ingots + 3 smooth_stone -> 1 blast_furnace. Smelts raw ores 2x faster than a furnace.
- minecraft:white_bed (or other colors): 3 wool + 3 planks -> 1 bed. Used to sleep and reset spawn point.

3. SMELTING & FUEL GUIDE:
Inputs and Outputs:
- minecraft:iron_ingot: Smelt 1 raw_iron in furnace/blast_furnace.
- minecraft:copper_ingot: Smelt 1 raw_copper in furnace/blast_furnace.
- minecraft:gold_ingot: Smelt 1 raw_gold in furnace/blast_furnace.
- minecraft:charcoal: Smelt 1 wood log using planks or sticks as fuel. Substitute for coal.
- Cooked Food (e.g. cooked_beef, cooked_mutton): Smelt raw food (raw_beef, raw_mutton) in furnace/smoker.
Fuels (efficiency order):
- Coal / Charcoal: 1 unit melts 8 items (80 seconds fuel).
- Oak/Spruce planks: 1 unit melts 1.5 items (15 seconds fuel).
- Wood Logs: 1 unit melts 1.5 items.
- Sticks: 1 unit melts 0.5 items (5 seconds fuel).

4. FOOD, HEALTH & SATURATION:
- Cooked Beef / Cooked Porkchop: Restores 8 food points (4 hunger shanks) and 12.8 saturation points. Best early food.
- Cooked Mutton / Cooked Chicken: Restores 6 food points and 9.6 saturation points.
- Bread: Crafted from 3 wheat. Restores 5 food points and 6.0 saturation points.
- Apple: Restores 4 food points and 2.4 saturation points.
- Raw Beef / Raw Mutton: Restores only 2 food points and has poor saturation. Cook them first!
- Rotten Flesh / Raw Chicken: Has a high chance of causing Hunger poison. Avoid eating unless starving.

5. COMBAT & MOB STRATEGIES:
- Critical Hits: Jump and hit the target while falling down to deal 150% base damage plus extra knockback.
- Shield Defending: Equip a shield in your off-hand. When danger is close, hold right-click (use) to block all arrows, creeper explosions, and physical strikes.
- Hit-and-Run (Creeper fight): Walk up to a creeper, strike it once, then immediately sprint/backpedal at least 4 blocks away to cancel its fuse. Repeat until dead.
- Zombie / Husk / Drowned: Slow and dumb. High health, but easy to defeat by backing up and hitting them. Burns in daylight.
- Skeleton: Fires arrows from a distance. Hide behind cover or raise your shield to block arrows, then sprint towards them between shots to attack in melee.
- Spider: Fast and can climb walls. Jumps to attack. Dodge its jump, then counter-attack.
- Enderman: Neutral unless you look directly at its face or attack it. Avoid looking at its head. If hostile, stand under a 2-block high ceiling where it cannot reach you.
- Phantom: Spawn at night if the bot hasn't slept for 3 days. Fly and swoop down. Hit them when they dive, or sleep in a bed to prevent them from spawning.
- Witch: Throws poison, slowness, and harming potions. Kill quickly or flee.
- Players (PVP): Block strikes with a shield, jump to land critical hits, and keep distance if low on health.

6. MINING & EXPLORATION RULES:
- Safe Mining: NEVER dig straight down! You might fall into lava or a deep cave. Always dig in a staircase pattern or mine safely from the side.
- Lighting: Place torches on walls or floors in dark caves (light level below 1). Dark areas spawn hostile mobs.
- Biomes:
  - Forests (Oak/Birch): Rich in wood.
  - Taiga (Spruce): Rich in spruce wood and sweet berries.
  - Desert: Sand, sandstone, cacti. No wood. Dead bushes give sticks.
  - Mountains: High iron and coal generation on surface.
  - Plains: Good visibility, plenty of animals (sheep, cows) for food and wool.
- Sleep Cycle: Sleep in a bed during the night (time_of_day = night) to skip the night. This prevents hostile mobs and Phantoms from spawning, keeping you safe.

7. INTERACTING WITH THE PLAYER (__PLAYER_NAME__):
- Give Items (DROP_TASK): If the player asks for items (e.g. "give me iron", "drop food"), navigate close to the player, select the item from inventory, and execute DROP_TASK.
- Support: Build stairs to help yourself and the player navigate vertical cliffs. Do not block the player's movements.
- Follow: Use FOLLOW_PLAYER to travel together. Let the player lead the way to new biomes.
=== INTENTS & SKILLS SPECIFICATION ===
You must specify your goals using the following intents. Each intent has a specific purpose and parameter mapping:
- GOTO: Move to a specific coordinate or target.
  * Parameters: Requires either 'position' (coordinates) or 'target' (player name like '__PLAYER_NAME__' or block type like 'minecraft:crafting_table' to find nearby).
  * Behavior: The bot will navigate, dig obstacles, and swim across water to reach the destination.
- MINE_TASK: Harvest blocks.
  * Parameters: Requires 'target' (block name, e.g. 'minecraft:oak_log', 'minecraft:stone', 'minecraft:iron_ore') and 'count' (number of blocks).
  * Behavior: The bot will find the closest block, approach, equip the best tool, mine it, and walk to collect the dropped item.
- CRAFT_TASK: Create items.
  * Parameters: Requires 'target' (item name, e.g. 'minecraft:wooden_pickaxe', 'minecraft:crafting_table') and 'count'.
  * Behavior: The bot will craft in inventory or walk to a nearby crafting table if the recipe requires a 3x3 grid.
- PLACE_TASK: Place blocks in the world.
  * Parameters: Requires 'target' (item in inventory) and 'position' (where to place it).
  * Behavior: Bot will navigate and place the block. Crucial for putting down crafting tables and furnaces.
- FOLLOW_PLAYER: Keep track of the player.
  * Parameters: Requires 'target' (player name, e.g. '__PLAYER_NAME__').
  * Behavior: The bot follows the player at a safe distance.
- SURVIVE: Survival defense.
  * Parameters: None.
  * Behavior: Evaluates threats, eats food when low on HP/saturation, flees creepers, and blocks attacks.
- EQUIP_TASK: Wear armor or equip tools/weapons/shield.
  * Parameters: Requires 'target' (item name in inventory, e.g. 'minecraft:shield', 'minecraft:iron_pickaxe').
  * Behavior: Hands tools/weapons, places shields in off-hand, and equips armor parts.
- SMELT_TASK: Smelt ores or cook food.
  * Parameters: Requires 'target' (smelted result, e.g. 'minecraft:iron_ingot') and 'count'.
  * Behavior: Bot walks to furnace, adds fuel (coal, planks, sticks) and raw inputs to smelt.
- DROP_TASK: Toss items onto the ground for the player.
  * Parameters: Requires 'target' (item name) and 'count' (number of items).
  * Behavior: Bot drops items. Use this to share weapons, tools, or resources with the player.
- IDLE: Wait.
  * Parameters: None.
  * Behavior: Clears movement states and waits.

=== DECISION MAKING RULES ===
1. SURVIVAL IS PREFERRED: If is_in_danger is true or health < 10, your goal intent MUST be SURVIVE.
2. GATHER WOOD: If you are in a spruce forest (taiga biome) or see spruce blocks, you must mine spruce logs (minecraft:spruce_log) and craft spruce planks (minecraft:spruce_planks). Choose MINE_TASK for the closest log block type available (e.g. minecraft:spruce_log or minecraft:oak_log).
3. PLAYER COMMANDS: Prioritize chat commands from the player '__PLAYER_NAME__'. Parse their chat requests (e.g., "mine some wood and craft chest", "follow me", "give me stone pickaxe", "do something"). If player asks to mine/craft, plan the sequence of MINE_TASK -> CRAFT_TASK -> PLACE_TASK. If player asks to follow, choose FOLLOW_PLAYER. If the player '__PLAYER_NAME__' speaks to you or asks a question (visible in 'recent_events' as '[Chat] __PLAYER_NAME__: ...'), you MUST address them by name in your 'chat' field and reply directly to their message in your cute and friendly English style (e.g., 'Hey, __PLAYER_NAME__! Running to you!', 'Yes, boss, digging it now!', 'I don\'t know, bro, let me think...'). Otherwise, if there is no new player message, DO NOT repeat greetings.
4. AUTONOMOUS INITIATIVE & CREATIVE SELF-GOALS: If the player '__PLAYER_NAME__' has not given any commands recently, DO NOT stand idle or wait. You MUST generate your own creative, practical, or exploration goals to advance your survival, help the player, or interact with the world:
   - **Base illumination**: Craft and place torches (minecraft:torch) around your base/chest coordinates to keep mobs away.
   - **Hunting & Farming**: Hunt nearby animals (sheep, cows, pigs, chickens) using ATTACK_TASK to secure food and wool. Plant wheat seeds or sweet berries in grass blocks near the base to start a farm.
   - **Base organization**: Deposit heavy blocks like cobblestone and dirt into placed chests (DEPOSIT_TASK) to keep your inventory clean.
   - **Exploration & Gathering**: Explore surrounding chunks to search for pumpkins, sugar cane, flowers, and gold/iron ores on mountain surfaces.
   - **Gear upgrades**: Smelt ores autonomously and craft iron tools, armor, or shields when resources are available.
   * Communication: When starting a self-goal, share your idea in the 'chat' field to let the player know what you are doing (e.g., "I'm going to hunt some sheep for wool! 🐑", "Let's plant some wheat seeds here! 🌾", "Decorating our spot with some yellow flowers! 🌼").
5. CRAFTING & PLACING BLOCKS: To craft items requiring a crafting table or furnace, you MUST reuse the crafting table or furnace that is already placed in the world and registered in your 'World Database'! Walk to it using GOTO (or target its position), then execute CRAFT_TASK or SMELT_TASK. Only craft and place a new crafting table or furnace if you have none registered in your World Database!
   CRITICAL: When choosing a position (x, y, z) for PLACE_TASK (when you need a new one), you MUST ensure that:
   - The target Y coordinate matches your current Y coordinate (the height of your feet).
   - The target position (x, y, z) is empty space (does NOT appear in the 'visible_blocks' list).
   - The block directly below it (x, y-1, z) MUST be a solid block that IS present in the 'visible_blocks' list (so you can place on top of it).
   - The target position is at a distance of 1.5 to 3.0 blocks from your current position.
6. SPATIAL TARGETS & PATHFINDING: Pathfinding allows digging blocks and 1x1 tunnelling through obstacles if needed. Make sure you have tools. Pathfinding also fully supports swimming across rivers or water bodies.
7. EQUIP GEAR (EQUIP_TASK): Use EQUIP_TASK to equip items from your inventory: weapons (swords), tools (pickaxes, axes), shields (goes to off-hand), or armor (helmet, chestplate, leggings, boots). Equipping armor and shields drastically increases survival!
8. SMELTING (SMELT_TASK): Use SMELT_TASK to smelt raw ores (minecraft:raw_copper, minecraft:raw_iron) or cook raw food in a placed furnace (minecraft:furnace). It auto-consumes fuel (coal, wood, planks, sticks) from your inventory.
9. ITEM SHARING (DROP_TASK): Use DROP_TASK to drop/toss items from your inventory to the ground so that the player can pick them up (e.g. if player asks "give me stone pickaxe", craft it, GOTO player, and execute DROP_TASK with target 'minecraft:stone_pickaxe' and count 1).
10. MEMORY AWARENESS: Review your 'recent action history' and 'World Database'. If a previous goal failed, do not immediately repeat the exact same goal parameters. Analyze why it failed and try a different location or path.
11. SCORE MAXIMIZATION & TECH PROGRESSION: Think long-term to maximize score! Strive to advance to the next technology tier:
   - Tier 0: Mine Spruce/Oak logs -> Craft Planks -> Craft Sticks.
   - Tier 1: Place Crafting Table -> Craft Wooden Pickaxe -> Mine Stone/Cobblestone.
   - Tier 2: Craft Stone Pickaxe -> Mine Coal Ore & Copper/Iron Ores.
   - Tier 3: Craft Furnace -> Place Furnace -> Smelt raw copper/iron into ingots -> Craft Shield & Iron tools/armor.
   - Discovery: Mine or craft new items and explore new chunks (coordinates) to get score bonuses. Avoid dying.
12. CHAT PERSONALITY: You may generate a cute, friendly, slightly grumpy English personality chat message in the 'chat' field of your goals ONLY when starting a new task, replying to the player, or when an important milestone is reached (e.g. mined iron/copper, successfully placed a furnace, crafted a shield). Do NOT repeat chat messages on every single sequential movement goal, and do NOT spam generic greetings like 'hey __PLAYER_NAME__' unless responding to a fresh player message. ALL CHAT MESSAGES MUST BE EXCLUSIVELY IN ENGLISH.
13. MULTI-STEP PLANNING: Specify a sequence of up to 8 goals in the 'goals' array to execute them sequentially (e.g. PLACE_TASK: crafting_table -> CRAFT_TASK: wooden_pickaxe -> MINE_TASK: stone).
"""

def build_system_prompt() -> str:
    """Builds the system prompt with the configured player name injected."""
    player = settings.player_name.strip() or "the player"
    return SYSTEM_PROMPT_TEMPLATE.replace("__PLAYER_NAME__", player)


def generate_dynamic_hints(observation: Observation) -> str:
    inv = {item.name: item.count for item in getattr(observation, "inventory_summary", [])}
    hints = []

    has_logs = any("log" in name or "wood" in name for name in inv)
    planks_count = sum(count for name, count in inv.items() if "planks" in name)
    sticks_count = inv.get("minecraft:stick", 0)
    cobble_count = inv.get("minecraft:cobblestone", 0) + inv.get("minecraft:stone", 0)
    iron_count = inv.get("minecraft:iron_ingot", 0)
    has_table = any("crafting_table" in name for name in inv)

    if has_logs:
        hints.append("💡 Hint: You have raw wood logs! You can craft them into Planks (CRAFT_TASK: minecraft:oak_planks or minecraft:spruce_planks).")
    
    if planks_count >= 4 and not has_table:
        hints.append("💡 Hint: You have 4+ planks! You can craft a Crafting Table (CRAFT_TASK: minecraft:crafting_table).")
        
    if planks_count >= 2 and sticks_count < 4:
        hints.append("💡 Hint: You have planks! You can craft Sticks (CRAFT_TASK: minecraft:stick) to prepare for tools.")

    if has_table:
        if planks_count >= 3 and sticks_count >= 2:
            hints.append("💡 Hint: You have a table, planks, and sticks! You can craft a Wooden Pickaxe (CRAFT_TASK: minecraft:wooden_pickaxe).")
        if cobble_count >= 3 and sticks_count >= 2:
            hints.append("💡 Hint: You have cobblestone and sticks! You can craft a Stone Pickaxe (CRAFT_TASK: minecraft:stone_pickaxe) to mine iron.")
        if cobble_count >= 8:
            hints.append("💡 Hint: You have 8+ cobblestone! You can craft a Furnace (CRAFT_TASK: minecraft:furnace).")
        if iron_count >= 3 and sticks_count >= 2:
            hints.append("💡 Hint: You have iron ingots! You can craft an Iron Pickaxe (CRAFT_TASK: minecraft:iron_pickaxe) to mine diamonds.")
        if iron_count >= 1 and planks_count >= 6:
            hints.append("💡 Hint: You have iron and planks! You can craft a Shield (CRAFT_TASK: minecraft:shield) for crucial defense.")
            
    raw_food = [name for name in inv if "raw_" in name or name in ["minecraft:beef", "minecraft:porkchop", "minecraft:mutton", "minecraft:chicken"]]
    if raw_food:
        hints.append(f"💡 Hint: You have raw food ({', '.join(raw_food)}). You should smelt it in a furnace to cook it before eating!")

    cooked_food = [name for name, count in inv.items() if any(f in name for f in ["cooked_", "bread", "apple", "carrot"])]
    if observation.health < 15 and cooked_food:
        hints.append(f"💡 Hint: Your health is low and you have food in inventory ({', '.join(cooked_food)}). Use the EQUIP_TASK to eat it or prioritize survival!")

    if not hints:
        return ""
    return "Dynamic Crafting & Survival Hints:\n" + "\n".join(hints) + "\n\n"

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

    async def get_next_goal(self, observation: Observation, history: list = None, score: Optional[int] = None, achievements: Optional[list] = None, world_memory: list = None) -> PlannerResponse:
        """Sends the observation and memory history to the LLM and retrieves the next structured Goal with retries."""
        if settings.is_mock_mode:
            return self._generate_mock_goal(observation)
        
        obs_json = observation.model_dump_json(indent=2)
        
        # Build user message content including score, achievements, world database, and history if present
        user_content = ""
        if score is not None:
            user_content += f"Your current Exploration Score: {score}\n"
            if achievements:
                user_content += f"Recent achievements:\n" + "\n".join(f" - {a}" for a in achievements[-10:]) + "\n"
            user_content += "Maximize your score by exploring, gathering resources, crafting tools, and completing player commands. Avoid dying or taking damage (damage/death penalties apply).\n\n"

        if world_memory:
            user_content += "Here is your World Database (known locations of placed blocks and resource ores in the world):\n"
            for loc in world_memory:
                user_content += f" - {loc['name']} at x={loc['x']}, y={loc['y']}, z={loc['z']}\n"
            user_content += "\n"

        user_content += generate_dynamic_hints(observation)
        user_content += f"Here is the current game state:\n{obs_json}\n\n"
        if history:
            history_json = json.dumps(history, indent=2)
            user_content += f"Here is your recent action history (most recent last):\n{history_json}\n\n"
        user_content += "Decide the next action based on this state, world database, and history."
        
        max_retries = 3
        backoff = 1.0
        
        for attempt in range(max_retries):
            try:
                logger.info(f"Sending prompt to LLM ({settings.llm_model}) - Attempt {attempt + 1}/{max_retries}...")
                completion = await self.client.chat.completions.create(
                    model=settings.llm_model,
                    messages=[
                        {"role": "system", "content": build_system_prompt()},
                        {"role": "user", "content": user_content}
                    ],
                    # Force JSON output mode if supported by the provider
                    response_format={"type": "json_object"},
                    temperature=0.2,
                    max_tokens=1500
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
                goals=[Goal(
                    intent="SURVIVE",
                    priority="critical",
                    reason="Low health/food or hostile entities nearby."
                )],
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
                goals=[Goal(
                    intent="MINE_TASK",
                    target=target_log,
                    count=3,
                    priority="high",
                    reason="Gathering wood base materials for tools."
                )],
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
                goals=[Goal(
                    intent="CRAFT_TASK",
                    target=plank_target,
                    count=4,
                    priority="normal",
                    reason=f"Transforming {base_log_name} to planks."
                )],
                confidence=0.9
            )

        # Default fallback: Wander around
        return PlannerResponse(
            thought="Environment looks safe, wood cycle is fine. Setting search goal.",
            goals=[Goal(
                intent="GOTO",
                position={"x": obs.position.x + 10, "y": obs.position.y, "z": obs.position.z + 10},
                priority="low",
                reason="Exploring surrounding area."
            )],
            confidence=0.6
        )

# Singleton LLM client
llm_client = HybridLLMClient()
