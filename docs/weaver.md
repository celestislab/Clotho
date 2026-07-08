# 🕸️ The Weaver Pipeline — Сбор данных для Oneiro

> Стратегия создания датасета action-observation пар для fine-tuning Qwen3.5
> Обновлено: 2026-03-30

---

## Принцип

Для обучения VLM требуется кристально чистый датасет, отражающий **человеческие рефлексы**. Каждая запись — это пара: «что увидел человек» → «что сделал».

### Главное правило: Strict Vanilla Client

| Параметр | Требование |
|---|---|
| Шейдеры | ❌ Никаких |
| Моды на физику/освещение | ❌ Никаких |
| FOV | Дефолтный (меняется каждые 15 мин для VDR) |
| View Bobbing | ❌ Отключено |
| Ресурспаки | Только стандартный (+ периодическая смена для VDR) |
| Скин игрока | Строго = финальный скин Oneiro (бледная фигура) |
| Framerate | Constant 60 FPS |

> Почему строгий ваниль? Модель должна видеть ровно тот же мир, который увидит в продакшене через prismarine-viewer. Никаких артефактов шейдеров, никаких нестандартных текстур.

---

## Асинхронная запись

Мы **отказываемся** от идеи "бота-тени", бегающего за игроком. Данные собираются локально на машине игрока:

### Визуальный поток

**NVIDIA ShadowPlay** или **OBS Studio** пишет геймплей с аппаратным кодированием:

| Параметр | Значение |
|---|---|
| Кодек | NVENC (H.264/H.265) |
| FPS | **60 (Constant Framerate!)** |
| Разрешение | 1920×1080 или 854×480 |
| Битрейт | 15-25 Mbps |
| Нагрузка на CPU | ~0% (аппаратный кодек) |

> ⚠️ **Constant Framerate критичен!** Без него нельзя точно привязать таймстемп телеметрии к конкретному кадру видео.

### Телеметрия

Сверхлёгкий **Fabric-мод** на Java. Единственная задача:

```
[timestamp_ms] [event_type] [data]
1711900200100  KEY_PRESS    W
1711900200150  MOUSE_CLICK  LEFT
1711900200200  KEY_RELEASE  W
1711900200350  MOUSE_MOVE   dx:5 dy:-2
```

**Оптимизации мода:**
- Zero-GC (нулевая сборка мусора) — pre-allocated буферы
- Запись в `.jsonl` файл через BufferedWriter
- UNIX-таймстемп в **миллисекундах**
- Никакой обработки — только сырые события

---

## Скрипт-Ткач (The Weaver)

Python-скрипт, который после игровой сессии **объединяет** видео и телеметрию.

### Алгоритм

```python
# Псевдокод Weaver
for action in telemetry_log:
    # 1. Читаем лог: "Удар мечом в 15:30:00.100"
    timestamp = action.timestamp_ms
    
    # 2. Отматываем на 200ms назад (12 кадров при 60 FPS)
    stimulus_time = timestamp - 200  # мс
    
    # 3. Извлекаем кадр через FFmpeg
    frame = ffmpeg_extract_frame(video, stimulus_time)
    
    # 4. Это именно тот кадр (стимул), который увидел
    #    человек ДО того, как его мозг отдал команду мышцам
    
    # 5. Маппим в UMAS-токен (каноническое имя!)
    umas_token = map_to_umas(action)  # <|ACT_ATK_MELEE|>
    
    # 6. Собираем контекст из телеметрии
    context = build_context(telemetry_log, timestamp)
    
    # 7. Формируем пару (кадр 384×384 для prismarine-совместимости)
    frame_resized = resize(frame, 384, 384)
    
    dataset.append({
        "image": frame_resized,       # стимул
        "umas_token": umas_token,      # <|ACT_ATK_MELEE|>
        "context": context             # game state
    })
```

### Почему 200ms? (Фикс: было 50ms)

```
Время реакции человека: ~150-250ms
  - Зрительная обработка:  ~50ms
  - Когнитивная обработка: ~80ms
  - Моторная команда:      ~50ms
  - Нажатие клавиши:       записывается в лог ← ЗДЕСЬ таймстемп

  ← 200ms ────────────────────────────────────────→
  Кадр-стимул                               Нажатие
```

> ⚠️ **Старый сдвиг -50ms был ошибочен!** При -50ms мы получали кадр,
> когда мозг игрока уже принял решение, а палец был в пути к клавише.
> Модель на таких данных **хронически опаздывала бы** с реакцией.
> Сдвиг -200ms = мы берём кадр, который **запустил** цепочку решений.

### FFmpeg команда

```bash
# Извлечь кадр на конкретной миллисекунде (с ресайзом до 384×384)
ffmpeg -ss 00:30:00.200 -i gameplay.mp4 -frames:v 1 -vf "scale=384:384" -q:v 2 frame_001.png
```

---

## Конвертация в ShareGPT формат (`build_llava_dataset.py`)

Сырой выход Weaver — промежуточный формат. Для fine-tuning Qwen3.5-VL нужен **ShareGPT/LLaVA формат**.

Скрипт `build_llava_dataset.py`:

