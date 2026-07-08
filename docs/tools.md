# 🔧 Oneiro Action Interfaces

> Two types: **UMAS macro-tokens** (Qwen Reflex) + **MCP Tools** (Gemini Mind)
> Updated: 2026-03-30

---

## Overview

Oneiro uses **two distinct action interfaces**, one for each agent:

| Agent | Interface | Format | Latency |
|---|---|---|---|
| 🦴 Qwen (Reflex) | UMAS macro-tokens | One special token (Static Logit Bias) | < 100ms |
| 🧠 Gemini (Mind) | MCP Tools (OpenClaw) | JSON function calling | 3-10 sec |

Both interfaces are ultimately translated through the Node.js Orchestrator into **Mineflayer API** calls.

> ⚠️ **Static Logit Bias**, not `prefix_allowed_tokens_fn`!
> On TPU, dynamic Python functions break XLA graphs (Host-Device Sync → 500ms+).
> Instead, a tensor mask is used: 150 UMAS tokens = 0, the rest = -inf.
> The mask is embedded into `lm_head` during graph compilation. Overhead: **0ms**.

---

## 🦴 UMAS macro-tokens (Reflex Agent)

Special tokens added to the Qwen vocabulary during fine-tuning.
One forward pass → one token → instant reaction.

> **Canonical standard name:** All tokens follow the `{CATEGORY}_{ACTION}` taxonomy.
> Prefixes: `NAV_`, `CAM_`, `ACT_`, `INV_`, `SURV_`, `SYS_`.

### 🟢 NAV_ — Navigation (~25 tokens)

| Token | Mineflayer action | Description |
|---|---|---|
| `<\|NAV_FWD\|>` | `bot.setControlState('forward', true)` | Step forward |
| `<\|NAV_BWD\|>` | `bot.setControlState('back', true)` | Step back |
| `<\|NAV_STRAFE_L\|>` | `bot.setControlState('left', true)` | Strafe left |
| `<\|NAV_STRAFE_R\|>` | `bot.setControlState('right', true)` | Strafe right |
| `<\|NAV_FWD_SPRINT\|>` | `forward:true + sprint:true` | Sprint forward |
| `<\|NAV_FWD_SPRINT_JUMP\|>` | `forward:true + sprint:true + jump:true` | Sprint-jump |
| `<\|NAV_BWD_JUMP\|>` | `back:true + jump:true` | Jump back (evade) |
| `<\|NAV_JUMP\|>` | `bot.setControlState('jump', true)` | Jump in place |
| `<\|NAV_SWIM_UP\|>` | `jump:true` (in water) | Swim up |
| `<\|NAV_SWIM_DOWN\|>` | `sneak:true` (in water) | Swim down |
| `<\|NAV_SNEAK_FWD\|>` | `sneak:true + forward:true` | Sneak + forward (bridging) |
| `<\|NAV_SNEAK_BWD\|>` | `sneak:true + back:true` | Sneak + back |
| `<\|NAV_FREEZE\|>` | `bot.clearControlStates()` | Full stop (Creaking!) |
| `<\|NAV_MOUNT\|>` | `bot.mount(nearest_vehicle)` | Mount vehicle (1.21.11) |
| `<\|NAV_DISMOUNT\|>` | `bot.dismount()` | Dismount |

### 🟡 CAM_ — Camera & aiming (~10 tokens)

| Token | Mineflayer action | Description |
|---|---|---|
| `<\|CAM_PITCH_UP_15\|>` | `bot.look(yaw, pitch - 0.26)` | Camera up 15° |
| `<\|CAM_PITCH_DOWN_15\|>` | `bot.look(yaw, pitch + 0.26)` | Camera down 15° |
| `<\|CAM_YAW_L_30\|>` | `bot.look(yaw + 0.52, pitch)` | Turn left 30° |
| `<\|CAM_YAW_R_30\|>` | `bot.look(yaw - 0.52, pitch)` | Turn right 30° |
| `<\|CAM_YAW_L_90\|>` | `bot.look(yaw + Math.PI/2, pitch)` | Sharp turn left |
| `<\|CAM_YAW_R_90\|>` | `bot.look(yaw - Math.PI/2, pitch)` | Sharp turn right |
| `<\|CAM_LOCK_THREAT\|>` | `bot.lookAt(threat.pos.offset(0,1.5,0))` | Aim at threat ⭐ |
| `<\|CAM_LOCK_TARGET\|>` | `bot.lookAt(ephemeralBoard.target_coords)` | Aim at target block |
| `<\|CAM_LOOK_DOWN\|>` | `bot.look(yaw, Math.PI/2)` | Look down (bridging, MLG) |
| `<\|CAM_LOOK_UP\|>` | `bot.look(yaw, -Math.PI/2)` | Look up (pillaring) |

