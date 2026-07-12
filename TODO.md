# Clotho - TODO & Roadmap

> **How to read this:** Clotho docs describe an ambitious **target design**. This
> file tracks **what is actually built** and **what to do next**, in priority order.
>
> Legend: done - built, needs testing/wiring - not started - good first issue - post-hackathon

---

## Done - Working now

- **UMAS contract** (`src/schemas/`) — Zod schemas for 13 intents, actions, observations (with equipment, terrain relief, visible blocks). Game-agnostic.
- **Reflex / SafetyGuard** (`src/reflex/safety-guard.ts`) — rule-based survival guard (`hp<6 || food<2`), step cap, watchdog, `EmergencyStoppable` interface. Game-agnostic.
- **Minecraft body** (`src/body/`) — Mineflayer adapter. `observe()` produces an `Observation`; `act(goal)` executes all 13 intents via pathfinder. Connection lifecycle + event log.
- **TS planner + chat brain** (`src/brain/`, `src/agent/`) — LLM-based goal planning with humanized chat replies, persona system, ambient replies.
- **Python planner backend** (`backend/`) — FastAPI service with autonomous Observe-Plan-Act loop, multi-step planning (up to 8 goals), score system, world memory database, dynamic crafting hints, Minecraft encyclopedia system prompt.
- **MCP body bridge** (`src/mcp/body-server.ts`, `src/bridge/`) — MCP server wrapping the body. Tools: `get_state`, `set_goal`, `get_goal_status`, `chat`.
- **Docker one-command launch** (`backend/docker-compose.yml`) — brings up MC server + agent, self-driving, works on Linux/macOS/Windows.
- **Shared env loader** (`src/env.ts`) — `.env` / `.env.local` parsing for all entrypoints.
- **Configuration** — All secrets via env vars, `.env.example` templates, no hardcoded keys.

## Built, needs testing & wiring

- [ ] Smoke-test the Python backend against a real Minecraft server with a live Gemini key.
- [ ] Connect Hermes as an alternative MCP client: `hermes mcp add clotho-body --command "npx tsx src/mcp/body-server.ts"`.
- [ ] Wire the TS planner's `PlannerResponse` to support multi-step `goals` array (currently single `goal`).
- [ ] Add state-extractor fields: `equipment`, `visible_blocks`, `terrain_relief` (schemas support them, extractor doesn't populate yet).
- [ ] Test the score system and world memory persistence across restarts.

## Next - close the remaining gaps

- [ ] **Reflex model** — wire the Oneiro model (`oneiro-mc`, Gemma 4 12B) as the fast reflex, emitting UMAS action tokens. SafetyGuard stays as fallback.
- [ ] **Subsumption** — reflex `SURV_*` output overrides an in-flight planner goal (creeper -> flee mid-task).
- [ ] **Hermes unified launch** — register the MCP bridge in Hermes config so booting Hermes brings up body + reflex automatically.

## Good first issues

- [ ] **Test harness** — no test runner exists (`typecheck` is the only gate). Add `vitest` and unit-test game-agnostic pieces: `SafetyGuard`, Zod schemas, Pydantic schemas.
- [ ] **MCP Inspector walkthrough** — document how to poke `src/mcp/body-server.ts` with the MCP Inspector.
- [ ] **Doc drift sweep** — grep docs for stale model/framework names.

## Post-hackathon roadmap

- [ ] Clotho raw-input core: C++ screen capture + keystroke injection, replacing Mineflayer as the body adapter.
- [ ] UMAS expansion from 13 wired intents toward the full ~150-token taxonomy.
- [ ] Social voice agent (decoupled from movement).
- [ ] Game-agnostic body interface so the framework isn't Minecraft-only.

---

<sub>Ground-truth entry points: `src/index.ts` (TS runner) and `backend/app/main.py` (Python planner). Keep this file honest.</sub>
