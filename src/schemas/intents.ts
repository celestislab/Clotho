import { z } from "zod";

export const IntentEnum = z.enum([
  "GOTO",
  "MINE_TASK",
  "CRAFT_TASK",
  "PLACE_TASK",
  "FOLLOW_PLAYER",
  "SURVIVE",
  "EQUIP_TASK",
  "SMELT_TASK",
  "DROP_TASK",
  "ATTACK_TASK",
  "DEPOSIT_TASK",
  "WITHDRAW_TASK",
  "IDLE",
]);

export type Intent = z.infer<typeof IntentEnum>;

export const GoalSchema = z.object({
  intent: IntentEnum,
  target: z.string().optional().describe("Block type (minecraft:oak_log), player name, item name, or recipe id"),
  count: z.number().int().min(1).max(10000).optional(),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
    })
    .optional(),
  priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  reason: z.string().max(300).default("").describe("Why this goal was chosen"),
  chat: z.string().max(200).optional().describe("Optional chat message in Russian, friendly, cute tone, can complain or joke"),
});

export type Goal = z.infer<typeof GoalSchema>;

export const PlannerResponseSchema = z.object({
  goal: GoalSchema,
  thought: z.string().max(500).describe("Brief reasoning about current situation and chosen goal"),
  confidence: z.number().min(0).max(1).default(0.5),
});

export type PlannerResponse = z.infer<typeof PlannerResponseSchema>;

export const GoalResultSchema = z.object({
  goal_id: z.string(),
  success: z.boolean(),
  message: z.string(),
  steps_taken: z.number().int(),
  elapsed_ms: z.number(),
});

export type GoalResult = z.infer<typeof GoalResultSchema>;

export const INTENT_LIST: Intent[] = IntentEnum.options;

export const INTENT_DESCRIPTIONS: Record<Intent, string> = {
  GOTO: "Navigate to a specific coordinate, player, or named landmark",
  MINE_TASK: "Mine a specific block type up to N times, then return",
  CRAFT_TASK: "Craft an item using a known recipe",
  PLACE_TASK: "Place a block at a specific location",
  FOLLOW_PLAYER: "Follow a named player, keeping a safe distance",
  SURVIVE: "Prioritize survival: eat, flee danger, find shelter",
  EQUIP_TASK: "Equip a weapon, tool, armor, or shield from inventory",
  SMELT_TASK: "Smelt raw ores or items in a furnace",
  DROP_TASK: "Drop/toss a specific item from the inventory onto the ground",
  ATTACK_TASK: "Hunt/attack a nearby monster, animal, or entity",
  DEPOSIT_TASK: "Deposit an item from inventory into a chest at a given position",
  WITHDRAW_TASK: "Withdraw an item from a chest at a given position into inventory",
  IDLE: "Stop and wait; no immediate action needed",
};
