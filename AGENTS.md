# Clotho Framework — AI Agent Instructions

> This file provides context for AI coding agents working on the Clotho framework.

## What is Clotho?

Clotho is the **cognitive engine** behind Oneiro, an embodied AI agent in Minecraft. It provides:
- **UMAS schemas** (Zod) — the action/intent/observation contract between mind and body
- **Reflex engine** — `SafetyGuard`, a mineflayer-decoupled safety/reflex system
- **Framework docs** — architecture, ADRs, tool taxonomy, data pipeline

## Key Design Principles

1. **Framework vs Product separation** — Clotho contains only framework code (schemas, reflex, docs). All Minecraft-specific code lives in the Oneiro product repo.
2. **No Minecraft dependencies** — Clotho must not import `mineflayer` or any game-specific library. Use interfaces (e.g. `EmergencyStoppable`) for decoupling.
3. **Zod for all schemas** — strict validation, no `any`, type-safe contracts.
4. **English only** — all documentation and code comments in English.

## Structure

```
Clotho/
├── src/
│   ├── schemas/          # UMAS contract (actions, intents, observation)
│   ├── reflex/           # SafetyGuard reflex engine
│   └── index.ts          # Barrel exports
├── docs/                 # Architecture, ADRs, tools, weaver
└── package.json          # @celestis/clotho (private, zod only)
```

## Related Repos

- **Oneiro** (`github.com/celestislab/Oneiro`) — the product that runs on Clotho
- **Model** — `Celestis-ai/oneiro-mc` on Hugging Face
