# 🌙 Clotho Framework

> **Autonomous Embodied VLA Agent Framework** — a specialized fork of the Hermes Agent runtime, designed for raw, generalized interaction rather than API-specific wrappers.

<p>
  <a href="https://lablab.ai/ai-hackathons/amd-developer-hackathon-act-ii"><img alt="AMD Developer Hackathon: ACT II" src="https://img.shields.io/badge/Hackathon-AMD%20Developer%20Act%20II-ED1C24?style=flat-square"></a>
  <img alt="Track: Unicorn" src="https://img.shields.io/badge/Track-Unicorn-9B59B6?style=flat-square">
  <img alt="Compute: AMD Developer Cloud" src="https://img.shields.io/badge/Compute-AMD%20Developer%20Cloud-ED1C24?style=flat-square">
  <img alt="Inference: Fireworks AI" src="https://img.shields.io/badge/Inference-Fireworks%20AI-FF6B35?style=flat-square">
  <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-22B14C?style=flat-square">
</p>

> 🌐 **Also read:** [`../Oneiro/README.md`](../Oneiro/README.md) — the working hackathon prototype that runs on Clotho.

---

## What is Clotho?

Clotho is the **cognitive engine** behind [Oneiro](../Oneiro/), an embodied AI agent that lives inside Minecraft. Instead of scripting a game bot, Clotho builds a **Vision-Language-Action (VLA) stack** that perceives a 3D world, reasons about it, and acts — the same loop a human player uses.

The framework's defining principle is **raw I/O**: a low-level core (C++ / TypeScript) that interacts with any environment exactly as a human does — interpreting raw screen buffers and emitting semantic Action Tokens that translate into OS-level keystrokes and mouse deltas. Whether it's Minecraft, a terminal, or a 3D engine, Clotho plays it by *looking at the screen and pressing buttons*.

```
   ┌──────────┐     ┌──────────┐     ┌──────────┐
   │  OBSERVE │────▶│   PLAN   │────▶│   ACT    │
   │  (see)   │     │  (think) │     │  (move)  │
   └──────────┘     └──────────┘     └──────────┘
        ▲                                   │
        └───────────── verify ◀─────────────┘
```

---

## Hackathon Context

