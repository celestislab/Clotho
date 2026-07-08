# 🌙 Clotho Framework

> **Autonomous Embodied VLA Agent Framework** — a fork of the [Hermes Agent](https://github.com/NousResearch/hermes-agent) runtime with TypeScript extensions for embodied AI agents in 3D worlds. Provides a fine-tuned reflex model, action/intent/observation contract, reflex safety engine, and a Minecraft body adapter that the [Oneiro](https://github.com/celestislab/Oneiro) product runs on.

<p>
  <a href="https://lablab.ai/ai-hackathons/amd-developer-hackathon-act-ii"><img alt="AMD Developer Hackathon: ACT II" src="https://img.shields.io/badge/Hackathon-AMD%20Developer%20Act%20II-ED1C24?style=flat-square"></a>
  <img alt="Track: Unicorn" src="https://img.shields.io/badge/Track-Unicorn-9B59B6?style=flat-square"></a>
  <img alt="Compute: AMD Developer Cloud" src="https://img.shields.io/badge/Compute-AMD%20Developer%20Cloud-ED1C24?style=flat-square"></a>
  <img alt="Inference: Fireworks AI" src="https://img.shields.io/badge/Inference-Fireworks%20AI-FF6B35?style=flat-square"></a>
  <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-22B14C?style=flat-square"></a>
</p>

---

## What is Clotho?

Clotho is the **framework layer** of the Oneiro embodied agent stack. It defines the contract between an AI mind and a virtual body:

- **UMAS Schemas** (Zod) — the action/intent/observation vocabulary that any agent must speak
- **Reflex Engine** — `SafetyGuard`, a game-decoupled survival system that enforces stop conditions (low health, step limits, watchdog timeouts) regardless of what the planner decides

Clotho is intentionally **game-agnostic**. It has no `mineflayer` dependency — the `SafetyGuard` operates through an `EmergencyStoppable` interface that any body adapter can implement.

```
    ┌──────────┐     ┌──────────┐     ┌──────────┐
    │  OBSERVE │────▶│   PLAN   │────▶│   ACT    │
    │  (see)   │     │  (think) │     │  (move)  │
    └──────────┘     └──────────┘     └──────────┘
         ▲                                   │
         └───────────── verify ◀─────────────┘
```

> **Clotho** = framework (schemas + reflex). **Oneiro** = product (Mineflayer body + Hermes planner). **Hermes** = the planning runtime by [Nous Research](https://github.com/NousResearch/hermes-agent).

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

### 1. Reflex Agent (Motor Cortex) — Gemma 4 12B fine-tune (`oneiro-mc`)
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
│   └── index.ts              # Entry point (body + reflex, planner pending)
├── docs/                     # Architecture, ADRs, tools, weaver
├── package.json              # @celestis/clotho (zod + mineflayer + openai)
└── tsconfig.json
```

---

## Related Repositories

| Repo | What | URL |
|------|------|-----|
| **Clotho** (this) | Framework: schemas + reflex engine | [github.com/celestislab/Clotho](https://github.com/celestislab/Clotho) |
| **Oneiro** | Product: Mineflayer body + Hermes planner + training | [github.com/celestislab/Oneiro](https://github.com/celestislab/Oneiro) |
| **oneiro-mc** | Fine-tuned model (Gemma 4 12B LoRA) | [huggingface.co/Celestis-ai/oneiro-mc](https://huggingface.co/Celestis-ai/oneiro-mc) |
| **Hermes** | Planning runtime (vendored in Oneiro) | [github.com/NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) |

---

## Installation (for Oneiro development)

Clotho is consumed by Oneiro via a symlink (`Oneiro/src/clotho → ../Clotho/src`). Clone both repos side by side:

```bash
git clone https://github.com/celestislab/Clotho.git
git clone https://github.com/celestislab/Oneiro.git
# Oneiro imports Clotho schemas + reflex through the symlink
```

See the [Oneiro README](https://github.com/celestislab/Oneiro) for full setup, demo, and training instructions.

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
