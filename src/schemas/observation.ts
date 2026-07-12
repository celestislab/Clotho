import { z } from "zod";

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const ItemStackSchema = z.object({
  name: z.string(),
  count: z.number().int().min(1).max(10000),
  displayName: z.string().optional(),
});

export const NearbyBlockSchema = z.object({
  name: z.string(),
  count: z.number().int().min(1),
  closest_distance: z.number(),
  direction: z.enum(["north", "south", "east", "west", "up", "down", "nearby"]),
});

export const NearbyEntitySchema = z.object({
  name: z.string(),
  type: z.enum(["mob", "player", "animal", "item"]),
  position: PositionSchema,
  distance: z.number(),
  is_hostile: z.boolean(),
});

export const TerrainReliefSchema = z.object({
  center: z.number().describe("Relative height offset of block under feet"),
  north: z.number().describe("Relative height offset 3 blocks North"),
  south: z.number().describe("Relative height offset 3 blocks South"),
  east: z.number().describe("Relative height offset 3 blocks East"),
  west: z.number().describe("Relative height offset 3 blocks West"),
  highest_nearby_block: z.string().optional(),
  lowest_nearby_block: z.string().optional(),
});

export const EquipmentSchema = z.object({
  head: z.string().optional().nullable(),
  chest: z.string().optional().nullable(),
  legs: z.string().optional().nullable(),
  feet: z.string().optional().nullable(),
  mainhand: z.string().optional().nullable(),
  offhand: z.string().optional().nullable(),
});

export const VisibleBlockSchema = z.object({
  name: z.string(),
  position: PositionSchema,
  distance: z.number(),
});

export const ObservationSchema = z.object({
  timestamp: z.number(),
  health: z.number().min(0).max(1000),
  food: z.number().min(0).max(1000),
  saturation: z.number().min(0).max(1000),
  oxygen: z.number().min(-1000).max(1000).optional(),
  position: PositionSchema,
  biome: z.string(),
  time_of_day: z.enum(["day", "night", "dusk", "dawn"]),
  is_in_danger: z.boolean().describe("Hostile mob nearby or health below 10"),
  equipped_item: z.string().describe("Item name in main hand, or 'empty'"),
  equipment: EquipmentSchema.optional(),
  inventory_summary: z
    .array(ItemStackSchema)
    .max(20)
    .describe("Top items by count, compacted"),
  nearby_blocks: z
    .array(NearbyBlockSchema)
    .max(15)
    .describe("Surface-visible blocks within ~16 block radius"),
  visible_blocks: z
    .array(VisibleBlockSchema)
    .max(50)
    .optional()
    .describe("Blocks bot can actually see within ~25 blocks sphere (no xray)"),
  nearby_entities: z
    .array(NearbyEntitySchema)
    .max(10)
    .describe("Entities within ~32 block radius"),
  terrain_relief: TerrainReliefSchema.optional().describe("Elevation and relief characteristics of surrounding blocks"),
  recent_events: z
    .array(z.string().max(100))
    .max(5)
    .default([])
    .describe("Recent notable events: damage taken, blocks mined, items picked up"),
});

export type Observation = z.infer<typeof ObservationSchema>;
export type TerrainRelief = z.infer<typeof TerrainReliefSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type ItemStack = z.infer<typeof ItemStackSchema>;
export type NearbyBlock = z.infer<typeof NearbyBlockSchema>;
export type NearbyEntity = z.infer<typeof NearbyEntitySchema>;
export type Equipment = z.infer<typeof EquipmentSchema>;
export type VisibleBlock = z.infer<typeof VisibleBlockSchema>;