```python
import json, random, cv2, numpy as np

def ego_mask(frame_path: str) -> str:
    """50% шанс замазать HUD чёрными прямоугольниками"""
    img = cv2.imread(frame_path)
    if random.random() < 0.5:
        h, w = img.shape[:2]
        # Маскируем хотбар (нижний центр)
        cv2.rectangle(img, (w//6, h-h//8), (w*5//6, h), (0,0,0), -1)
        # Маскируем здоровье + голод (над хотбаром)
        cv2.rectangle(img, (w//6, h-h//6), (w*5//6, h-h//8), (0,0,0), -1)
    masked_path = frame_path.replace('.png', '_masked.png')
    cv2.imwrite(masked_path, img)
    return masked_path

def build_system_prompt(context: dict) -> str:
    """Генерирует системный промпт с контекстом как в architecture.md"""
    return f"""<|TASK_REFLEX|> Ты — Oneiro. Выдай ровно 1 макро-токен.
Выживание перекрывает директивы.

[ГЛОБАЛЬНАЯ ЗАДАЧА] {context.get('global_task', 'Выживание')}
[ДИРЕКТИВА MIND] {context.get('directive', 'IDLE')}

[ИНВЕНТАРЬ] {context.get('inventory', 'Нет данных')}
[HP] {context.get('hp', 20)}/20  [HUNGER] {context.get('hunger', 20)}/20
[ОКРУЖЕНИЕ] Время: {context.get('time', 'день')}. Биом: {context.get('biome', 'Plains')}
[УГРОЗЫ] {context.get('threats', 'Нет')}"""

def convert_to_sharegpt(weaver_pairs: list) -> list:
    """Конвертирует пары Weaver в ShareGPT формат"""
    sharegpt_dataset = []
    
    for pair in weaver_pairs:
        image_path = ego_mask(pair["image"])  # 50% ego masking
        system_prompt = build_system_prompt(pair["context"])
        
        entry = {
            "conversations": [
                {
                    "from": "system",
                    "value": system_prompt
                },
                {
                    "from": "user",
                    "value": f"<image>{image_path}</image>\nВыдай 1 UMAS-токен."
                },
                {
                    "from": "assistant",
                    "value": pair["umas_token"]
                }
            ],
            "images": [image_path]
        }
        sharegpt_dataset.append(entry)
    
    return sharegpt_dataset

# Использование:
# python build_llava_dataset.py --input weaver_output.jsonl --output train.json
```

### Data Mixture (~60-80K)

| Тип | Доля | Описание |
|---|---|---|
| TASK_REFLEX | 45% | Кадр + стейт → 1 UMAS токен |
| TASK_SUBSUMPTION | 20% | Кадр + **противоречащая** директива → SURV_ токен |
| TASK_KNOWLEDGE | 25% | Текстовый вопрос → текстовый ответ (рецепты) |
| Replay Buffer | 10% | Общие диалоги, лор, personality |

> **TASK_SUBSUMPTION** — самый важный для Subsumption:
> Модель видит директиву "MINE_COBBLESTONE", но на кадре — крипер.
> Правильный ответ: `<|SURV_FLEE_180|>`, а не `<|ACT_MINE_TARGET|>`.

---

## Open-Source обобщение

Чтобы модель не переобучилась на один сервер / один FOV / одного игрока:

### 1. VDR — Visual Domain Randomization

Во время сбора данных игрок каждые **15 минут** меняет:
- FOV: 70 → 90 → 110 (по кругу)
- Изредка переключает базовые ресурспаки

Это учит модель пространственной геометрии, а не конкретным пикселям.

### 2. Ego-Masking

Встроен в `build_llava_dataset.py` (см. выше). С вероятностью **50%** закрывает чёрными квадратами:
- Полоску здоровья (сердечки)
- Полоску голода
- Инвентарь (hotbar)
- Руку персонажа

Это заставляет ИИ оценивать **геометрию мира**, а не "читерить" глядя на полоску HP.

### 3. UMAS — Universal Macro-Action Space

Мы НЕ обучаем модель конкретным кнопкам клавиатуры. Мы обучаем **семантическим действиям**:

```
Нажатие "W"           →  <|NAV_FWD|>
Нажатие "S"           →  <|NAV_BWD|>
Клик ЛКМ + melee      →  <|ACT_ATK_MELEE|>
Клик ПКМ + block       →  <|ACT_PLACE_ACTIVE|>
Shift + W              →  <|NAV_SNEAK_FWD|>
W + Ctrl               →  <|NAV_FWD_SPRINT|>
```

> **Каноническая таксономия:** 6 категорий (`NAV_`, `CAM_`, `ACT_`, `INV_`, `SURV_`, `SYS_`).
> Полный маппинг в [tools.md](tools.md).

---

## Связанные документы

| Документ | Описание |
|---|---|
| [README.md](../README.md) | Master Summary & Blueprint |
| [architecture.md](architecture.md) | Dual-Agent архитектура |
| [tools.md](tools.md) | Полный маппинг UMAS → Mineflayer |

<p align="center">
  <sub>📅 Обновлено: 2026-03-30</sub>
</p>