### 🔴 ACT_ — Contextual interaction (~20 tokens)

| Token | Mineflayer action | Description |
|---|---|---|
| `<\|ACT_ATK_MELEE\|>` | `bot.attack(bot.entityAtCursor())` | Hit with item in hand |
| `<\|ACT_ATK_RANGED\|>` | `bot.activateItem(); delay; bot.deactivateItem()` | Shoot/throw |
| `<\|ACT_THROW_SPEAR\|>` | timings for Spear 1.21.11 | Throw spear |
| `<\|ACT_MINE_TARGET\|>` | `bot.dig(bot.blockAtCursor())` | Mine block at cursor |
| `<\|ACT_PLACE_ACTIVE\|>` | `bot.placeBlock(reference, face)` | Place block from hand |
| `<\|ACT_INTERACT\|>` | `bot.activateBlock(bot.blockAtCursor())` | Open/press (chest, Copper Bulb) |
| `<\|ACT_USE_ACTIVE\|>` | `bot.consume()` | Use (food, potion) |
| `<\|ACT_SHIELD_UP\|>` | `bot.activateItem(true)` (offhand) | Raise shield |
| `<\|ACT_SHIELD_DOWN\|>` | `bot.deactivateItem()` | Lower shield |
| `<\|ACT_DROP_ACTIVE\|>` | `bot.tossStack(item)` | Drop item |
| `<\|ACT_PICKUP_NEAR\|>` | Orchestrator: navigate to nearest drop | Pick up drop |

### 🎒 INV_ — Semantic inventory (~20 tokens)

| Token | Mineflayer action | Description |
|---|---|---|
| `<\|INV_EQUIP_MELEE_BEST\|>` | Orchestrator: max DPS → `bot.equip(item, 'hand')` | Best melee weapon |
| `<\|INV_EQUIP_TOOL_BEST\|>` | Orchestrator: for block at cursor → `bot.equip()` | Best tool |
| `<\|INV_EQUIP_RANGED\|>` | `bot.equip(bow/crossbow, 'hand')` | Bow/crossbow |
| `<\|INV_EQUIP_SHIELD\|>` | `bot.equip(shield, 'off-hand')` | Shield |
| `<\|INV_EQUIP_WATER_BUCKET\|>` | `bot.equip(water_bucket, 'hand')` | Water bucket (MLG!) |
| `<\|INV_EQUIP_JUNK_BLOCK\|>` | Orchestrator: dirt/stone → `bot.equip()` | Building block |
| `<\|INV_EQUIP_FOOD_BEST\|>` | Orchestrator: max saturation → `bot.equip()` | Best food |
| `<\|INV_EQUIP_SPEAR\|>` | `bot.equip(spear, 'hand')` | Spear (1.21.11) |
| `<\|INV_HOTBAR_NEXT\|>` | `bot.setQuickBarSlot(current + 1)` | Next slot |
| `<\|INV_HOTBAR_PREV\|>` | `bot.setQuickBarSlot(current - 1)` | Previous slot |

### 🚨 SURV_ — Survival instincts (~15 tokens)

> **Intercept the Orchestrator FSM!** On receiving SURV_ → `bot.pathfinder.stop()` → immediate execution.

| Token | Mineflayer action | Description |
|---|---|---|
| `<\|SURV_FLEE_180\|>` | Turn 180° + sprint + jump | Turnaround + run ⭐ |
| `<\|SURV_SHIELD_UP\|>` | `bot.activateItem(true)` (offhand) | Emergency shield |
| `<\|SURV_EAT_NOW\|>` | Best food → `bot.consume()` | Emergency food (HP < 8) |
| `<\|SURV_WATER_BUCKET_MLG\|>` | look down + equip bucket + place | MLG with water |
| `<\|SURV_BURY_SELF\|>` | `bot.dig(down)` ×3 + `bot.placeBlock(up)` | Bury self from mobs |
| `<\|SURV_DODGE_L\|>` | Sharp strafe left | Dodge |
| `<\|SURV_DODGE_R\|>` | Sharp strafe right | Dodge |
| `<\|SURV_PILLAR_UP\|>` | jump + place under ×4 | Pillaring |
| `<\|SURV_RETREAT_SAFE\|>` | Pathfinder → safe zone | Retreat |
| `<\|SURV_BLOCK_CREEPER\|>` | equip junk + place around creeper | Wall off creeper |

