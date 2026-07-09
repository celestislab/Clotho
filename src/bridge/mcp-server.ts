import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { MinecraftBody } from "../body/minecraft-body.js";
import { GoalSchema, type GoalResult } from "../schemas/intents.js";

/**
 * MCP Bridge — the missing link between the Hermes planner (Python) and the
 * Mineflayer body (TypeScript). Fills the `// TODO: MCP server bridge to
 * Hermes planner` gap left in index.ts.
 *
 * Exposes exactly the three tools described in the README:
 *   - get_state()      -> current Observation
 *   - set_goal(goal)    -> executes a Goal via body.act(), returns GoalResult
 *   - get_goal_status() -> last known GoalResult (for async/poll-style clients)
 *
 * Runs over stdio, so Hermes (or any MCP client, or `npx @modelcontextprotocol/inspector`
 * for manual testing) can spawn this as a subprocess and drive the bot directly.
 * Never used for reflexes — SafetyGuard keeps running independently inside
 * MinecraftBody and can interrupt/emergency-stop regardless of what a
 * set_goal call is doing.
 */

let lastGoalResult: GoalResult | null = null;

export function createBridgeServer(body: MinecraftBody): McpServer {
  const server = new McpServer({
    name: "clotho-mcp-bridge",
    version: "0.1.0",
  });

  server.tool(
    "get_state",
    "Get the current Minecraft world observation: health, food, position, biome, nearby blocks/entities, recent events.",
    {},
    async () => {
      const obs = body.observe();
      return {
        content: [{ type: "text", text: JSON.stringify(obs) }],
      };
    },
  );

  server.tool(
    "set_goal",
    "Send a high-level goal to the body (GOTO, MINE_TASK, CRAFT_TASK, PLACE_TASK, FOLLOW_PLAYER, SURVIVE, IDLE). Executes via the action-executor and respects SafetyGuard interrupts. Returns the GoalResult once execution finishes.",
    GoalSchema.shape,
    async (goal) => {
      if (body.safetyGuard.isEmergency) {
        const blocked: GoalResult = {
          goal_id: `blocked_${Date.now()}`,
          success: false,
          message: `Rejected: SafetyGuard is in emergency state (${body.safetyGuard.emergencyReasonText})`,
          steps_taken: 0,
          elapsed_ms: 0,
        };
        lastGoalResult = blocked;
        return { content: [{ type: "text", text: JSON.stringify(blocked) }] };
      }

      const result = await body.act(goal);
      lastGoalResult = result;
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "get_goal_status",
    "Get the result of the most recently completed goal (success flag, message, steps taken, elapsed time). Returns null if no goal has run yet.",
    {},
    async () => {
      return {
        content: [
          { type: "text", text: JSON.stringify(lastGoalResult ?? null) },
        ],
      };
    },
  );

  return server;
}

export async function startBridge(body: MinecraftBody): Promise<void> {
  const server = createBridgeServer(body);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[Bridge] MCP server listening on stdio (get_state, set_goal, get_goal_status)");
}