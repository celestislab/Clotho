# 🔧 Интерфейсы действий Oneiro

> Два типа: **UMAS макро-токены** (Qwen Reflex) + **MCP Tools** (Gemini Mind)
> Обновлено: 2026-03-30

---

## Обзор

Oneiro использует **два различных интерфейса действий**, по одному на каждый агент:

| Агент | Интерфейс | Формат | Латентность |
|---|---|---|---|
| 🦴 Qwen (Reflex) | UMAS макро-токены | Один спец-токен (Static Logit Bias) | < 100ms |
| 🧠 Gemini (Mind) | MCP Tools (OpenClaw) | JSON function calling | 3-10 сек |

Оба интерфейса в итоге транслируются через Node.js Orchestrator в вызовы **Mineflayer API**.

> ⚠️ **Static Logit Bias**, а не `prefix_allowed_tokens_fn`!
> На TPU динамические Python-функции ломают графы XLA (Host-Device Sync → 500ms+).
> Вместо этого используется тензор-маска: 150 UMAS-токенов = 0, остальные = -inf.
> Маска вшивается в `lm_head` при компиляции графа. Overhead: **0ms**.

---

## 🦴 UMAS макро-токены (Reflex Agent)

Спец-токены, добавленные в словарь Qwen при fine-tuning.
Один forward pass → один токен → мгновенная реакция.

> **Каноническое имя стандарта:** Все токены следуют таксономии `{КАТЕГОРИЯ}_{ДЕЙСТВИЕ}`.
> Префиксы: `NAV_`, `CAM_`, `ACT_`, `INV_`, `SURV_`, `SYS_`.

### 🟢 NAV_ — Навигация (~25 токенов)

| Токен | Mineflayer action | Описание |
|---|---|---|
| `<\|NAV_FWD\|>` | `bot.setControlState('forward', true)` | Шаг вперёд |
| `<\|NAV_BWD\|>` | `bot.setControlState('back', true)` | Шаг назад |
| `<\|NAV_STRAFE_L\|>` | `bot.setControlState('left', true)` | Стрейф влево |
| `<\|NAV_STRAFE_R\|>` | `bot.setControlState('right', true)` | Стрейф вправо |
| `<\|NAV_FWD_SPRINT\|>` | `forward:true + sprint:true` | Бег вперёд |
| `<\|NAV_FWD_SPRINT_JUMP\|>` | `forward:true + sprint:true + jump:true` | Спринт-джамп |
| `<\|NAV_BWD_JUMP\|>` | `back:true + jump:true` | Прыжок назад (эвейд) |
| `<\|NAV_JUMP\|>` | `bot.setControlState('jump', true)` | Прыжок на месте |
| `<\|NAV_SWIM_UP\|>` | `jump:true` (в воде) | Плыть вверх |
| `<\|NAV_SWIM_DOWN\|>` | `sneak:true` (в воде) | Плыть вниз |
| `<\|NAV_SNEAK_FWD\|>` | `sneak:true + forward:true` | Присесть + вперёд (мосты) |
| `<\|NAV_SNEAK_BWD\|>` | `sneak:true + back:true` | Присесть + назад |
| `<\|NAV_FREEZE\|>` | `bot.clearControlStates()` | Полная остановка (Creaking!) |
| `<\|NAV_MOUNT\|>` | `bot.mount(nearest_vehicle)` | Оседлать маунт (1.21.11) |
| `<\|NAV_DISMOUNT\|>` | `bot.dismount()` | Спешиться |

### 🟡 CAM_ — Камера и прицеливание (~10 токенов)

| Токен | Mineflayer action | Описание |
|---|---|---|
| `<\|CAM_PITCH_UP_15\|>` | `bot.look(yaw, pitch - 0.26)` | Камера вверх 15° |
| `<\|CAM_PITCH_DOWN_15\|>` | `bot.look(yaw, pitch + 0.26)` | Камера вниз 15° |
| `<\|CAM_YAW_L_30\|>` | `bot.look(yaw + 0.52, pitch)` | Поворот влево 30° |
| `<\|CAM_YAW_R_30\|>` | `bot.look(yaw - 0.52, pitch)` | Поворот вправо 30° |
| `<\|CAM_YAW_L_90\|>` | `bot.look(yaw + Math.PI/2, pitch)` | Резкий поворот влево |
| `<\|CAM_YAW_R_90\|>` | `bot.look(yaw - Math.PI/2, pitch)` | Резкий поворот вправо |
| `<\|CAM_LOCK_THREAT\|>` | `bot.lookAt(threat.pos.offset(0,1.5,0))` | Прицел на угрозу ⭐ |
| `<\|CAM_LOCK_TARGET\|>` | `bot.lookAt(ephemeralBoard.target_coords)` | Прицел на целевой блок |
| `<\|CAM_LOOK_DOWN\|>` | `bot.look(yaw, Math.PI/2)` | Под ноги (мосты, MLG) |
| `<\|CAM_LOOK_UP\|>` | `bot.look(yaw, -Math.PI/2)` | Вверх (столбование) |