### ⚙️ SYS_ — System orchestration (~5 tokens)

| Token | Orchestrator action | Description |
|---|---|---|
| `<\|SYS_YIELD_TO_MIND\|>` | **No-op.** Continue Mind directive | Most frequent (~60-70%) ⭐ |
| `<\|SYS_REQ_MIND_UPDATE\|>` | Request to Gemini for re-evaluation | Environment changed |
| `<\|SYS_TASK_COMPLETE\|>` | Directive completion trigger | Task completed |
| `<\|SYS_STUCK\|>` | Increment watchdog counter | Stuck |
| `<\|SYS_WAIT\|>` | No-op, pause | Waiting (furnace, crafting) |

---

## 🧠 MCP Tools (Mind Agent — Gemini via OpenClaw)

JSON function calling via OpenClaw. **Mind does NOT control the bot directly.**
Mind issues abstract directives, and the Orchestrator executes them via Mineflayer pathfinder under Qwen's visual supervision.

> ⚠️ **Important:** Mind does NOT call `move_to(x,y,z)` or `mine_block(x,y,z)` directly!
> Direct control would block the Orchestrator and break Subsumption.
> Mind issues **intent**, not step-by-step commands.

### 📊 Information tools (Read-only)

#### `get_inventory`
```json
{ "name": "get_inventory", "parameters": {} }
```

#### `scan_blocks`
```json
{ "name": "scan_blocks", "parameters": { "radius": 16, "filter": "minecraft:iron_ore" } }
```

#### `get_nearby_entities`
```json
{ "name": "get_nearby_entities", "parameters": { "radius": 32, "type": "hostile" } }
```

#### `get_status`
```json
{ "name": "get_status", "parameters": {} }
```

### 📋 Strategic tools (Directives)

#### `set_directive`
Mind's primary tool → set a strategic goal.

```json
{
  "name": "set_directive",
  "parameters": {
    "intent": "MINE_TASK",
    "target": "minecraft:iron_ore",
    "coords": {"x": 100, "y": 60, "z": -50},
    "priority": "normal"
  }
}
```

Supported intents:

| Intent | What the Orchestrator does |
|---|---|
| `MINE_TASK` | Pathfinder → block → `bot.dig()` |
| `BUILD_TASK` | Pathfinder → coords → `bot.placeBlock()` |
| `CRAFT_TASK` | Find crafting table → `bot.craft(recipe)` |
| `FOLLOW_PLAYER` | Pathfinder → player, distance 3 |
| `EXPLORE` | Random wandering within radius |
| `IDLE` | No tasks, Reflex free |
| `GOTO` | Pathfinder → coordinates |

#### `chat_response`
```json
{ "name": "chat_response", "parameters": { "message": "I build a boundary of oak to fence in my sleep..." } }
```

---

## 📮 Directives (Mind → Orchestrator → Reflex)

When Mind makes a strategic decision, the Orchestrator:
1. Writes the directive to the **ephemeral board**
2. Injects it into the Qwen text prompt
3. Starts the pathfinder (if navigation is needed)
4. Qwen visually supervises execution (`SYS_YIELD` or `SURV_*`)

```typescript
// Ephemeral board format (in-memory singleton)
const ephemeralBoard = {
  mind_directive: {
    id: "d_123",
    intent: "MINE_TASK",
    target: "minecraft:iron_ore",
    coords: { x: 10, y: 64, z: 20 }
  },
  agent_state: {
    hp: 18, hunger: 17,
    pos: { x: 12, y: 64, z: 22 },
    safe: true
  },
  progress_context: "Iron ore collected: 3/10",
  action_history: ["NAV_FWD", "NAV_JUMP", "CAM_LOOK_DOWN"] // last 3 actions
};
```

---

## Related Documents

| Document | Description |
|---|---|
| [architecture.md](architecture.md) | Dual-Agent architecture, protocols |
| [weaver.md](weaver.md) | Data collection, UMAS mapping |
| [README.md](../README.md) | Master Summary & Blueprint |

<p align="center">
  <sub>📅 Updated: 2026-03-30</sub>
</p>
