import type { Bot } from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
import type { Movements as MovementsInstance } from "mineflayer-pathfinder";
const { Movements, goals } = pathfinderPkg;
import { Vec3 } from "vec3";
import type { Goal, GoalResult } from "../schemas/intents.js";
import type { SafetyGuard } from "../reflex/safety-guard.js";

const { GoalNear, GoalXZ, GoalBlock, GoalFollow } = goals;

export interface ExecutionResult {
  success: boolean;
  message: string;
}

function makeMovements(bot: Bot): MovementsInstance {
  const movements = new Movements(bot);
  movements.allowSprinting = true;
  movements.canDig = true;
  movements.maxDropDown = 4;
  return movements;
}

function findNearestBlock(
  bot: Bot,
  blockName: string,
  maxDistance = 32,
): { position: Vec3; distance: number } | null {
  const matching = bot.registry.blocksByName[blockName];
  if (!matching) return null;
  const ids = bot.findBlocks({
    matching: matching.id,
    maxDistance,
    count: 16,
  });
  if (ids.length === 0) return null;
  const pos = bot.entity.position;
  let best: Vec3 | null = null;
  let bestDist = Infinity;
  for (const p of ids) {
    const d = pos.distanceTo(p);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  if (!best) return null;
  return { position: best, distance: bestDist };
}

function findPlayer(bot: Bot, name: string) {
  const player = bot.players[name];
  if (!player?.entity) return null;
  return player.entity;
}

async function navigateTo(
  bot: Bot,
  target: Vec3,
  guard: SafetyGuard,
  range = 1,
): Promise<ExecutionResult> {
  const movements = makeMovements(bot);
  bot.pathfinder.setMovements(movements);
  const goal = new GoalNear(
    Math.floor(target.x),
    Math.floor(target.y),
    Math.floor(target.z),
    range,
  );
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      bot.pathfinder.setGoal(null);
      guard.incrementSteps();
      resolve({ success: false, message: "Navigation timeout" });
    }, guard.watchdogTimeoutMs);

    bot.pathfinder.goto(goal).then(() => {
      clearTimeout(timeout);
      guard.incrementSteps();
      resolve({
        success: true,
        message: `Reached ${Math.floor(target.x)},${Math.floor(target.y)},${Math.floor(target.z)}`,
      });
    }).catch((err: Error) => {
      clearTimeout(timeout);
      guard.incrementSteps();
      resolve({
        success: false,
        message: `Navigation failed: ${err.message}`,
      });
    });
  });
}

