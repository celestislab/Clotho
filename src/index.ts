import { MinecraftBody } from "./body/minecraft-body.js";
import { SafetyGuard } from "./reflex/safety-guard.js";
import { envInt, envStr, loadDefaultEnv } from "./env.js";

loadDefaultEnv();

async function main(): Promise<void> {
  const isDemo = process.argv.includes("--demo");

  console.log("============================================");
  console.log("  Oneiro - Embodied Minecraft Agent");
  console.log("  AMD Hackathon Act II Prototype");
  console.log("  [Body + Reflex online | Planner: Hermes]");
  console.log("============================================\n");

  const bodyConfig = {
    host: envStr("MC_HOST", "127.0.0.1"),
    port: envInt("MC_PORT", 25565),
    username: envStr("MC_USERNAME", "Oneiro"),
    version: envStr("MC_VERSION", "1.21.11") || undefined,
    auth: (envStr("MC_AUTH", "offline") as "offline" | "microsoft"),
  };

  const guard = new SafetyGuard(
    envInt("MAX_STEPS", 50),
    envInt("WATCHDOG_TIMEOUT_MS", 60000),
  );

  console.log("[Config]");
  console.log(`  Minecraft: ${bodyConfig.host}:${bodyConfig.port} as ${bodyConfig.username}`);
  console.log(`  Guard: maxSteps=${guard.maxSteps} watchdog=${guard.watchdogTimeoutMs}ms`);
  console.log(`  Demo mode: ${isDemo}\n`);

  const body = new MinecraftBody(bodyConfig, {
    onSpawn: (obs) => {
      console.log(`[Body] Spawned at ${JSON.stringify(obs.position)} biome=${obs.biome}`);
      console.log(`[Body] HP=${obs.health} food=${obs.food} danger=${obs.is_in_danger}`);
      console.log(`[Body] Nearby blocks: ${obs.nearby_blocks.slice(0, 5).map(b => b.name).join(", ")}`);
    },
    onKicked: (reason) => {
      console.error(`[Body] Kicked: ${reason}`);
    },
    onError: (err) => {
      console.error(`[Body] Error: ${err.message}`);
    },
    onChat: (username, message) => {
      console.log(`[Chat] ${username}: ${message}`);
    },
    onObservation: (obs) => {
      console.log(`[Observe] HP=${obs.health} pos=${JSON.stringify(obs.position)} danger=${obs.is_in_danger}`);
    },
  });

  console.log("[Connect] Connecting to Minecraft...");
  await body.connect();
  console.log("[Connect] Connected!\n");

  body.say("Oneiro online. Body + reflex active. Planner pending (Hermes).");

  // TODO: MCP server bridge to Hermes planner
  // TODO: Reflex loop (survival/combat) running in parallel to planner goals
  // For now: manual observation loop for testing
  let stepCount = 0;
  const obsInterval = envInt("OBS_INTERVAL_MS", 10000);

  const obsTimer = setInterval(() => {
    if (!body.isRunning || guard.isEmergency) {
      clearInterval(obsTimer);
      return;
    }
    stepCount++;
    const obs = body.observe();
    console.log(`\n[Step ${stepCount}] OBSERVE:`);
    console.log(`  HP=${obs.health} food=${obs.food} danger=${obs.is_in_danger}`);
    console.log(`  pos=${JSON.stringify(obs.position)} biome=${obs.biome}`);
    if (obs.nearby_blocks.length > 0) {
      console.log(`  blocks: ${obs.nearby_blocks.slice(0, 5).map(b => `${b.name}(${b.closest_distance}m ${b.direction})`).join(", ")}`);
    }
    if (obs.nearby_entities.length > 0) {
      console.log(`  entities: ${obs.nearby_entities.slice(0, 5).map(e => `${e.name}(${e.distance}m ${e.is_hostile ? "HOSTILE" : "safe"})`).join(", ")}`);
    }

    if (guard.shouldStop(obs.health, obs.food)) {
      body.emergencyStop(`Low health/food: hp=${obs.health} food=${obs.food}`);
      clearInterval(obsTimer);
    }
  }, obsInterval);

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(obsTimer);
    console.log(`\n[Shutdown] ${signal} received, stopping...`);
    await body.say("Oneiro shutting down. Goodbye.");
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