### 🔴 ACT_ — Контекстное взаимодействие (~20 токенов)

| Токен | Mineflayer action | Описание |
|---|---|---|
| `<\|ACT_ATK_MELEE\|>` | `bot.attack(bot.entityAtCursor())` | Удар тем, что в руке |
| `<\|ACT_ATK_RANGED\|>` | `bot.activateItem(); delay; bot.deactivateItem()` | Выстрел/бросок |
| `<\|ACT_THROW_SPEAR\|>` | тайминги под Spear 1.21.11 | Бросить копьё |
| `<\|ACT_MINE_TARGET\|>` | `bot.dig(bot.blockAtCursor())` | Копать блок в прицеле |
| `<\|ACT_PLACE_ACTIVE\|>` | `bot.placeBlock(reference, face)` | Поставить блок из руки |
| `<\|ACT_INTERACT\|>` | `bot.activateBlock(bot.blockAtCursor())` | Открыть/нажать (сундук, Copper Bulb) |
| `<\|ACT_USE_ACTIVE\|>` | `bot.consume()` | Использовать (еда, зелье) |
| `<\|ACT_SHIELD_UP\|>` | `bot.activateItem(true)` (offhand) | Поднять щит |
| `<\|ACT_SHIELD_DOWN\|>` | `bot.deactivateItem()` | Опустить щит |
| `<\|ACT_DROP_ACTIVE\|>` | `bot.tossStack(item)` | Дропнуть предмет |
| `<\|ACT_PICKUP_NEAR\|>` | Оркестратор: навигация к ближайшему дропу | Подобрать дроп |

### 🎒 INV_ — Семантический инвентарь (~20 токенов)

| Токен | Mineflayer action | Описание |
|---|---|---|
| `<\|INV_EQUIP_MELEE_BEST\|>` | Оркестратор: max DPS → `bot.equip(item, 'hand')` | Лучшее ближнее оружие |
| `<\|INV_EQUIP_TOOL_BEST\|>` | Оркестратор: под блок в прицеле → `bot.equip()` | Лучший инструмент |
| `<\|INV_EQUIP_RANGED\|>` | `bot.equip(bow/crossbow, 'hand')` | Лук/арбалет |
| `<\|INV_EQUIP_SHIELD\|>` | `bot.equip(shield, 'off-hand')` | Щит |
| `<\|INV_EQUIP_WATER_BUCKET\|>` | `bot.equip(water_bucket, 'hand')` | Ведро воды (MLG!) |
| `<\|INV_EQUIP_JUNK_BLOCK\|>` | Оркестратор: грязь/камень → `bot.equip()` | Блок для застройки |
| `<\|INV_EQUIP_FOOD_BEST\|>` | Оркестратор: max saturation → `bot.equip()` | Лучшая еда |
| `<\|INV_EQUIP_SPEAR\|>` | `bot.equip(spear, 'hand')` | Копьё (1.21.11) |
| `<\|INV_HOTBAR_NEXT\|>` | `bot.setQuickBarSlot(current + 1)` | Следующий слот |
| `<\|INV_HOTBAR_PREV\|>` | `bot.setQuickBarSlot(current - 1)` | Предыдущий слот |

### 🚨 SURV_ — Инстинкты выживания (~15 токенов)

> **Перехватывают FSM Оркестратора!** При получении SURV_ → `bot.pathfinder.stop()` → немедленное выполнение.