async function mineBlocks(
  bot: Bot,
  blockName: string,
  count: number,
  guard: SafetyGuard,
): Promise<ExecutionResult> {
  let mined = 0;
  let failures = 0;
  const maxFailures = 3;

  while (mined < count && failures < maxFailures && guard.shouldContinue()) {
    guard.incrementSteps();
    const found = findNearestBlock(bot, blockName, 32);
    if (!found) {
      if (mined > 0) {
        return { success: true, message: `Mined ${mined}/${count} ${blockName}, no more nearby` };
      }
      return { success: false, message: `No ${blockName} found within 32 blocks` };
    }

    const navResult = await navigateTo(bot, found.position, guard, 3);
    if (!navResult.success) {
      failures++;
      continue;
    }

    const block = bot.blockAt(found.position);
    if (!block || block.name !== blockName) {
      failures++;
      continue;
    }

    try {
      if (!bot.canDigBlock(block)) {
        failures++;
        continue;
      }
      await bot.dig(block, true);
      mined++;
      bot.chat(`/say Oneiro mined ${blockName} (${mined}/${count})`);
    } catch (err) {
      failures++;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Dig failed: ${msg}`);
    }
  }

  if (mined > 0) {
    return { success: true, message: `Mined ${mined}/${count} ${blockName}` };
  }
  return { success: false, message: `Failed to mine any ${blockName}` };
}

async function craftItem(
  bot: Bot,
  itemName: string,
  count: number,
  guard: SafetyGuard,
): Promise<ExecutionResult> {
  const item = bot.registry.itemsByName[itemName];
  if (!item) {
    return { success: false, message: `Unknown item: ${itemName}` };
  }
  const recipes = bot.recipesFor(item.id, null, 1, null);
  if (!recipes || recipes.length === 0) {
    return { success: false, message: `No recipe for ${itemName}` };
  }

  const craftingTableBlock = bot.findBlock({
    matching: bot.registry.blocksByName["crafting_table"]?.id ?? -1,
    maxDistance: 32,
  });

  try {
    guard.incrementSteps();
    await bot.craft(recipes[0]!, count, craftingTableBlock ?? undefined);
    return { success: true, message: `Crafted ${count}x ${itemName}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Craft failed: ${msg}` };
  }
}

async function placeBlockAt(
  bot: Bot,
  blockName: string,
  position: Vec3,
  guard: SafetyGuard,
): Promise<ExecutionResult> {
  const item = bot.inventory.items().find((i) => i.name === blockName);
  if (!item) {
    return { success: false, message: `No ${blockName} in inventory` };
  }

  const navResult = await navigateTo(bot, position, guard, 2);
  if (!navResult.success) {
    return navResult;
  }

  const refBlock = bot.blockAt(position.offset(0, -1, 0));
  if (!refBlock) {
    return { success: false, message: "Cannot find reference block below target" };
  }

  try {
    guard.incrementSteps();
    await bot.equip(item, "hand");
    await bot.placeBlock(refBlock, new Vec3(0, 1, 0));
    return { success: true, message: `Placed ${blockName} at ${position.x},${position.y},${position.z}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Place failed: ${msg}` };
  }
}

async function followPlayer(
  bot: Bot,
  playerName: string,
  guard: SafetyGuard,
): Promise<ExecutionResult> {
  const entity = findPlayer(bot, playerName);
  if (!entity) {
    return { success: false, message: `Player ${playerName} not found or offline` };
  }

  const movements = makeMovements(bot);
  bot.pathfinder.setMovements(movements);
  const goal = new GoalFollow(entity, 3);

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      bot.pathfinder.setGoal(null);
      guard.incrementSteps();
      resolve({ success: true, message: `Followed ${playerName} for ${guard.watchdogTimeoutMs / 1000}s` });
    }, Math.min(guard.watchdogTimeoutMs, 15000));

    bot.pathfinder.goto(goal).catch((err: Error) => {
      clearTimeout(timeout);
      guard.incrementSteps();
      resolve({ success: false, message: `Follow failed: ${err.message}` });
    });

    setTimeout(() => {
      clearTimeout(timeout);
      bot.pathfinder.setGoal(null);
      guard.incrementSteps();
      resolve({ success: true, message: `Followed ${playerName}` });
    }, 10000);
  });
}

async function survive(bot: Bot, guard: SafetyGuard): Promise<ExecutionResult> {
  if (bot.food < 18) {
    const foodItem = bot.inventory
      .items()
      .find((i) =>
        ["bread", "cooked_beef", "cooked_porkchop", "cooked_cod", "apple", "carrot", "baked_potato"].includes(
          i.name,
        ),
      );
    if (foodItem) {
      try {
        await bot.equip(foodItem, "hand");
        await bot.consume();
        guard.incrementSteps();
        return { success: true, message: "Ate food to restore hunger" };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, message: `Failed to eat: ${msg}` };
      }
    }
  }

  if (bot.health < 10) {
    const safestDirection = bot.entity.position.offset(0, 1, 0);
    const navResult = await navigateTo(bot, safestDirection, guard, 0);
    guard.incrementSteps();
    return {
      success: navResult.success,
      message: "Fleeing to safety (low health)",
    };
  }

  bot.setControlState("sneak", true);
  await new Promise((r) => setTimeout(r, 2000));
  bot.setControlState("sneak", false);
  guard.incrementSteps();
  return { success: true, message: "Assessed situation, no immediate action needed" };
}

export async function executeGoal(
  bot: Bot,
  goal: Goal,
  guard: SafetyGuard,
): Promise<ExecutionResult> {
  guard.resetWatchdog();

  switch (goal.intent) {
    case "GOTO": {
      if (goal.position) {
        const target = new Vec3(goal.position.x, goal.position.y, goal.position.z);
        return navigateTo(bot, target, guard, 1);
      }
      if (goal.target) {
        const player = findPlayer(bot, goal.target);
        if (player) {
          return navigateTo(bot, player.position, guard, 2);
        }
        const block = findNearestBlock(bot, goal.target, 32);
        if (block) {
          return navigateTo(bot, block.position, guard, 2);
        }
        return { success: false, message: `Cannot find ${goal.target} to go to` };
      }
      return { success: false, message: "GOTO requires position or target" };
    }

    case "MINE_TASK": {
      if (!goal.target) return { success: false, message: "MINE_TASK requires target block name" };
      return mineBlocks(bot, goal.target, goal.count ?? 1, guard);
    }

    case "CRAFT_TASK": {
      if (!goal.target) return { success: false, message: "CRAFT_TASK requires target item name" };
      return craftItem(bot, goal.target, goal.count ?? 1, guard);
    }

    case "PLACE_TASK": {
      if (!goal.target || !goal.position) {
        return { success: false, message: "PLACE_TASK requires target and position" };
      }
      return placeBlockAt(
        bot,
        goal.target,
        new Vec3(goal.position.x, goal.position.y, goal.position.z),
        guard,
      );
    }

    case "FOLLOW_PLAYER": {
      if (!goal.target) return { success: false, message: "FOLLOW_PLAYER requires player name" };
      return followPlayer(bot, goal.target, guard);
    }

    case "SURVIVE": {
      return survive(bot, guard);
    }

    case "IDLE": {
      bot.clearControlStates();
      return { success: true, message: "Idle" };
    }

    default: {
      return { success: false, message: `Unknown intent: ${goal.intent}` };
    }
  }
}