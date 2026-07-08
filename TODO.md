# 🧵 Clotho — TODO & Roadmap

> **How to read this:** Clotho docs describe an ambitious **target design**. This
> file is the opposite — it tracks **what is actually built** and **what to do next**,
> in priority order. When a doc says "Oneiro does X" and this file says X is `📋 TODO`,
> trust this file for ground truth.
>
> Legend: ✅ done · 🔨 built, needs testing/wiring · 📋 not started · 🌱 good first issue · 🚀 post-hackathon

---

## ✅ Working now

- **UMAS contract** (`src/schemas/`) — Zod schemas for intents (7), actions, observations. Game-agnostic.
- **Reflex / SafetyGuard** (`src/reflex/safety-guard.ts`) — rule-based survival guard (`hp<6 || food<2`), step cap, watchdog, `EmergencyStoppable` interface. Game-agnostic.
- **Minecraft body** (`src/body/`) — Mineflayer adapter. `observe()` produces an `Observation`; `act(goal)` executes all 7 intents (GOTO / MINE / CRAFT / PLACE / FOLLOW / SURVIVE / IDLE) via pathfinder. Connection lifecycle + event log.
- **Standalone runner** (`src/index.ts`) — connects the body and runs a manual observe loop with SafetyGuard. No planner.
- **Shared env loader** (`src/env.ts`) — `.env` / `.env.local` parsing for all entrypoints.

## 🔨 Built, needs testing & wiring

- **MCP body bridge** (`src/mcp/body-server.ts`) — MCP server wrapping the body. Tools: `get_state`, `set_goal`, `get_goal_status`, `chat`. Reflex keeps running underneath.
  - [ ] Smoke-test against a real Minecraft server: `npm run mcp` with `MC_*` set, then drive tools with an MCP client (e.g. MCP Inspector).
  - [ ] Connect Hermes as the MCP client: `hermes mcp add clotho-body --command "npx tsx src/mcp/body-server.ts"` (or `--url` if we switch to HTTP/SSE transport).
  - [ ] Decide transport: **stdio** (Hermes owns lifecycle, simplest) vs **HTTP/SSE** (bot stays up independently, easier to watch). Currently stdio.
  - [ ] Consider making `set_goal` non-blocking (return a goal id, poll `get_goal_status`) so the planner isn't stalled during long goals.

## 🔗 Hermes integration — unified launch (planned, minimal)

Goal: the надстройка runs as **one unit** with Hermes, not as a separate `npm run mcp`
process. Hermes spawns stdio `mcp_servers` as child processes on boot, so registering
our bridge in its config means booting Hermes brings up body + reflex automatically.

Minimal change to the Hermes "master" config (`~/.hermes/config.yaml`):

- [ ] Merge the `mcp_servers.clotho-body` block from [`hermes-mcp.example.yaml`](hermes-mcp.example.yaml) into `~/.hermes/config.yaml` (or `hermes mcp add clotho-body --command npx --args tsx --args <abs>/src/mcp/body-server.ts`).
- [ ] Put `CLOTHO_DIR` + `MC_*` values in `~/.hermes/.env` (Hermes interpolates `${VAR}` from there; it does **not** set `cwd` and only forwards the listed `env`, so the script path is absolute and MC vars are passed explicitly).
- [ ] Add a bootstrap step to `Oneiro/demo/run-demo.sh` that ensures the `clotho-body` entry exists before launching Hermes, so `run-demo.sh` starts everything with one command.
- [ ] Verify Hermes discovers the 4 tools (`get_state`, `set_goal`, `get_goal_status`, `chat`) on startup and the planner can call them.
- [ ] Decide: keep `npm run mcp` as a standalone/debug path (MCP Inspector), Hermes-spawned for the real run.

## 📋 Next — close the cognitive loop

- [ ] **Planner prompt + Hermes agent config** — system prompt that turns an `Observation` (from `get_state`) into a `set_goal` call. Gemini 3.5 Flash via Hermes. This is the "slow planner" half.
- [ ] **Planner cadence** — run planning every 30–60s; between plans the body executes the last goal + reflex stays live (`src/index.ts:92-93` TODOs).
- [ ] **Reflex model** — wire the Oneiro model (`oneiro-mc`, Gemma 4 12B) as the fast reflex, emitting UMAS action tokens. SafetyGuard stays as the fallback when the model is unavailable. (Model lives in the Oneiro repo.)
- [ ] **Subsumption** — reflex `SURV_*` output overrides an in-flight planner goal (creeper → flee mid-task).

## 🧹 Docs & hygiene

- [x] Terminology: Clotho = framework, Oneiro = the model, Hermes = planner runtime (see canonical block in `docs/`).
- [x] Add TARGET-vs-NOW status banners to aspirational docs.
- [ ] Fix / relocate: `weaver.md` is about **training data collection** → conceptually belongs in the **Oneiro** repo (training), not Clotho (framework). Move when the two repos are reconciled.
- [ ] `docs/architecture.md` references `dataset.md` which does not exist — banner added, but write the doc or drop the link.
- [ ] `docs/architecture/clotho_core.md` describes the future C++ raw-input core — kept as explicit roadmap, not current code.
- [ ] Tighten `package.json` description ("a fork of Hermes" → "vendors Hermes + TS extension layer").

## 🌱 Good first issues (safe to delegate)

- [ ] **Test harness** — no test runner exists (`typecheck` is the only gate). Add `vitest` and unit-test the game-agnostic pieces: `SafetyGuard` (stop conditions, step cap, watchdog reset) and the Zod schemas (valid/invalid `Goal` parsing). No Minecraft server needed.
- [ ] **MCP Inspector walkthrough** — document how to poke `src/mcp/body-server.ts` with the MCP Inspector, for onboarding.
- [ ] **Doc drift sweep** — grep docs for stale model/framework names and reconcile against the canonical block.

## 🚀 Post-hackathon roadmap

- [ ] Clotho raw-input core: C++ screen capture + keystroke injection (`docs/architecture/clotho_core.md`), replacing Mineflayer as the body adapter.
- [ ] UMAS expansion from ~17 wired actions toward the full ~150-token taxonomy (`docs/tools.md`).
- [ ] Social voice agent (decoupled from movement).
- [ ] Game-agnostic body interface so the framework isn't Minecraft-only.

---

<sub>Ground-truth entry point is always <code>src/index.ts</code> (+ <code>src/mcp/body-server.ts</code>). Keep this file honest.</sub>
