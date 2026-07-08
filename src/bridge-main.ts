import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MinecraftBody } from "./body/minecraft-body.js";
import { SafetyGuard } from "./reflex/safety-guard.js";
import { startBridge } from "./bridge/mcp-server.js";

// Same env-loading pattern as index.ts, kept identical on purpose so both
// entrypoints behave the same way when run side by side.
function loadEnv(path: string): void {
  try {
    const content = readFileSync(resolve(path), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // .env not found, rely on real env vars
  }
}

loadEnv(".env");
loadEnv(".env.local");

function envInt(key: string, def: number): number {
  const v = process.env[key];
  if (!v) return def;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? def : n;
}

function envStr(key: string, def: string): string {
  return process.env[key] ?? def;
}

async function main(): Promise<void> {
  console.error("============================================");
  console.error("  Oneiro - MCP Bridge Entrypoint");
  console.error("  [Body + Reflex + Planner bridge (stdio)]");
  console.error("============================================\n");

  const bodyConfig = {
    host: envStr("MC_HOST", "127.0.0.1"),
    port: envInt("MC_PORT", 25565),
    username: envStr("MC_USERNAME", "Oneiro"),
    version: envStr("MC_VERSION", "1.21.11") || undefined,
    auth: envStr("MC_AUTH", "offline") as "offline" | "microsoft",
  };

  const guard = new SafetyGuard(
    envInt("MAX_STEPS", 50),
    envInt("WATCHDOG_TIMEOUT_MS", 60000),
  );

  const body = new MinecraftBody(bodyConfig, {
    onSpawn: (obs) => {
      console.error(`[Body] Spawned at ${JSON.stringify(obs.position)} biome=${obs.biome}`);
    },
    onKicked: (reason) => console.error(`[Body] Kicked: ${reason}`),
    onError: (err) => console.error(`[Body] Error: ${err.message}`),
    onChat: (username, message) => console.error(`[Chat] ${username}: ${message}`),
    onObservation: () => {
      // Independent reflex check runs regardless of planner activity —
      // this is what makes SafetyGuard a true interrupt, not just a
      // pre-goal check.
      const obs = body.observe();
      if (guard.shouldStop(obs.health, obs.food)) {
        body.emergencyStop(`Low health/food: hp=${obs.health} food=${obs.food}`);
      }
    },
  });

  console.error(`[Config] Minecraft: ${bodyConfig.host}:${bodyConfig.port} as ${bodyConfig.username}`);

  try {
    await body.connect();
    console.error("[Connect] Connected to Minecraft.\n");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Connect] FAILED to reach Minecraft server at ${bodyConfig.host}:${bodyConfig.port}`);
    console.error(`[Connect] Reason: ${message}`);
    console.error("[Connect] Bridge will still start so tool schemas can be inspected, but get_state/set_goal will fail until a Minecraft server is reachable.");
    console.error("[Connect] Set MC_HOST / MC_PORT env vars to point at a real server, or start one locally.\n");
  }

  console.error("[Bridge] Starting MCP bridge...\n");
  await startBridge(body);

  const shutdown = async (signal: string) => {
    console.error(`\n[Shutdown] ${signal} received, stopping...`);
    await body.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});