| Токен | Mineflayer action | Описание |
|---|---|---|
| `<\|SURV_FLEE_180\|>` | Поворот 180° + sprint + jump | Разворот + бег ⭐ |
| `<\|SURV_SHIELD_UP\|>` | `bot.activateItem(true)` (offhand) | Экстренный щит |
| `<\|SURV_EAT_NOW\|>` | Лучшая еда → `bot.consume()` | Экстренная еда (HP < 8) |
| `<\|SURV_WATER_BUCKET_MLG\|>` | look down + equip bucket + place | MLG водой |
| `<\|SURV_BURY_SELF\|>` | `bot.dig(down)` ×3 + `bot.placeBlock(up)` | Зарыться от мобов |
| `<\|SURV_DODGE_L\|>` | Резкий стрейф влево | Уклонение |
| `<\|SURV_DODGE_R\|>` | Резкий стрейф вправо | Уклонение |
| `<\|SURV_PILLAR_UP\|>` | jump + place under ×4 | Столбование |
| `<\|SURV_RETREAT_SAFE\|>` | Pathfinder → safe zone | Отступление |
| `<\|SURV_BLOCK_CREEPER\|>` | equip junk + place around creeper | Застроить крипера |

### ⚙️ SYS_ — Системная оркестрация (~5 токенов)

| Токен | Orchestrator action | Описание |
|---|---|---|
| `<\|SYS_YIELD_TO_MIND\|>` | **No-op.** Продолжить директиву Mind | Самый частый (~60-70%) ⭐ |
| `<\|SYS_REQ_MIND_UPDATE\|>` | Запрос к Gemini на переоценку | Среда изменилась |
| `<\|SYS_TASK_COMPLETE\|>` | Триггер завершения директивы | Задача выполнена |
| `<\|SYS_STUCK\|>` | Инкремент watchdog-счётчика | Застрял |
| `<\|SYS_WAIT\|>` | No-op, пауза | Ожидание (печь, крафт) |

---

## 🧠 MCP Tools (Mind Agent — Gemini via OpenClaw)

JSON function calling через OpenClaw. **Mind НЕ управляет ботом напрямую.**
Mind выдаёт абстрактные директивы, а Оркестратор выполняет их через Mineflayer pathfinder под визуальным контролем Qwen.

> ⚠️ **Важно:** Mind НЕ вызывает `move_to(x,y,z)` или `mine_block(x,y,z)` напрямую!
> Прямое управление заблокирует Оркестратор и разрушит Subsumption.
> Mind отдаёт **намерение**, а не пошаговые команды.

### 📊 Информационные инструменты (Read-only)

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

### 📋 Стратегические инструменты (Директивы)

#### `set_directive`
Главный инструмент Mind → задать стратегическую цель.

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

Поддерживаемые intent'ы:

| Intent | Что делает Оркестратор |
|---|---|
| `MINE_TASK` | Pathfinder → блок → `bot.dig()` |
| `BUILD_TASK` | Pathfinder → coords → `bot.placeBlock()` |
| `CRAFT_TASK` | Найти верстак → `bot.craft(recipe)` |
| `FOLLOW_PLAYER` | Pathfinder → игрок, дистанция 3 |
| `EXPLORE` | Случайное блуждание в радиусе |
| `IDLE` | Нет задач, Reflex swободен |
| `GOTO` | Pathfinder → координаты |

#### `chat_response`
```json
{ "name": "chat_response", "parameters": { "message": "Я выстраиваю границу из дуба, чтобы оградить свой сон..." } }
```

---

## 📮 Директивы (Mind → Orchestrator → Reflex)

Когда Mind принимает стратегическое решение, Orchestrator:
1. Записывает директиву на **эфемерную доску**
2. Вставляет её в текстовый промпт Qwen
3. Запускает pathfinder (если нужна навигация)
4. Qwen визуально контролирует выполнение (`SYS_YIELD` или `SURV_*`)

```typescript
// Формат эфемерной доски (in-memory singleton)
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
  action_history: ["NAV_FWD", "NAV_JUMP", "CAM_LOOK_DOWN"] // последние 3 действия
};
```

---

## Связанные документы

| Документ | Описание |
|---|---|
| [architecture.md](architecture.md) | Dual-Agent архитектура, протоколы |
| [weaver.md](weaver.md) | Сбор данных, UMAS маппинг |
| [README.md](../README.md) | Master Summary & Blueprint |

<p align="center">
  <sub>📅 Обновлено: 2026-03-30</sub>
</p>
