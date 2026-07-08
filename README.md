# 🌙 Clotho Framework

> **The embodied-agent framework that agents run on** — the [Hermes Agent](https://github.com/NousResearch/hermes-agent) planning runtime plus a TypeScript надстройка (extension layer) that gives an AI mind a body in a 3D world: the UMAS action/intent/observation contract, a game-decoupled reflex/safety engine, a Minecraft body adapter, and the orchestrator. Our fine-tuned model [Oneiro](https://github.com/celestislab/Oneiro) plugs into Clotho as the reflex brain.

<p>
  <a href="https://lablab.ai/ai-hackathons/amd-developer-hackathon-act-ii"><img alt="AMD Developer Hackathon: ACT II" src="https://img.shields.io/badge/Hackathon-AMD%20Developer%20Act%20II-ED1C24?style=flat-square"></a>
  <img alt="Track: Unicorn" src="https://img.shields.io/badge/Track-Unicorn-9B59B6?style=flat-square"></a>
  <img alt="Compute: AMD Developer Cloud" src="https://img.shields.io/badge/Compute-AMD%20Developer%20Cloud-ED1C24?style=flat-square"></a>
  <img alt="Inference: Fireworks AI" src="https://img.shields.io/badge/Inference-Fireworks%20AI-FF6B35?style=flat-square"></a>
  <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-22B14C?style=flat-square"></a>
</p>

---

## What is Clotho?

Clotho is the **framework agents run on** — the runtime that turns a set of models into an embodied agent. It is the Hermes Agent planning runtime plus a TypeScript надстройка (extension layer) that supplies everything a mind needs to inhabit a body:

- **UMAS Schemas** (Zod) — the action/intent/observation vocabulary that any agent must speak
- **Reflex Engine** — `SafetyGuard`, a game-decoupled survival system that enforces stop conditions (low health, step limits, watchdog timeouts) regardless of what the planner decides
- **Body adapter** — a Minecraft (Mineflayer) implementation of the framework's body interface: state extraction, action execution, connection lifecycle
- **Hermes runtime** — vendored planning layer (memory, tools, provider routing) that hosts the planner agent

The models are **guests** on this framework: our fine-tuned **Oneiro** model runs on Clotho as the fast reflex brain, and **Gemini 3.5 Flash** runs on it (via Hermes) as the slow planner.

The schema and reflex layers are intentionally **game-agnostic** — no `mineflayer` import. The `SafetyGuard` operates through an `EmergencyStoppable` interface, and only the body adapter is Minecraft-specific, so swapping the game (or moving to a raw screen/input body) means replacing one layer.

```
    ┌──────────┐     ┌──────────┐     ┌──────────┐
    │  OBSERVE │────▶│   PLAN   │────▶│   ACT    │
    │  (see)   │     │  (think) │     │  (move)  │
    └──────────┘     └──────────┘     └──────────┘
         ▲                                   │
         └───────────── verify ◀─────────────┘
```

> **Clotho** = the framework agents run on (Hermes runtime + TS надстройка: schemas, reflex, body, orchestrator). **Oneiro** = our fine-tuned model that runs on Clotho as the reflex brain. **Hermes** = the planning runtime by [Nous Research](https://github.com/NousResearch/hermes-agent), vendored inside Clotho.

---

## Hackathon Context

This project is our submission to **[AMD Developer Hackathon: ACT II](https://lablab.ai/ai-hackathons/amd-developer-hackathon-act-ii)** on lablab.ai, competing in the **Unicorn** track.

| Resource | Role |
|----------|------|
| **Gemma 4 12B** (open weights, Google) | Base model fine-tuned for **reflexes** (vision-based survival, combat) |
| **Gemini 3.5 Flash** (Google API) | **Planner** — strategic reasoning via Hermes Agent runtime |
| **PLAICraft** (UBC/PLAI) | Time-aligned human Minecraft behavior dataset for reflex training |
| **Hermes Agent** (Nous Research) | Planning runtime — memory, tools, provider routing |
| **AMD Developer Cloud** | Training & heavy compute (AMD Instinct GPUs, ROCm) |

> 🤗 **Reflex model on Hugging Face:** [`Celestis-ai/oneiro-mc`](https://huggingface.co/Celestis-ai/oneiro-mc) *(link will go live once published)*

---

## Architecture: Dual-Agent VLA

Oneiro uses a **dual-agent architecture** to separate fast reflexes from slow planning:

### 1. Reflex Agent (Motor Cortex) — the **Oneiro** model (Gemma 4 12B fine-tune, `oneiro-mc`)
- Fine-tuned on PLAICraft behavior data for vision-based survival
- Outputs UMAS action tokens (single-token classification, < 100ms target)
- Handles combat, dodging, parkour, emergency survival
- Served via vLLM (ROCm) or llama.cpp (GGUF fallback)
- **Hackathon MVP**: rule-based `SafetyGuard` as fallback when model is unavailable

### 2. Planner Agent (Prefrontal Cortex) — Gemini 3.5 Flash via Hermes
- Cloud API model, runs asynchronously every 30-60s
- Takes world observations, outputs high-level goals (JSON)
- Hermes provides: memory (SQLite+FTS5), skills, provider routing, tool dispatch
- **Does NOT control raw movements** — only sets strategic directives

### 3. Social Agent (Voice & Emotion) — *Future*
- Real-time voice processing and emotional synthesis
- Candidates: Gemini 3.5 Flash Live, GPT Realtime 2.1 mini
- Decoupled from movement logic *(Out of scope for hackathon MVP)*

### MCP Bridge
- Connects the Hermes planner to the Mineflayer body
- Exposes safe tools: `get_state()`, `set_goal()`, `get_goal_status()`
- **Never used for reflexes** — only for periodic planning cycles

```
┌─────────────────────────────────────────────────────────────┐
│  REFLEX LAYER (Clotho, TypeScript + Gemma 4 12B, <100ms)   │
│  Fine-tuned oneiro-mc → UMAS action tokens                  │
│  SafetyGuard fallback: HP<6→stop, food<2→eat, creeper→flee │
│  ⚡ Vision-based, local inference, no network for survival  │
└──────────────────────────┬──────────────────────────────────┘
                           │ goal override (subsumption)
┌──────────────────────────▼──────────────────────────────────┐
│  MCP BRIDGE (TS ↔ Python, every 30-60s)                     │
│  get_state() ──► Hermes ◄── set_goal()                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  HERMES PLANNER (Python, Gemini 3.5 Flash, every 30-60s)   │
│  AIAgent loop + SQLite memory + Skills + Provider routing   │
│  🧠 Strategic reasoning — "build a shelter", "mine iron"    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  SOCIAL AGENT (Future: Gemini 3.5 Flash Live / GPT RT 2.1) │
│  Voice + emotion, decoupled from movement                   │
└─────────────────────────────────────────────────────────────┘
```

> 📖 Deep dive: [`docs/architecture.md`](docs/architecture.md) — full architecture, UMAS taxonomy, FSM orchestrator, decision diagrams.
> 📖 ADR: [`docs/ADR-001-architecture.md`](docs/ADR-001-architecture.md) — why dual-agent over a single LLM.

---

## What's in This Repo

```
Clotho/
├── src/
│   ├── hermes/               # Vendored Hermes Agent (Python, not committed)
│   ├── schemas/              # UMAS contract (Zod-validated)
│   │   ├── actions.ts        # 17 low-level primitives
│   │   ├── intents.ts        # 7 high-level goals + GoalResult
│   │   └── observation.ts    # Full world state structure
│   ├── reflex/
│   │   └── safety-guard.ts   # Reflex engine (EmergencyStoppable interface)
│   ├── body/                 # Minecraft body adapter (Mineflayer)
│   │   ├── minecraft-body.ts # Connection lifecycle, observation/action API
│   │   ├── state-extractor.ts# Extracts world state → Observation
│   │   └── action-executor.ts# Executes goals → Mineflayer actions
│   ├── mcp/
│   │   └── body-server.ts    # MCP bridge: exposes the body to the Hermes planner
│   ├── env.ts                # Shared .env loader for all entrypoints
│   └── index.ts              # Standalone runner (body + reflex, planner pending)
├── docs/                     # Architecture, ADRs, tools, weaver
├── TODO.md                   # Ground-truth build status & roadmap
├── package.json              # @celestis/clotho (zod + mineflayer + mcp-sdk + openai)
└── tsconfig.json
```

Run the MCP bridge (needs a Minecraft server + `MC_*` env vars):

```bash
npm run mcp   # starts src/mcp/body-server.ts on stdio
# then connect the planner:
#   hermes mcp add clotho-body --command "npx tsx src/mcp/body-server.ts"
```

---

## Related Repositories

| Repo | What | URL |
|------|------|-----|
| **Clotho** (this) | The framework agents run on: Hermes runtime + TS надстройка (schemas, reflex, body, orchestrator) | [github.com/celestislab/Clotho](https://github.com/celestislab/Clotho) |
| **Oneiro** | Our fine-tuned model + its training pipeline and demo | [github.com/celestislab/Oneiro](https://github.com/celestislab/Oneiro) |
| **oneiro-mc** | The Oneiro model weights (Gemma 4 12B LoRA, Minecraft checkpoint) | [huggingface.co/Celestis-ai/oneiro-mc](https://huggingface.co/Celestis-ai/oneiro-mc) |
| **Hermes** | Planning runtime, vendored inside Clotho (`src/hermes/`) | [github.com/NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) |

---

## Installation

All runnable code lives here in Clotho (`src/`, TypeScript). The Oneiro repo holds the model, its training pipeline, and the demo scripts — which launch this framework. Clone both side by side:

```bash
git clone https://github.com/celestislab/Clotho.git
git clone https://github.com/celestislab/Oneiro.git

cd Clotho
npm install
npm run typecheck   # tsc --noEmit — the only quality gate

# Vendor the Hermes planning runtime (not committed)
git clone --depth 1 https://github.com/NousResearch/hermes-agent.git src/hermes && rm -rf src/hermes/.git
```

`Oneiro/demo/run-demo.sh` sets `CLOTHO_DIR=../Clotho` and runs the agent from here (`npx tsx src/index.ts --demo`). See the [Oneiro README](https://github.com/celestislab/Oneiro) for the model, training, and demo details.

---

## Training Data: PLAICraft

Oneiro's model is fine-tuned on **[PLAICraft](https://www.plaicraft.ai/)** — a large-scale, open, multimodal Minecraft behavior dataset from UBC/PLAI.

| Fact | Value |
|------|-------|
| Total collected | 10,000+ hours from 10,000+ participants |
| Public subset | ~200 hours (anonymized, privacy-reviewed) |
| Modalities | Screen video (30 FPS), keyboard/mouse (SQLite), game + mic audio |
| Paper | [arXiv:2505.12707](https://arxiv.org/abs/2505.12707) |

> ⚠️ PLAICraft has UBC ethics approval and is anonymized before public release. We use it for research prototyping only, cite it clearly, and do not redistribute raw data. See [Oneiro/training/README.md](https://github.com/celestislab/Oneiro/blob/main/training/README.md) for the full pipeline.

---

## Roadmap

The hackathon prototype is the foundation. Post-prize work grows it into the full Clotho vision:

1. **Reflex model optimization** — optimize oneiro-mc (Gemma 4 12B) for real-time inference at FPS (< 100ms)
2. **Clotho raw-input core** — C++ screen capture + keystroke injection, replacing Mineflayer as the body adapter
3. **Subsumption** — survival instincts (reflex) override planner directives when a creeper is 3 blocks away
4. **Social voice agent** — real-time speech via Gemini 3.5 Flash Live / GPT Realtime 2.1 mini, decoupled from movement
5. **UMAS expansion** — from ~17 hackathon actions toward the full ~150 token taxonomy

---

## Team

**Celestis Laboratory** — building social agents for 3D worlds and spatial computing.

- Cokeef (Nikita) — Founder, vision, infrastructure
- Hornik — AI coding agent
- *(Recruits from the lablab.ai / AMD community)*

---

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  <sub>Built for AMD Developer Hackathon: ACT II · Unicorn Track</sub><br>
  <sub>🎮 Oneiro dreams in Minecraft 🌙</sub>
</p>
