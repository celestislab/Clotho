# Clotho Framework — AI Agent Instructions

> This file provides context for AI coding agents working on the Clotho framework.

## What is Clotho?

Clotho is the **cognitive engine** behind Oneiro, an embodied AI agent in Minecraft. It provides:
- **UMAS schemas** (Zod + Pydantic) — the action/intent/observation contract between mind and body
- **Reflex engine** — `SafetyGuard`, a mineflayer-decoupled safety/reflex system
- **Minecraft body adapter** — Mineflayer-based state extraction and action execution (13 intents)
- **Python planner backend** — FastAPI service running the autonomous Observe-Plan-Act loop
- **TS planner + chat brain** — Alternative TypeScript-native planner with humanized chat
- **Hermes runtime** — Vendored planning layer (Nous Research)
- **Framework docs** — architecture, ADRs

## Key Design Principles

1. **Framework vs Product separation** — Clotho contains framework code (schemas, reflex, body, planner). The Oneiro repo holds the model and training pipeline.
2. **No Minecraft dependencies in schemas/reflex** — `src/schemas/` and `src/reflex/` must not import `mineflayer`. Use interfaces (e.g. `EmergencyStoppable`) for decoupling. The `src/body/` adapter is the sanctioned exception.
3. **Zod for all TS schemas, Pydantic for all Python schemas** — strict validation, no `any`, type-safe contracts.
4. **English only** — all documentation and code comments in English.
5. **No hardcoded secrets** — all API keys and config via environment variables. `.env` files are gitignored, `.env.example` templates are committed.
6. **No hardcoded paths** — use config settings (e.g. `settings.memory_dir`) instead of absolute filesystem paths.

## Structure

```
Clotho/
├── src/
│   ├── schemas/          # UMAS contract (Zod): 13 intents, actions, observation
│   ├── reflex/           # SafetyGuard reflex engine
│   ├── body/             # Mineflayer body adapter (the only mineflayer import)
│   ├── brain/            # TS planner + chat brain
│   ├── agent/            # Agent loop orchestrator
│   ├── bridge/           # MCP server + test client
│   ├── mcp/              # MCP body bridge
│   ├── util/             # Humanizer and utilities
│   ├── hermes/           # Vendored Hermes Agent (Python)
│   ├── env.ts            # Shared .env loader
│   └── index.ts          # TS standalone runner
├── backend/              # Python FastAPI planner backend
│   ├── app/              # FastAPI app, config, routes, services, schemas
│   ├── Dockerfile        # Combined Python+Node image
│   ├── docker-compose.yml # One-command demo (MC server + agent)
│   └── requirements.txt  # Python dependencies
├── docs/                 # Architecture, ADRs
├── Dockerfile            # Full Clotho+Hermes multi-stage image
└── package.json          # @celestis/clotho
```

## Commands

```bash
npm install
npm run typecheck   # tsc --noEmit — the ONLY quality gate
npm run dev         # tsx watch src/index.ts
npm run demo        # tsx src/index.ts --demo
npm run mcp         # tsx src/mcp/body-server.ts (MCP bridge on stdio)
npm run bridge      # tsx src/bridge-main.ts
```

Python backend:
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload    # dev
docker compose up --build        # full demo stack (MC + agent)
```

## Related Repos

- **Oneiro** (`github.com/celestislab/Oneiro`) — the product that runs on Clotho
- **Model** — `Celestis-ai/oneiro-mc` on Hugging Face
- **Hermes** (`github.com/NousResearch/hermes-agent`) — vendored at `src/hermes/`
