import { z } from "zod";

export const ActionEnum = z.enum([
  "MOVE_FORWARD",
  "MOVE_BACK",
  "TURN_LEFT",
  "TURN_RIGHT",
  "LOOK_UP",
  "LOOK_DOWN",
  "JUMP",
  "SPRINT",
  "SNEAK",
  "MINE_TARGET",
  "PLACE_BLOCK",
  "ATTACK",
  "USE_ITEM",
  "EAT",
  "STOP",
  "WAIT",
  "REQUEST_PLAN",
]);

export type Action = z.infer<typeof ActionEnum>;

export const ActionSchema = z.object({
  action: ActionEnum,
  duration_ticks: z.number().int().min(1).max(200).default(10),
  reason: z.string().max(200).default(""),
});

export type ActionCall = z.infer<typeof ActionSchema>;

export const ACTION_LIST: Action[] = ActionEnum.options;
