# Clotho Framework

> **The embodied-agent framework that agents run on** — the [Hermes Agent](https://github.com/NousResearch/hermes-agent) planning runtime plus a TypeScript extension layer that gives an AI mind a body in a 3D world: the UMAS action/intent/observation contract, a game-decoupled reflex/safety engine, a Minecraft body adapter, a Python FastAPI planner backend, and the orchestrator. Our fine-tuned model [Oneiro](https://github.com/celestislab/Oneiro) plugs into Clotho as the reflex brain.

<p>
  <a href="https://lablab.ai/ai-hackathons/amd-developer-hackathon-act-ii"><img alt="AMD Developer Hackathon: ACT II" src="https://img.shields.io/badge/Hackathon-AMD%20Developer%20Act%20II-ED1C24?style=flat-square"></a>
  <img alt="Track: Unicorn" src="https://img.shields.io/badge/Track-Unicorn-9B59B6?style=flat-square"></a>
  <img alt="Compute: AMD Developer Cloud" src="https://img.shields.io/badge/Compute-AMD%20Developer%20Cloud-ED1C24?style=flat-square"></a>
  <img alt="Inference: Fireworks AI" src="https://img.shields.io/badge/Inference-Fireworks%20AI-FF6B35?style=flat-square"></a>
  <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-22B14C?style=flat-square"></a>
</p>

---

## Quick Start (Docker, one command)

The fastest way to see Oneiro live in Minecraft:

```bash
cd Clotho/backend
cp .env.example .env          # put your Gemini API key in LLM_API_KEY
docker compose up --build     # builds + launches MC server + agent
```

This brings up **two containers** on a shared network:

| Service | What it does |
|---------|-------------|
| `oneiro-mc` | A clean Paper 1.21.11 server (creative, peaceful, flat world). Port `25599` exposed so you can join with your client. |
| `oneiro-backend` | FastAPI planner + TS MCP bridge + Mineflayer body. Waits for MC to be healthy, then auto-starts the Observe-Plan-Act loop. API on port `8000`. |

Join the server at `localhost:25599` and watch Oneiro think, move, mine, craft, and explore autonomously.

> **Live server mode:** To run Oneiro against an existing Minecraft server, use `docker compose -f docker-compose.hornimine.yml up --build` (connects via host networking, manual planner start for safety).

---

## What is Clotho?

Clotho is the **framework agents run on** — the runtime that turns a set of models into an embodied agent. It supplies everything a mind needs to inhabit a body:

- **UMAS Schemas** (Zod + Pydantic) — the action/intent/observation vocabulary that any agent must speak
- **Reflex Engine** — `SafetyGuard`, a game-decoupled survival system that enforces stop conditions (low health, step limits, watchdog timeouts) regardless of what the planner decides
- **Body adapter** — a Minecraft (Mineflayer) implementation of the framework's body interface: state extraction, action execution, connection lifecycle
- **Python planner backend** — a FastAPI service that runs the Observe-Plan-Act cognitive loop: observes the world via MCP, asks an LLM (Gemini) for multi-step goals, and executes them sequentially through the body
- **TS planner + chat brain** — an alternative TypeScript-native planner with a chat personality layer (humanized typing, ambient replies, persona)
- **Hermes runtime** — vendored planning layer (memory, tools, provider routing) that hosts the planner agent

The models are **guests** on this framework: our fine-tuned **Oneiro** model runs on Clotho as the fast reflex brain, and **Gemini** runs on it as the slow planner.

The schema and reflex layers are intentionally **game-agnostic** — no `mineflayer` import. The `SafetyGuard` operates through an `EmergencyStoppable` interface, and only the body adapter is Minecraft-specific.

```
    ┌──────────┐     ┌──────────┐     ┌──────────┐
    │  OBSERVE │────▶│   PLAN   │────▶│   ACT    │
    │  (see)   │     │  (think) │     │  (move)  │
    └──────────┘     └──────────┘     └──────────┘
         ^                                   |
         └───────────── verify <─────────────┘
```

> **Clotho** = the framework agents run on (Hermes runtime + TS extension layer: schemas, reflex, body, orchestrator). **Oneiro** = our fine-tuned model that runs on Clotho as the reflex brain. **Hermes** = the planning runtime by [Nous Research](https://github.com/NousResearch/hermes-agent), vendored inside Clotho.

---

## Hackathon Context

This project is our submission to **[AMD Developer Hackathon: ACT II](https://lablab.ai/ai-hackathons/amd-developer-hackathon-act-ii)** on lablab.ai, competing in the **Unicorn** track.

| Resource | Role |
|----------|------|
| **Gemma 4 12B** (open weights, Google) | Base model fine-tuned for **reflexes** (vision-based survival, combat) |
| **Gemini** (Google API) | **Planner** — strategic reasoning, multi-step goal generation |
| **PLAICraft** (UBC/PLAI) | Time-aligned human Minecraft behavior dataset for reflex training |
| **Hermes Agent** (Nous Research) | Planning runtime — memory, tools, provider routing |
| **AMD Developer Cloud** | Training & heavy compute (AMD Instinct GPUs, ROCm) |

> **Reflex model on Hugging Face:** [`Celestis-ai/oneiro-mc`](https://huggingface.co/Celestis-ai/oneiro-mc) *(link will go live once published)*

---

## Architecture: Dual-Agent VLA

Oneiro uses a **dual-agent architecture** to separate fast reflexes from slow planning:

### 1. Reflex Agent (Motor Cortex) — the **Oneiro** model (Gemma 4 12B fine-tune, `oneiro-mc`)
- Fine-tuned on PLAICraft behavior data for vision-based survival
- Outputs UMAS action tokens (single-token classification, < 100ms target)
- Handles combat, dodging, parkour, emergency survival
- Served via vLLM (ROCm) or llama.cpp (GGUF fallback)
- **Current fallback**: rule-based `SafetyGuard` (HP<6, food<2, step cap, watchdog)

### 2. Planner Agent (Prefrontal Cortex) — Gemini via FastAPI backend
- Cloud API model, runs asynchronously every 15-45s
- Takes world observations, outputs **multi-step goal sequences** (up to 8 goals)
- Includes a **score system** (exploration, discovery, survival, goal completion)
- Maintains a **world memory database** (tracks crafting tables, furnaces, ores)
- Generates **dynamic crafting hints** based on current inventory
- **Does NOT control raw movements** — only sets strategic directives

### 3. Chat Brain (Social Layer)
- Separate LLM call for low-latency, personality-driven chat replies
- Humanized typing speed, reaction delays, ambient replies
- Configurable persona (name, language, tone)

### MCP Bridge
- Connects the Python planner to the TypeScript Mineflayer body
- Exposes safe tools: `get_state()`, `set_goal()`, `get_goal_status()`, `chat()`
- **Never used for reflexes** — only for periodic planning cycles

```
+-------------------------------------------------------------+
|  REFLEX LAYER (Clotho TS, SafetyGuard, <100ms)             |
|  SafetyGuard: HP<6->stop, food<2->eat, creeper->flee        |
|  Local, no network for survival                             |
+--------------------------+----------------------------------+
                           | goal override (subsumption)
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

> Deep dive: [`docs/ADR-001-architecture.md`](docs/ADR-001-architecture.md) — why dual-agent over a single LLM.

---

## What's in This Repo

```
Clotho/
├── src/
│   ├── hermes/               # Vendored Hermes Agent (Python, committed)
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
│   ├── env.ts                # Shared .env loader for all entrypoints
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
│   └── .env.example          # Configuration template (copy to .env)
├── docs/                     # Architecture, ADRs
├── Dockerfile                # Full Clotho+Hermes multi-stage image
├── TODO.md                   # Ground-truth build status & roadmap
├── package.json              # @celestis/clotho (zod + mineflayer + mcp-sdk + openai)
└── tsconfig.json
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

## REST API (Python backend)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Backend status (online, mock mode) |
| `/agent/step` | POST | Execute one Observe-Plan-Act cycle |
| `/agent/start` | POST | Start autonomous background loop |
| `/agent/stop` | POST | Stop autonomous loop |
| `/agent/status` | GET | Current status (goal, thought, score, achievements) |

---

## Configuration

All configuration is via environment variables (`.env` files, never committed).

### Python backend (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_API_KEY` | (empty) | Gemini API key. If empty, runs in mock mode. |
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

## Installation (manual, without Docker)

All runnable code lives here in Clotho. The Oneiro repo holds the model, its training pipeline, and the demo scripts.

```bash
git clone https://github.com/celestislab/Clotho.git
git clone https://github.com/celestislab/Oneiro.git

cd Clotho
npm install
npm run typecheck   # tsc --noEmit — the only quality gate

# Python backend (optional, for the FastAPI planner)
cd backend
pip install -r requirements.txt
cp .env.example .env   # edit with your Gemini API key
uvicorn app.main:app --reload
```

### Run the TS standalone runner (body + reflex + TS planner + chat)

```bash
cp .env.example .env   # edit with your API key and MC connection
npm run demo           # tsx src/index.ts --demo
```

### Run the MCP bridge (for Python backend or Hermes)

```bash
npm run mcp   # starts src/mcp/body-server.ts on stdio
# then connect the planner:
#   hermes mcp add clotho-body --command "npx tsx src/mcp/body-server.ts"
```

---

## Related Repositories

| Repo | What | URL |
|------|------|-----|
| **Clotho** (this) | The framework agents run on: Hermes runtime + TS extension layer + Python planner backend | [github.com/celestislab/Clotho](https://github.com/celestislab/Clotho) |
| **Oneiro** | Our fine-tuned model + its training pipeline and demo | [github.com/celestislab/Oneiro](https://github.com/celestislab/Oneiro) |
| **oneiro-mc** | The Oneiro model weights (Gemma 4 12B LoRA, Minecraft checkpoint) | [huggingface.co/Celestis-ai/oneiro-mc](https://huggingface.co/Celestis-ai/oneiro-mc) |
| **Hermes** | Planning runtime, vendored inside Clotho (`src/hermes/`) | [github.com/NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) |

---

## Training Data: PLAICraft

Oneiro's model is fine-tuned on **[PLAICraft](https://www.plaicraft.ai/)** — a large-scale, open, multimodal Minecraft behavior dataset from UBC/PLAI.

| Fact | Value |
|------|-------|
| Total collected | 10,000+ hours from 10,000+ participants |
| Public subset | ~200 hours (anonymized, privacy-reviewed) |
| Modalities | Screen video (30 FPS), keyboard/mouse (SQLite), game + mic audio |
| Paper | [arXiv:2505.12707](https://arxiv.org/abs/2505.12707) |

> PLAICraft has UBC ethics approval and is anonymized before public release. We use it for research prototyping only, cite it clearly, and do not redistribute raw data. See [Oneiro/training/README.md](https://github.com/celestislab/Oneiro/blob/main/training/README.md) for the full pipeline.

---

## Roadmap

1. **Reflex model optimization** — optimize oneiro-mc (Gemma 4 12B) for real-time inference at FPS (< 100ms)
2. **Clotho raw-input core** — C++ screen capture + keystroke injection, replacing Mineflayer as the body adapter
3. **Subsumption** — survival instincts (reflex) override planner directives when a creeper is 3 blocks away
4. **Social voice agent** — real-time speech via Gemini Live / GPT Realtime, decoupled from movement
5. **UMAS expansion** — from 13 hackathon intents toward the full ~150 token taxonomy

---

## Team

**Celestis Laboratory** — building social agents for 3D worlds and spatial computing.

- Cokeef (Nikita) — Founder, vision, infrastructure
- Halva (Arseniy) — Backend engineering, planner system
- Hornik — AI coding agent
- *(Recruits from the lablab.ai / AMD community)*

---

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  <sub>Built for AMD Developer Hackathon: ACT II - Unicorn Track</sub><br>
  <sub>Oneiro dreams in Minecraft</sub>
</p>
