import type { Bot } from "mineflayer";
import type {
  Observation,
  NearbyBlock,
  NearbyEntity,
  ItemStack,
} from "../schemas/observation.js";
import { Vec3 } from "vec3";

const HOSTILE_MOBS = new Set([
  "zombie",
  "skeleton",
  "creeper",
  "spider",
  "enderman",
  "witch",
  "blaze",
  "ghast",
  "slime",
  "magma_cube",
  "phantom",
  "drowned",
  "pillager",
  "vindicator",
  "ravager",
  "warden",
  "wither",
  "ender_dragon",
]);

const PASSIVE_ANIMALS = new Set([
  "cow",
  "pig",
  "sheep",
  "chicken",
  "rabbit",
  "horse",
  "donkey",
  "mule",
  "wolf",
  "cat",
  "ocelot",
  "parrot",
  "fox",
  "bee",
  "turtle",
  "panda",
  "axolotl",
  "goat",
  "frog",
  "allay",
  "villager",
  "iron_golem",
  "snow_golem",
  "bat",
  "cod",
  "salmon",
  "tropical_fish",
  "pufferfish",
  "squid",
  "glow_squid",
  "dolphin",
  "strider",
]);

function cleanItemName(name: string): string {
  return name.startsWith("minecraft:") ? name.slice(10) : name;
}

/** Coerce a possibly-NaN/undefined numeric stat to a safe default (packets may
 * not have arrived yet right after spawn, leaving health/food as NaN). */
function safeNum(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function classifyEntity(name: string): NearbyEntity["type"] {
  const clean = cleanItemName(name);
  if (PASSIVE_ANIMALS.has(clean)) return "animal";
  if (HOSTILE_MOBS.has(clean)) return "mob";
  if (clean === "item" || clean === "xp_orb") return "item";
  return "mob";
}

function isHostile(name: string): boolean {
  return HOSTILE_MOBS.has(cleanItemName(name));
}

function directionTo(delta: Vec3): NearbyBlock["direction"] {
  const absX = Math.abs(delta.x);
  const absZ = Math.abs(delta.z);
  const absY = Math.abs(delta.y);
  if (absY > absX && absY > absZ) return delta.y > 0 ? "up" : "down";
  if (absX > absZ) return delta.x > 0 ? "east" : "west";
  return delta.z > 0 ? "south" : "north";
}

function timeOfDayFromTicks(ticks: number): Observation["time_of_day"] {
  const t = ticks % 24000;
  if (t < 1000 || t > 13000) return "day";
  if (t < 6000) return "day";
  if (t < 12000) return "dusk";
  if (t < 18000) return "night";
  return "dawn";
}

function compactInventory(bot: Bot): ItemStack[] {
  const items = bot.inventory.items();
  const merged = new Map<string, ItemStack>();
  for (const item of items) {
    const name = item.name;
    const existing = merged.get(name);
    if (existing) {
      existing.count += item.count;
    } else {
      merged.set(name, {
        name,
        count: item.count,
        displayName: item.displayName ?? name,
      });
    }
  }
  return Array.from(merged.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

function scanNearbyBlocks(bot: Bot, radius: number): NearbyBlock[] {
  const pos = bot.entity.position;
  const blockCounts = new Map<
    string,
    { count: number; closest: number; delta: Vec3 }
  >();

  const step = 3;
  for (let dx = -radius; dx <= radius; dx += step) {
    for (let dz = -radius; dz <= radius; dz += step) {
      for (let dy = -2; dy <= 3; dy += step) {
        const target = pos.offset(dx, dy, dz);
        const block = bot.blockAt(target, false);
        if (!block || block.name === "air") continue;
        const dist = pos.distanceTo(target);
        if (dist > radius) continue;
        const existing = blockCounts.get(block.name);
        if (!existing) {
          blockCounts.set(block.name, {
            count: 1,
            closest: dist,
            delta: target.clone().subtract(pos),
          });
        } else {
          existing.count++;
          if (dist < existing.closest) {
            existing.closest = dist;
            existing.delta = target.clone().subtract(pos);
          }
        }
      }
    }
  }

  return Array.from(blockCounts.entries())
    .map(([name, data]) => ({
      name,
      count: data.count,
      closest_distance: Math.round(data.closest * 10) / 10,
      direction: directionTo(data.delta),
    }))
    .sort((a, b) => a.closest_distance - b.closest_distance)
    .slice(0, 15);
}

function scanNearbyEntities(bot: Bot, radius: number): NearbyEntity[] {
  const pos = bot.entity.position;
  const result: NearbyEntity[] = [];
  for (const entity of Object.values(bot.entities)) {
    if (entity === bot.entity) continue;
    if (!entity.position) continue;
    const dist = pos.distanceTo(entity.position);
    if (dist > radius) continue;
    const name = entity.name ?? entity.username ?? "unknown";
    const isPlayer = Boolean(entity.username && entity.type === "player");
    result.push({
      name: isPlayer ? entity.username! : name,
      type: isPlayer ? "player" : classifyEntity(name),
      position: {
        x: Math.round(entity.position.x * 10) / 10,
        y: Math.round(entity.position.y * 10) / 10,
        z: Math.round(entity.position.z * 10) / 10,
      },
      distance: Math.round(dist * 10) / 10,
      is_hostile: isPlayer ? false : isHostile(name),
    });
  }
  return result.sort((a, b) => a.distance - b.distance).slice(0, 10);
}

export function extractObservation(
  bot: Bot,
  eventLog: string[],
): Observation {
  const pos = bot.entity.position;
  const nearbyEntities = scanNearbyEntities(bot, 32);
  const hasHostile = nearbyEntities.some(
    (e) => e.is_hostile && e.distance < 16 && Math.abs(pos.y - e.position.y) < 5,
  );
  // Health/food may be NaN in the first tick after spawn (packet not in yet).
  const health = safeNum(bot.health, 20);
  const food = safeNum(bot.food, 20);
  const lowHealth = health < 10;
  const heldItem = bot.heldItem;
  const blockAtFeet = bot.blockAt(pos);
  const biome = blockAtFeet?.biome?.name ?? "unknown";

  return {
    timestamp: Date.now(),
    health: Math.round(health * 10) / 10,
    food: Math.round(food * 10) / 10,
    saturation: Math.round(safeNum(bot.foodSaturation, 5) * 10) / 10,
    oxygen: safeNum(bot.oxygenLevel, 20),
    position: {
      x: Math.round(pos.x * 10) / 10,
      y: Math.round(pos.y * 10) / 10,
      z: Math.round(pos.z * 10) / 10,
    },
    biome,
    time_of_day: timeOfDayFromTicks(bot.time.timeOfDay),
    is_in_danger: hasHostile || lowHealth,
    equipped_item: heldItem ? heldItem.name : "empty",
    inventory_summary: compactInventory(bot),
    nearby_blocks: scanNearbyBlocks(bot, 16),
    nearby_entities: nearbyEntities,
    recent_events: eventLog.slice(-5),
  };
}