This project is our submission to **[AMD Developer Hackathon: ACT II](https://lablab.ai/ai-hackathons/amd-developer-hackathon-act-ii)** on lablab.ai, competing in the **Unicorn** track.

| Resource | Role |
|----------|------|
| **AMD Developer Cloud** | Training & heavy compute (AMD Instinct GPUs, ROCm) |
| **Fireworks AI** | Low-latency model inference and serving |
| **Gemma 4 12B** (open weights, Google) | Base model fine-tuned for Minecraft planning |
| **PLAICraft** (UBC/PLAI) | Time-aligned human Minecraft behavior dataset |

> 🤗 **Model on Hugging Face:** [`Celestis-ai/oneiro-mc`](https://huggingface.co/Celestis-ai/oneiro-mc) *(link will go live once published)*

The hackathon prototype lives in [`../Oneiro/`](../Oneiro/) and demonstrates the full observe → plan → act loop end-to-end with a Mineflayer body. Clotho itself is the longer-term framework architecture that the prototype grows into.

---

## Core Vision: General Embodied Agent (Raw I/O)

The **Clotho Framework** rejects high-level API wrappers (like Mineflayer) as the *final* execution path. The long-term core is a low-level, high-performance runtime (C++ / TypeScript) that interacts with any environment exactly as a human does:

- **Visual Input:** Interpreting raw screen buffers and pixel data natively.
- **Action Tokens → Raw Output:** The Reflex SLM outputs semantic **Action Tokens** (e.g., `<|NAV_FWD|>`, `<|ACT_MINE_TARGET|>`). The custom C++ core instantly intercepts these tokens and translates them into OS-level hardware keystrokes (`W`, `A`, `S`, `D`, `Mouse Delta`).

This architectural shift transforms Oneiro from a mere "game bot" into a true **General Embodied Agent**. The hackathon MVP uses Mineflayer as a temporary body adapter; the production Clotho core replaces it with raw screen/input.

> 📖 Deep dive: [`docs/architecture.md`](docs/architecture.md) — full dual-agent architecture, UMAS taxonomy, FSM orchestrator, and decision diagrams.

---

## Cognitive Engine: Mixture of Agents (MoA)

Clotho leverages the **[Hermes Agent framework](https://github.com/NousResearch/hermes-agent)** (by Nous Research) as its cognitive foundation, wrapping the C++/TS hardware core in its persistent learning loop.

To achieve both high-frequency reaction times and complex long-term reasoning, cognitive load is split across specialized agents:

### 1. Reflex Agent (Motor Cortex)
- **Models:** `Oneiro MC Lite` (e.g., Gemma 1B–3B, fine-tuned on PLAICraft action data)
- **Role:** A lightweight SLM running locally at high frequency (simulating FPS).
- **Function:** Handles immediate survival, micro-movements, combat, and parkour. It interprets visual/state tokens and fires a single UMAS Action Token per forward pass in < 100ms. It does not think about the meaning of life; it thinks about dodging the creeper.

### 2. Planner Agent (Prefrontal Cortex)
- **Models:** `Oneiro MC` (e.g., Gemma 4 12B) or `Oneiro MC Medium` (e.g., Gemma 4 4B)
- **Role:** A heavier, deeper reasoning model that activates periodically (every 30–60s).
- **Function:** Takes high-resolution snapshots of the world, analyzes the environment, and dictates macro-goals. Uses strict **Function Calling (JSON)** to push directives down to the Reflex Agent (e.g., `{"intent": "MINE_TASK", "target": "minecraft:iron_ore", "count": 8}`).

### 3. Social Agent (Voice & Emotion)
- **Models:** Cloud-based multimodal models (e.g., Gemini Flash Live)
- **Role:** Handles real-time voice processing and emotional synthesis via WebSockets.
- **Function:** Listens to raw audio streams, interprets player tone, and generates spoken responses. Totally decoupled from movement logic to prevent context overflow. *(Out of scope for the hackathon MVP.)*

> 📖 Deep dive: [`docs/ADR-001-architecture.md`](docs/ADR-001-architecture.md) — why we chose dual-agent over a single LLM.

---

## Training Data: PLAICraft

Oneiro's Reflex and Planner agents are fine-tuned on **[PLAICraft](https://www.plaicraft.ai/)** — a large-scale, open, multimodal Minecraft behavior dataset from UBC/PLAI.

| Fact | Value |
|------|-------|
| Total collected | 10,000+ hours from 10,000+ participants |
| Public subset | ~200 hours (anonymized, privacy-reviewed) |
| Modalities | Screen video (30 FPS), keyboard/mouse (SQLite), game + mic audio |
| Paper | [arXiv:2505.12707](https://arxiv.org/abs/2505.12707) |

**How we use it:** PLAICraft's time-aligned keyboard/mouse events are windowed (200–500ms) and converted into action labels and high-level planning examples. The hackathon MVP uses a small slice plus a rule-based synthetic fallback (`generate-synthetic.py`) to stay demo-stable under a 4-day deadline.

> ⚠️ PLAICraft has UBC ethics approval and is anonymized before public release. We use it for research prototyping only, cite it clearly, and do not redistribute raw data. See [`../Oneiro/training/README.md`](../Oneiro/training/README.md) for the full pipeline.

---

## 🛡️ "Friend or Foe" System (152-FZ Compliance)

To comply with strict data localization and privacy laws (e.g., Russian Federal Law No. 152-FZ regarding biometric data), Clotho **does not use voice biometrics** to recognize who is speaking.

Instead, it uses a **Vector Injection** system:
1. The voice chat plugin (e.g., Simple Voice Chat) transmits the speaker's in-game `UUID` to the backend.
2. The backend cross-references the UUID with the server's reputation database (HorniDB).
3. The system injects a hidden system tag directly into the Social Agent's prompt.
   *Example: `[System: Interlocutor — Cokeef. Status: Foe. Tone: Aggressive]`*
4. The Social Agent naturally adapts its tone and behavior based on this injected context.

---

## 🗄️ Memory & Persistent Learning

Inherited and enhanced from the Hermes architecture, Clotho features a persistent **Closed Learning Loop**:
- **SQLite + FTS5:** Replaces unreliable vector-only RAG for session history, ensuring lightning-fast and accurate recall of past events, player interactions, and grudges.
- **Skill Generation:** When the Planner Agent successfully solves a complex new problem, it automatically generates a reusable "Skill" (Markdown format), bypassing heavy reasoning in the future.
- **Context Preservation:** Oneiro remembers who built what, who attacked whom, and maintains a consistent personality across server restarts.

---

## 🚀 The Oneiro Lineup (Running on Clotho)

A scalable lineup of agents for different deployment needs:
- **Oneiro MC Lite:** (~1B–2B parameters) Runs entirely locally on player hardware.
- **Oneiro MC Medium:** (e.g., Gemma 4 E2B/E4B) Balanced for self-hosting or light server loads.
- **Oneiro MC (Flagship):** (e.g., Gemma 4 12B) The primary server-side intellect, driving the most complex narrative characters in the Horni universe.

> **Clotho** is the underlying engine. **Oneiro** is the specific neuro-product / AI personality that runs on top of it.

---

## Setup & Installation

### Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| **Node.js** | 22+ | Agent runtime + Mineflayer body |
| **Python** | 3.11+ | Training pipeline |
| **Docker** | any recent | Demo Minecraft server |
| **AMD ROCm** (optional) | 6.2+ | Training on AMD Instinct GPUs |

### 1. Clone

```bash
git clone https://github.com/HorniCompany/Horni.git
cd Horni/Celestis
```

### 2. Run the demo agent (no GPU needed)

The demo uses a **mock planner** (rule-based) so it works on any machine without a model endpoint.

```bash
cd Oneiro
npm install
cp .env.example .env          # leave MODEL_BASE_URL empty for mock planner

# Starts a local Paper 1.21.11 server + the Oneiro agent
./demo/run-demo.sh
```

Connect to the Minecraft server at `localhost:25575` to watch Oneiro act in real time. The console prints the full observe → plan → act → verify cycle.

### 3. Run with a fine-tuned model (AMD Cloud / Fireworks AI)

```bash
# Train (on AMD Developer Cloud with MI300X)
cd Oneiro/training
pip install -r requirements.txt
python generate-synthetic.py --output ./training-data/ --count 2000
python train-lora.py --data ./training-data/ --output ./oneiro-lora/ --epochs 3
python merge-lora.py --adapters ./oneiro-lora/ --output ./oneiro-merged/

# Serve (vLLM on ROCm, or Fireworks AI endpoint)
./serve-vllm.sh ./oneiro-merged/ 8000

# Point the agent at the model
cd ..
echo "MODEL_BASE_URL=http://<server-ip>:8000/v1" >> .env
./demo/run-demo.sh --model
```

### 4. Quick test (agent only, server already running)

```bash
cd Oneiro
MC_HOST=127.0.0.1 MC_PORT=25565 npx tsx src/index.ts --demo
```

> 📖 Full training docs: [`../Oneiro/training/README.md`](../Oneiro/training/README.md)

---

## Project Structure

```
Celestis/
├── Clotho/                      # This framework
│   ├── README.md                # You are here
│   ├── AGENTS.md
│   └── docs/
│       ├── architecture.md      # Dual-agent VLA architecture (full)
│       ├── ADR-001-architecture.md   # Why dual-agent, not one LLM
│       ├── tools.md             # UMAS token taxonomy + MCP tools
│       ├── weaver.md            # Data collection pipeline
│       └── hackathon/
│           └── strategy.md      # Pre-hackathon research notes
│
└── Oneiro/                      # Working hackathon prototype
    ├── README.md                # Prototype README (setup, demo, training)
    ├── src/                     # TypeScript agent runtime
    │   ├── body/                # Mineflayer body (state, actions, safety)
    │   ├── mind/                # Gemma provider, planner, memory, tool bridge
    │   ├── schemas/             # Zod schemas (actions, intents, observation)
    │   └── loop/                # observe → plan → act → verify loop
    ├── training/                # Python fine-tuning pipeline (ROCm/Unsloth)
    ├── demo/                    # Docker Minecraft server + run scripts
    └── docs/                    # Architecture + pitch deck
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [`docs/architecture.md`](docs/architecture.md) | Full dual-agent architecture, UMAS taxonomy, FSM orchestrator, Mermaid diagrams |
| [`docs/ADR-001-architecture.md`](docs/ADR-001-architecture.md) | ADR: why dual-agent (Reflex + Mind) over a single LLM |
| [`docs/tools.md`](docs/tools.md) | UMAS macro-token catalog (~150 tokens) + MCP tools for the Mind agent |
| [`docs/weaver.md`](docs/weaver.md) | The Weaver pipeline — screen capture + telemetry → training dataset |
| [`../Oneiro/README.md`](../Oneiro/README.md) | Working prototype: setup, demo, training, roadmap |
| [`../Oneiro/docs/architecture.md`](../Oneiro/docs/architecture.md) | Prototype component map + data flow |

---

## Roadmap

The hackathon prototype is the foundation. Post-prize work grows it into the full Clotho vision:

1. **Dedicated Horni/Celestis dataset** — consented gameplay from HorniMine players.
2. **Clotho raw-input core** — C++ screen capture + keystroke injection, replacing Mineflayer as the body adapter.
3. **Reflex SLM** — small Gemma 1B–3B fine-tuned for real-time survival at FPS (< 100ms).
4. **Subsumption** — survival instincts override planner directives when a creeper is 3 blocks away.
5. **Long-term world memory** — SQLite + FTS5 for persistent context across sessions.
6. **Social voice agent** — real-time speech interaction via WebSockets, decoupled from movement.
7. **UMAS expansion** — from ~20 hackathon actions toward the full ~150 token taxonomy.

---

## Development Notes

> ⚙️ **Built with heavy AI assistance as part of a rapid hackathon build.**
> This project was developed under a tight 4-day deadline using AI coding tools as a deliberate productivity multiplier. The architecture and design decisions are human-authored; the implementation was accelerated by AI. As with any fast build, treat it as a prototype — review and test before relying on it for anything serious.

---

## Team

**Celestis Laboratory** — building social agents for 3D worlds and spatial computing.

- **Cokeef (Никита)** — Founder, vision, infrastructure
- **Hornik** — AI coding agent
- *(Recruits from the lablab.ai / AMD community)*

---

## License

MIT — see [`LICENSE`](LICENSE).

---

<p align="center">
  <sub>Built for AMD Developer Hackathon: ACT II · Unicorn Track</sub><br>
  <sub>🎮 Oneiro dreams in Minecraft 🌙</sub>
</p>
