# Clotho

> An embodied AI agent framework for Minecraft. Clotho gives an LLM a body — it sees the world, thinks about what to do, and acts on it. Built for the [AMD Developer Hackathon: ACT II](https://lablab.ai/ai-hackathons/amd-developer-hackathon-act-ii) (Unicorn track).

<p>
  <a href="https://lablab.ai/ai-hackathons/amd-developer-hackathon-act-ii"><img alt="AMD Developer Hackathon: ACT II" src="https://img.shields.io/badge/Hackathon-AMD%20Developer%20Act%20II-ED1C24?style=flat-square"></a>
  <img alt="Track: Unicorn" src="https://img.shields.io/badge/Track-Unicorn-9B59B6?style=flat-square"></a>
  <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-22B14C?style=flat-square"></a>
</p>

---

## Quick Start

```bash
cd Clotho/backend
cp .env.example .env          # put your Gemini API key in LLM_API_KEY
docker compose up --build     # launches MC server + agent
```

Join the server at `localhost:25599`, API on `localhost:8000`. The agent connects, observes the world, plans multi-step goals with Gemini, and executes them — mining, crafting, exploring, and surviving autonomously.

To run against an existing Minecraft server instead:

```bash
docker compose -f docker-compose.hornimine.yml up --build
```

---

## What is Clotho?

Clotho is a framework that turns an LLM into an embodied Minecraft agent. The agent runs a continuous **Observe-Plan-Act** loop:

1. **Observe** — a Mineflayer body extracts the full game state (health, inventory, nearby blocks, entities, terrain, equipment) into a typed `Observation`
2. **Plan** — the planner sends the observation to an LLM (Gemini) and gets back a sequence of up to 8 high-level goals, each with a reason and optional chat message
3. **Act** — the body executes each goal through Mineflayer (pathfinding, mining, crafting, placing, combat, smelting, etc.)
4. **Verify** — a `SafetyGuard` reflex layer monitors health/food and can emergency-stop at any time, independent of the planner

A separate **chat brain** gives the agent a personality — humanized typing speed, reaction delays, and ambient replies — so it feels like a real player talking in chat.

```
    +----------+     +----------+     +----------+
    | OBSERVE  |---->| PLAN     |---->| ACT      |
    | (see)    |     | (think)  |     | (move)   |
    +----------+     +----------+     +----------+
         ^                                   |
         +------------- verify <-------------+
```

The schema and reflex layers are **game-agnostic** — no `mineflayer` import. Only the body adapter knows about Minecraft, so swapping the game means replacing one layer.

---

## Architecture

### Reflex Layer (TypeScript, SafetyGuard)

A rule-based survival system that runs independently of the planner:
- Emergency stop when health < 6 or food < 2
- Step cap per goal (configurable, default 50)
- Watchdog timeout per goal execution (default 60s)
- Operates through an `EmergencyStoppable` interface — no Minecraft dependency

### Planner (Python, FastAPI + Gemini)

The "prefrontal cortex" — strategic reasoning every 15-45 seconds:
- Observes the world via MCP, asks Gemini for multi-step goal sequences (up to 8 goals per cycle)
- **Score system** — rewards exploration, item discovery, goal completion; penalizes damage and death
- **World memory database** — persists known locations of crafting tables, furnaces, ores, and chests across cycles
- **Dynamic crafting hints** — generates contextual tips based on current inventory ("You have 4+ planks, craft a Crafting Table!")
- **Minecraft encyclopedia** — the system prompt includes ore generation, crafting recipes, combat strategies, and fuel guides
- **Sleep-polling** — during the interval between planning cycles, checks for new player chat or danger and wakes up immediately if detected

### Chat Brain (TypeScript, Gemini)

A separate LLM call for low-latency social interaction:
- Humanized typing speed (configurable characters per second)
- Randomized reaction delays (180-520ms by default)
- Ambient replies (occasionally initiates conversation)
- Configurable persona (name, language, tone)

### Body (TypeScript, Mineflayer)

The Minecraft adapter — the only place `mineflayer` is imported:
- **State extractor** — reads the world and produces a typed `Observation`
- **Action executor** — turns `Goal` objects into Mineflayer actions (13 intents)
- **Connection lifecycle** — connect, spawn, handle kicks/errors, graceful shutdown

### MCP Bridge

Connects the Python planner to the TypeScript body over stdio:
- `get_state()` — returns the current `Observation` as JSON
- `set_goal(goal)` — sends a goal to the body and blocks until completion
- `get_goal_status()` — queries the status of the current goal
- `chat(message)` — sends a chat message through the body

```
+-------------------------------------------------------------+
|  REFLEX LAYER (TS, SafetyGuard)                             |
|  HP<6 -> stop, food<2 -> eat, step cap, watchdog            |
+--------------------------+----------------------------------+
                           |
+--------------------------v----------------------------------+
|  PYTHON PLANNER (FastAPI + Gemini, every 15-45s)            |
|  Observe -> Multi-step Plan (up to 8 goals) -> Execute      |
|  Score system + World memory + Dynamic hints                |
+--------------------------+----------------------------------+
                           | MCP stdio bridge
+--------------------------v----------------------------------+
|  TS BODY (Mineflayer)                                       |
|  13 intents: GOTO, MINE, CRAFT, PLACE, FOLLOW, SURVIVE,     |
|  EQUIP, SMELT, DROP, ATTACK, DEPOSIT, WITHDRAW, IDLE       |
+-------------------------------------------------------------+

+-------------------------------------------------------------+
|  CHAT BRAIN (TS, Gemini, humanized replies)                 |
|  Persona + typing speed + ambient replies                   |
+-------------------------------------------------------------+
```

---

## UMAS Intent Taxonomy

The agent communicates through 13 high-level intents:

| Intent | Description | Parameters |
|--------|-------------|------------|
| `GOTO` | Navigate to coordinates, player, or landmark | `position` or `target` |
| `MINE_TASK` | Mine a specific block type | `target`, `count` |
| `CRAFT_TASK` | Craft an item using a known recipe | `target`, `count` |
| `PLACE_TASK` | Place a block at a specific location | `target`, `position` |
| `FOLLOW_PLAYER` | Follow a named player at safe distance | `target` (player name) |
| `SURVIVE` | Prioritize survival: eat, flee, find shelter | none |
| `EQUIP_TASK` | Equip weapon, tool, armor, or shield | `target` (item name) |
| `SMELT_TASK` | Smelt ores or cook food in a furnace | `target`, `count` |
| `DROP_TASK` | Drop items for the player to pick up | `target`, `count` |
| `ATTACK_TASK` | Hunt/attack a nearby entity | `target` |
| `DEPOSIT_TASK` | Deposit items into a chest | `target`, `position` |
| `WITHDRAW_TASK` | Withdraw items from a chest | `target`, `position` |
| `IDLE` | Stop and wait | none |

---

## REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Backend status (online, mock mode) |
| `/agent/step` | POST | Execute one Observe-Plan-Act cycle |
| `/agent/start` | POST | Start autonomous background loop |
| `/agent/stop` | POST | Stop autonomous loop |
| `/agent/status` | GET | Current status (goal, thought, score, achievements) |

---

## Repository Structure

```
Clotho/
├── src/
│   ├── schemas/              # UMAS contract (Zod-validated)
│   │   ├── actions.ts        # Low-level primitives
│   │   ├── intents.ts        # 13 high-level intents + GoalResult
│   │   └── observation.ts    # Full world state (health, inventory, terrain, equipment)
│   ├── reflex/
│   │   └── safety-guard.ts   # Reflex engine (EmergencyStoppable interface)
│   ├── body/                 # Minecraft body adapter (Mineflayer)
│   │   ├── minecraft-body.ts # Connection lifecycle, observation/action API
│   │   ├── state-extractor.ts# Extracts world state -> Observation
│   │   └── action-executor.ts# Executes goals -> Mineflayer actions (13 intents)
│   ├── brain/                # TS-native planner + chat brain
│   │   ├── planner.ts        # LLM-based goal planning
│   │   ├── chat.ts           # Personality-driven chat replies
│   │   └── llm.ts            # Shared LLM client utilities
│   ├── agent/
│   │   └── agent-loop.ts     # Orchestrates observe-plan-act-chat cycle
│   ├── bridge/               # MCP server + test client
│   ├── mcp/
│   │   └── body-server.ts    # MCP bridge: exposes the body to the Python planner
│   ├── util/
│   │   └── humanize.ts       # Anti-robot typing/reaction timing
│   ├── env.ts                # Shared .env loader
│   └── index.ts              # Standalone TS runner (body + reflex + planner + chat)
├── backend/                  # Python FastAPI planner backend
│   ├── app/
│   │   ├── main.py           # FastAPI app with lifespan management
│   │   ├── core/config.py    # Pydantic settings (env-driven, no hardcoded keys)
│   │   ├── api/routes.py     # REST API: /agent/step, /start, /stop, /status
│   │   ├── services/
│   │   │   ├── planner.py    # Autonomous Observe-Plan-Act loop + score + world memory
│   │   │   ├── llm.py        # LLM client (Gemini) with Minecraft encyclopedia prompt
│   │   │   └── mcp_client.py # MCP stdio client -> TS body bridge
│   │   └── schemas/          # Pydantic schemas (mirrors TS Zod schemas)
│   ├── Dockerfile            # Combined Python+Node image for the backend
│   ├── docker-compose.yml    # One-command demo: MC server + agent
│   ├── docker-compose.hornimine.yml  # Live server mode (host networking)
│   ├── requirements.txt      # Python dependencies
│   └── .env.example          # Configuration template
├── docs/                     # Architecture, ADRs
├── TODO.md                   # Build status & roadmap
├── package.json              # @celestis/clotho
└── tsconfig.json
```

---

## Configuration

All configuration is via environment variables. `.env` files are gitignored, `.env.example` templates are committed.

### Python backend (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_API_KEY` | (empty) | Gemini API key. If empty, runs in mock mode (rule-based). |
| `LLM_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai/` | OpenAI-compatible endpoint |
| `LLM_MODEL` | `gemini-3.5-flash` | Planner model |
| `MC_HOST` | `127.0.0.1` | Minecraft server host |
| `MC_PORT` | `25565` | Minecraft server port |
| `MC_USERNAME` | `Oneiro` | Bot username |
| `MC_VERSION` | `1.21.11` | Minecraft version |
| `MC_AUTH` | `offline` | Auth mode (`offline` or `microsoft`) |
| `CLOTHO_TS_DIR` | `..` | Path to Clotho TS directory (for MCP bridge) |
| `LOOP_INTERVAL_SECONDS` | `15` | Planning cycle interval |
| `AUTO_START_PLANNER` | `false` | Auto-start loop on boot (compose sets `true`) |
| `MEMORY_DIR` | `data/memory` | Persistent memory directory (score, world DB) |
| `PLAYER_NAME` | (empty) | Player username for command parsing in prompts |

### TS runner (`Clotho/.env`)

See [`.env.example`](.env.example) for the full list (planner, chat, persona, humanizer, loop tuning).

---

## Manual Installation

```bash
git clone https://github.com/celestislab/Clotho.git
cd Clotho
npm install
npm run typecheck   # tsc --noEmit — the only quality gate
```

### TS standalone runner (body + reflex + TS planner + chat)

```bash
cp .env.example .env   # edit with your API key and MC connection
npm run demo           # tsx src/index.ts --demo
```

### Python backend (FastAPI planner)

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # edit with your Gemini API key
uvicorn app.main:app --reload
```

### MCP bridge (for connecting the Python planner to the body)

```bash
npm run mcp   # starts src/mcp/body-server.ts on stdio
```

---

## Roadmap

The hackathon prototype is the foundation. Next steps:

1. **Reflex model** — wire a fine-tuned vision model as the fast reflex brain, emitting UMAS action tokens in < 100ms. `SafetyGuard` stays as the fallback.
2. **Subsumption** — survival reflexes override in-flight planner goals (e.g. creeper nearby -> flee mid-task).
3. **Hermes integration** — connect the [Hermes Agent](https://github.com/NousResearch/hermes-agent) runtime (vendored at `src/hermes/`) as an alternative planner with persistent SQLite memory, skills, and provider routing.
4. **State extractor expansion** — populate `equipment`, `visible_blocks`, and `terrain_relief` fields (schemas already support them).
5. **Social voice agent** — real-time speech, decoupled from movement.
6. **Raw-input core** — C++ screen capture + keystroke injection, replacing Mineflayer as the body adapter.
7. **UMAS expansion** — from 13 intents toward a full ~150-token action taxonomy.

> See [TODO.md](TODO.md) for ground-truth build status.

---

## Related Repositories

| Repo | What | URL |
|------|------|-----|
| **Clotho** (this) | Framework: schemas, reflex, body, planner, chat | [github.com/celestislab/Clotho](https://github.com/celestislab/Clotho) |
| **Oneiro** | Model training pipeline and demo scripts | [github.com/celestislab/Oneiro](https://github.com/celestislab/Oneiro) |

---

## Team

**Celestis Laboratory** — building social agents for 3D worlds and spatial computing.

- Cokeef (Nikita) — Founder, vision, infrastructure
- Halva (Arseniy) — Backend engineering, planner system
- Hornik — AI coding agent

---

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  <sub>Built for AMD Developer Hackathon: ACT II - Unicorn Track</sub><br>
  <sub>Oneiro dreams in Minecraft</sub>
</p>
