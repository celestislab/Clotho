/**
 * Clotho Body MCP Server — the minimal bridge between the Hermes planner
 * and the Minecraft body.
 *
 * This process owns a live `MinecraftBody` (Mineflayer bot + SafetyGuard reflex)
 * and exposes it to any MCP client as a small set of planner tools:
 *
 *   - get_state         → body.observe()   (read-only world snapshot)
 *   - set_goal          → body.act(goal)   (execute one high-level UMAS Goal)
 *   - get_goal_status   → last GoalResult + runtime flags
 *   - chat              → body.say(message)
 *
 * The Hermes runtime (hosting the Gemini planner) connects to this server as
 * an MCP client and drives the body through these tools. The reflex layer
 * (SafetyGuard) keeps running inside the body regardless of what the planner
 * decides — survival is never routed through the planner.
 *
 * Wire it into Hermes (stdio transport):
 *   hermes mcp add clotho-body --command "npx tsx src/mcp/body-server.ts"
 *
 * ⚠️ stdio transport uses STDOUT for JSON-RPC. All human-facing logging in this
 * process MUST go to STDERR (console.error), never stdout, or the protocol
 * stream is corrupted.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MinecraftBody, type BodyConfig } from "../body/minecraft-body.js";
import { GoalSchema, type GoalResult } from "../schemas/intents.js";
import { envInt, envStr, loadDefaultEnv } from "../env.js";

loadDefaultEnv();

const log = (msg: string): void => console.error(`[MCP] ${msg}`);

function bodyConfigFromEnv(): BodyConfig {
  return {
    host: envStr("MC_HOST", "127.0.0.1"),
    port: envInt("MC_PORT", 25565),
    username: envStr("MC_USERNAME", "Oneiro"),
    version: envStr("MC_VERSION", "1.21.11") || undefined,
    auth: envStr("MC_AUTH", "offline") as "offline" | "microsoft",
  };
}

async function main(): Promise<void> {
  const config = bodyConfigFromEnv();
  log(`Connecting body to ${config.host}:${config.port} as ${config.username}...`);

  const body = new MinecraftBody(config, {
    onSpawn: (obs) =>
      log(`Spawned at ${JSON.stringify(obs.position)} biome=${obs.biome} hp=${obs.health}`),
    onKicked: (reason) => log(`Kicked: ${reason}`),
    onError: (err) => log(`Body error: ${err.message}`),
    onChat: (username, message) => log(`Chat ${username}: ${message}`),
  });

  await body.connect();
  log("Body connected. Starting MCP server on stdio...");

  // Single-goal-at-a-time: the body executes one Goal synchronously, so we
  // reject overlapping set_goal calls instead of racing the Mineflayer bot.
  let busy = false;
  let lastResult: GoalResult | null = null;

  const server = new McpServer({ name: "clotho-body", version: "0.1.0" });

  server.registerTool(
    "get_state",
    {
      description:
        "Read the current world observation: position, biome, health, food, danger flag, nearby blocks and entities, and recent events. Read-only, safe to call anytime.",
      inputSchema: {},
    },
    async () => {
      const obs = body.observe();
      return { content: [{ type: "text", text: JSON.stringify(obs, null, 2) }] };
    },
  );

  server.registerTool(
    "set_goal",
    {
      description:
        "Execute one high-level goal (UMAS intent). Blocks until the goal finishes, fails, or the safety watchdog stops it. Do NOT issue raw movement — only strategic goals (GOTO, MINE_TASK, CRAFT_TASK, PLACE_TASK, FOLLOW_PLAYER, SURVIVE, IDLE). Returns a GoalResult.",
      inputSchema: GoalSchema.shape,
    },
    async (args) => {
      if (busy) {
        return {
          content: [
            { type: "text", text: "Body is busy executing another goal. Call get_goal_status." },
          ],
          isError: true,
        };
      }
      if (body.safetyGuard.isEmergency) {
        return {
          content: [
            {
              type: "text",
              text: `Refusing goal: body is in emergency stop (${body.safetyGuard.emergencyReasonText}).`,
            },
          ],
          isError: true,
        };
      }
      const goal = GoalSchema.parse(args);
      busy = true;
      try {
        log(`Executing goal: ${goal.intent} ${goal.target ?? ""}`.trim());
        lastResult = await body.act(goal);
        return { content: [{ type: "text", text: JSON.stringify(lastResult, null, 2) }] };
      } finally {
        busy = false;
      }
    },
  );

  server.registerTool(
    "get_goal_status",
    {
      description:
        "Get the result of the most recent goal plus runtime flags (busy, connected, emergency). Use this to poll after a goal or to check body health.",
      inputSchema: {},
    },
    async () => {
      const status = {
        busy,
        connected: body.isRunning,
        emergency: body.safetyGuard.isEmergency,
        emergency_reason: body.safetyGuard.emergencyReasonText || null,
        steps_taken: body.safetyGuard.stepCount,
        last_result: lastResult,
      };
      return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
    },
  );

  server.registerTool(
    "chat",
    {
      description: "Send a chat message in-game as the agent. Use for player-facing communication only.",
      inputSchema: { message: z.string().min(1).max(256) },
    },
    async ({ message }) => {
      body.say(message);
      return { content: [{ type: "text", text: `Sent: ${message}` }] };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("MCP server ready. Planner can now drive the body.");

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`${signal} received, shutting down...`);
    await body.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[MCP] Fatal error:", err);
  process.exit(1);
});
