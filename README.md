# 🌙 Clotho Framework

> **Autonomous Embodied VLA Agent Framework** — a TypeScript-native cognitive engine for embodied AI agents in 3D worlds. Provides the action/intent/observation contract and reflex engine that the [Oneiro](https://github.com/celestislab/Oneiro) product runs on.

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
| **AMD Developer Cloud** | Training & heavy compute (AMD Instinct GPUs, ROCm) |
| **Fireworks AI** | Low-latency model inference and serving |
| **Gemma 4 12B** (open weights, Google) | Base model fine-tuned for Minecraft planning |
| **PLAICraft** (UBC/PLAI) | Time-aligned human Minecraft behavior dataset |
| **Hermes Agent** (Nous Research) | Planning runtime — memory, tools, provider routing |

> 🤗 **Model on Hugging Face:** [`Celestis-ai/oneiro-mc`](https://huggingface.co/Celestis-ai/oneiro-mc) *(link will go live once published)*

---

## Architecture: Dual-Agent VLA

Oneiro uses a **dual-agent architecture** to separate fast reflexes from slow planning:

### 1. Reflex (Motor Cortex) — lives in Clotho
- Rule-based safety engine + future SLM (Gemma 1B-3B)
- **< 100ms** latency, runs every tick
- Handles survival, combat avoidance, emergency stop
- **Does NOT go through Hermes or MCP** — pure local TypeScript

### 2. Planner (Prefrontal Cortex) — lives in Hermes
- Fine-tuned Gemma 4 12B (`oneiro-mc`) via Hermes Agent runtime
- **30-60s** planning cycle, fully asynchronous
- Takes world observations, outputs high-level goals (JSON)
- Hermes provides: memory (SQLite+FTS5), skills, provider routing, tool dispatch

### 3. MCP Bridge — lives in Oneiro
- Connects the Hermes planner to the Mineflayer body
- Exposes safe tools: `get_state()`, `set_goal()`, `get_goal_status()`
- **Never used for reflexes** — only for periodic planning cycles

```
┌─────────────────────────────────────────────────────────┐
│  REFLEX LOOP (Clotho, TypeScript, <100ms, every tick)   │
│  SafetyGuard → HP<6→stop, food<2→eat, creeper→flee     │
│  ⚡ No model, no Hermes, no MCP — pure local rules       │
└────────────────────────┬────────────────────────────────┘
                         │ goal override
┌────────────────────────▼────────────────────────────────┐
│  MCP BRIDGE (Oneiro, TS↔Python, every 30-60s)           │
│  get_state() ──► Hermes ◄── set_goal()                  │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│  HERMES PLANNER (Python, every 30-60s)                  │
│  AIAgent loop + Gemma 4 12B + SQLite memory + Skills    │
│  🧠 2-5s per planning cycle — fine for 30-60s window    │
└─────────────────────────────────────────────────────────┘
```

> 📖 Deep dive: [`docs/architecture.md`](docs/architecture.md) — full architecture, UMAS taxonomy, FSM orchestrator, decision diagrams.
> 📖 ADR: [`docs/ADR-001-architecture.md`](docs/ADR-001-architecture.md) — why dual-agent over a single LLM.

---

## What's in This Repo

```
Clotho/
├── src/
│   ├── schemas/              # UMAS contract (Zod-validated)
│   │   ├── actions.ts        # 17 low-level primitives
│   │   ├── intents.ts        # 7 high-level goals + GoalResult
│   │   └── observation.ts    # Full world state structure
│   ├── reflex/
│   │   └── safety-guard.ts   # Reflex engine (EmergencyStoppable interface)
│   └── index.ts              # Barrel exports
├── docs/
│   ├── architecture.md       # Dual-agent VLA architecture (full)
│   ├── ADR-001-architecture.md  # Why dual-agent, not one LLM
│   ├── tools.md              # UMAS token taxonomy + MCP tools
│   ├── weaver.md             # Data collection pipeline
│   └── architecture/clotho_core.md  # C++ core vision (post-hackathon)
├── package.json              # @celestis/clotho (zod only, no game deps)
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

1. **Reflex SLM** — small Gemma 1B-3B fine-tuned for real-time survival at FPS (< 100ms)
2. **Clotho raw-input core** — C++ screen capture + keystroke injection, replacing Mineflayer as the body adapter
3. **Subsumption** — survival instincts override planner directives when a creeper is 3 blocks away
4. **Social voice agent** — real-time speech interaction via WebSockets, decoupled from movement
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
