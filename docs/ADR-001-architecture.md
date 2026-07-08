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

Use a single model (Gemma 4 12B or Gemini 3.5 Flash) for reflexes, planning, and chat.

| Pros | Cons |
|---|---|
| Simple architecture | Impossible to be both fast AND deep simultaneously |
| Single deployment | If the LLM "thinks" for 3 sec — the bot is dead from a creeper |
| Less code | API models have unpredictable latency |

**Problem:** Gemma 4 12B with thinking enabled generates 100+ thinking tokens → 500ms+. Gemini via API → 1-3 sec. **No single model can be both fast and smart.**

---

## Option B: Two Agents (Accepted ✅)

**Reflex (Gemma 4 12B — `oneiro-mc`)** — local, fine-tuned, single-token UMAS output, `Celestis-ai/oneiro-mc` on HuggingFace.
**Planner (Gemini 3.5 Flash)** — API via Hermes Agent runtime, asynchronous.
**Social (Gemini 3.5 Flash Live / GPT Realtime 2.1 mini)** — future agent, decoupled voice/streaming layer.

| Pros | Cons |
|---|---|
| Reflexes < 100ms (single token!) | More complex architecture |
| Planning without limits | Needs an orchestrator (Node.js) |
| Each model is optimal for its task | Two deployments (local + API) |
| Hermes provides memory, web search, tools | API dependency for planning |
| Subsumption (instinct > command) | Coordination protocol |

---

## Key Decisions

### Why Gemma 4 12B for Reflexes?

| Criterion | Gemma 4 12B (`oneiro-mc`) | Qwen3.5-9B (Dense) | Gemini 3.5 Flash |
|---|---|---|---|
| Active parameters | **12B** | 9B | N/A (cloud) |
| Latency (single token) | ~40-80ms | ~150ms | ~1-3 sec |
| Multimodality | ✅ Native | ✅ | ✅ |
| Open weights | ✅ | ✅ | ❌ |
| Local deployment | ✅ | ✅ | ❌ |
| Fine-tunable (PLAICraft) | ✅ | ✅ | ❌ |
| Single-token UMAS output | ✅ Fine-tuned | ❌ | ❌ |

**Verdict:** Gemma 4 12B has **open weights** — we can fine-tune it on PLAICraft gameplay data to output a **single UMAS macro-token** per frame, eliminating decode latency. It's multimodal (vision + text), locally deployable, and published on HuggingFace as `Celestis-ai/oneiro-mc`. A 12B dense model fine-tuned for one-token action selection is faster and more reliable than any API for reflexes.

### Why Gemini 3.5 Flash for Planning?

- **Hermes Agent runtime** provides ready infrastructure: memory, web search, function calling, multimodality
- The planner **doesn't need** speed — 3-10 sec is fine for strategy
- Gemini 3.5 Flash is fast for an API model and cheap — pennies per query
- No need for local deployment — planning is inherently asynchronous
- Hermes integration gives the planner tool use, memory persistence, and multi-step reasoning out of the box

### Why Social Agent is Future?

- **Voice latency** is the hardest unsolved problem — sub-200ms voice round-trip requires streaming/realtime infrastructure that doesn't exist yet in the Clotho stack
- **Decoupled architecture** — the social layer should be independent of reflexes and planning, so it can be swapped/upgraded without touching the core cognitive loop
- **Candidate models:** Gemini 3.5 Flash Live (bidirectional streaming) or GPT Realtime 2.1 mini — both are emerging realtime voice APIs
- The agent interface is already defined (UMAS), so the social agent slots in cleanly when the technology matures

### Why Not Hermes for Reflexes?

Hermes works through API (gateway → agent → LLM → response). Each hop adds latency. For < 100ms you need a **direct** model call on the same server, without network delays.

---

## Protocol: Master-Worker

```
Gemini 3.5 Flash (Planner)  ──JSON directive──►  Node.js (Walkie)  ──prompt──►  Gemma 4 12B (Reflex)
                                                   │
                                            Ephemeral Board
                                            (HP, goal, inventory)
```

- **Gemini 3.5 Flash** doesn't know about macro-tokens. It outputs abstract JSON directives.
- **Node.js** translates the directive into a text prompt for the reflex model.
- **Gemma 4 12B** doesn't know about Gemini. It sees a frame + text → outputs a UMAS macro-token.
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
3. Fine-tuned Gemma 4 12B with UMAS macro-tokens = true Vision-Language-Action

---

## Related Documents

| Document | Description |
|---|---|
| [architecture.md](architecture.md) | Full technical architecture |
| [README.md](../README.md) | Master Summary & Blueprint |

<p align="center">
  <sub>📅 Updated: 2026-07-08</sub>
</p>
