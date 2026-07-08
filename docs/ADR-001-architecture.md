# ADR-001: Dual-Model Architecture — Why Two Agents?

> **Status**: Accepted
> **Date**: 2026-03-30 (rewritten from 2026-03-06)

---

## Context

Oneiro is an autonomous VLA-agent in Minecraft. The main requirement: **< 100ms latency** for reflexes (combat, survival) while maintaining the ability to plan, communicate, and build.

## The Key Question

**One LLM or two different ones?**

---

## Option A: One LLM for Everything

Use a single model (Qwen3.5-35B-A3B or Gemini Flash Lite) for reflexes, planning, and chat.

| Pros | Cons |
|---|---|
| Simple architecture | Impossible to be both fast AND deep simultaneously |
| Single deployment | If the LLM "thinks" for 3 sec — the bot is dead from a creeper |
| Less code | API models have unpredictable latency |

**Problem:** Qwen with `enable_thinking: true` generates 100+ thinking tokens → 500ms+. Gemini via API → 1-3 sec. **No single model can be both fast and smart.**

---

## Option B: Two Agents (Accepted ✅)

**Reflex (Qwen3.5-35B-A3B)** — local, `enable_thinking: false`, macro-tokens.
**Mind (Gemini 3.1 Flash Lite)** — API via OpenClaw, asynchronous.
**Deep Think (Gemini 3 Deep Think)** — for super-heavy tasks.

| Pros | Cons |
|---|---|
| Reflexes < 100ms (single token!) | More complex architecture |
| Planning without limits | Needs an orchestrator (Node.js) |
| Each model is optimal for its task | Two deployments (local + API) |
| OpenClaw provides memory, web search, tools | API dependency for planning |
| Subsumption (instinct > command) | Coordination protocol |

---

## Key Decisions

### Why Qwen3.5-35B-A3B for Reflexes?

| Criterion | Qwen3.5-35B-A3B | Qwen3.5-9B (Dense) | Gemini Flash Lite |
|---|---|---|---|
| Active parameters | **3B** | 9B | N/A (cloud) |
| Latency (5 tokens) | ~50ms | ~150ms | ~1-3 sec |
| Multimodality | ✅ Native | ✅ | ✅ |
| `enable_thinking: false` | ✅ | ✅ | N/A |
| Local deployment | ✅ (TPU v6e) | ✅ | ❌ |
| Vocabulary control | ✅ Macro-tokens | ✅ | ❌ |

**Verdict:** MoE 35B (3B active) is faster than Dense 9B, while having access to 35B parameters of knowledge. Macro-tokens are impossible via API.

### Why Gemini for Planning, Not Another Qwen?

- **OpenClaw** provides ready infrastructure: memory, web search, function calling, multimodality
- The planner **doesn't need** speed — 3-10 sec is fine for strategy
- Gemini Flash Lite costs $0.25/1M input — pennies
- **Gemini 3 Deep Think** is available for super-heavy tasks (test-time compute)

### Why Not OpenClaw for Reflexes?

OpenClaw works through API (gateway → agent → LLM → response). Each hop adds latency. For < 100ms you need a **direct** model call on the same server, without network delays.

---

## Protocol: Master-Worker

```
Gemini (Foreman)  ──JSON directive──►  Node.js (Walkie)  ──prompt──►  Qwen (Worker)
                                            │
                                     Ephemeral Board
                                     (HP, goal, inventory)
```

- **Gemini** doesn't know about macro-tokens. It outputs abstract JSON directives.
- **Node.js** translates the directive into a text prompt for Qwen.
- **Qwen** doesn't know about Gemini. It sees a frame + text → outputs a macro-token.
- **Subsumption**: if there's a threat in the frame — the reflex overrides the directive.

---

## Historical Note

Originally (v1.0, March 2026) the architecture assumed:
- One Gemini Flash Lite for everything
- Reflexes = local JavaScript script (if/else, no LLM)
- OpenClaw as the main framework

This was replaced with dual-agent after realizing:
1. JavaScript reflexes can't "see" — they only react to API numbers
2. A single LLM can't be both fast and smart simultaneously
3. Fine-tuned Qwen with macro-tokens = true Vision-Language-Action

---

## Related Documents

| Document | Description |
|---|---|
| [architecture.md](architecture.md) | Full technical architecture |
| [README.md](../README.md) | Master Summary & Blueprint |

<p align="center">
  <sub>📅 Updated: 2026-03-30</sub>
</p>
