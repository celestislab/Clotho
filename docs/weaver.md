# 🕸️ The Weaver Pipeline — Data Collection for Oneiro

> Strategy for creating a dataset of action-observation pairs for fine-tuning Qwen3.5
> Updated: 2026-03-30

---

## Principle

Training a VLM requires a crystal-clean dataset reflecting **human reflexes**. Each record is a pair: "what the human saw" → "what they did".

### Main rule: Strict Vanilla Client

| Parameter | Requirement |
|---|---|
| Shaders | ❌ None |
| Physics/lighting mods | ❌ None |
| FOV | Default (changes every 15 min for VDR) |
| View Bobbing | ❌ Disabled |
| Resource packs | Only standard (+ periodic switching for VDR) |
| Player skin | Strictly = final Oneiro skin (pale figure) |
| Framerate | Constant 60 FPS |

> Why strict vanilla? The model must see exactly the same world it will see in production via prismarine-viewer. No shader artifacts, no non-standard textures.

---

## Asynchronous Recording

We **abandon** the idea of a "shadow bot" running after the player. Data is collected locally on the player's machine:

### Visual Stream

**NVIDIA ShadowPlay** or **OBS Studio** records gameplay with hardware encoding:

| Parameter | Value |
|---|---|
| Codec | NVENC (H.264/H.265) |
| FPS | **60 (Constant Framerate!)** |
| Resolution | 1920×1080 or 854×480 |
| Bitrate | 15-25 Mbps |
| CPU load | ~0% (hardware codec) |

> ⚠️ **Constant Framerate is critical!** Without it you cannot accurately bind a telemetry timestamp to a specific video frame.

### Telemetry

Ultra-lightweight **Fabric mod** in Java. The only task:

```
[timestamp_ms] [event_type] [data]
1711900200100  KEY_PRESS    W
1711900200150  MOUSE_CLICK  LEFT
1711900200200  KEY_RELEASE  W
1711900200350  MOUSE_MOVE   dx:5 dy:-2
```

**Mod optimizations:**
- Zero-GC (zero garbage collection) — pre-allocated buffers
- Writing to a `.jsonl` file via BufferedWriter
- UNIX timestamp in **milliseconds**
- No processing — only raw events

---

## The Weaver Script

A Python script that, after a game session, **merges** video and telemetry.

### Algorithm

```python
# Weaver pseudocode
for action in telemetry_log:
    # 1. Read log: "Sword swing at 15:30:00.100"
    timestamp = action.timestamp_ms
    
    # 2. Rewind 200ms back (12 frames at 60 FPS)
    stimulus_time = timestamp - 200  # ms
    
    # 3. Extract frame via FFmpeg
    frame = ffmpeg_extract_frame(video, stimulus_time)
    
    # 4. This is the exact frame (stimulus) the player saw
    #    BEFORE their brain sent the command to their muscles
    
    # 5. Map to UMAS token (canonical name!)
    umas_token = map_to_umas(action)  # <|ACT_ATK_MELEE|>
    
    # 6. Build context from telemetry
    context = build_context(telemetry_log, timestamp)
    
    # 7. Form a pair (frame 384x384 for prismarine compatibility)
    frame_resized = resize(frame, 384, 384)
    
    dataset.append({
        "image": frame_resized,       # stimulus
        "umas_token": umas_token,      # <|ACT_ATK_MELEE|>
        "context": context             # game state
    })
```

### Why 200ms? (Fix: was 50ms)

```
Human reaction time: ~150-250ms
  - Visual processing:   ~50ms
  - Cognitive processing: ~80ms
  - Motor command:       ~50ms
  - Key press:           written to log ← HERE is the timestamp

   ← 200ms ────────────────────────────────────────→
  Stimulus frame                                  Key press
```

> ⚠️ **The old -50ms shift was wrong!** At -50ms we got the frame
> when the player's brain had already made the decision and the finger was on its way to the key.
> A model trained on such data would **chronically be late** with its reaction.
> A -200ms shift = we take the frame that **triggered** the chain of decisions.

### FFmpeg command

```bash
# Extract frame at a specific millisecond (resized to 384x384)
ffmpeg -ss 00:30:00.200 -i gameplay.mp4 -frames:v 1 -vf "scale=384:384" -q:v 2 frame_001.png
```

---

## Conversion to ShareGPT format (`build_llava_dataset.py`)

The raw Weaver output is an intermediate format. For fine-tuning Qwen3.5-VL you need the **ShareGPT/LLaVA format**.

The `build_llava_dataset.py` script:

```python
import json, random, cv2, numpy as np

def ego_mask(frame_path: str) -> str:
    """50% chance to mask HUD with black rectangles"""
    img = cv2.imread(frame_path)
    if random.random() < 0.5:
        h, w = img.shape[:2]
        # Mask hotbar (bottom center)
        cv2.rectangle(img, (w//6, h-h//8), (w*5//6, h), (0,0,0), -1)
        # Mask health + hunger (above hotbar)
        cv2.rectangle(img, (w//6, h-h//6), (w*5//6, h-h//8), (0,0,0), -1)
    masked_path = frame_path.replace('.png', '_masked.png')
    cv2.imwrite(masked_path, img)
    return masked_path

def build_system_prompt(context: dict) -> str:
    """Generate system prompt with context as in architecture.md"""
    return f"""<|TASK_REFLEX|> You are Oneiro. Output exactly 1 macro-token.
Survival overrides directives.

[GLOBAL TASK] {context.get('global_task', 'Survival')}
[MIND DIRECTIVE] {context.get('directive', 'IDLE')}

[INVENTORY] {context.get('inventory', 'No data')}
[HP] {context.get('hp', 20)}/20  [HUNGER] {context.get('hunger', 20)}/20
[ENVIRONMENT] Time: {context.get('time', 'day')}. Biome: {context.get('biome', 'Plains')}
[THREATS] {context.get('threats', 'None')}"""

def convert_to_sharegpt(weaver_pairs: list) -> list:
    """Convert Weaver pairs to ShareGPT format"""
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
                    "value": f"<image>{image_path}</image>\nOutput 1 UMAS token."
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

# Usage:
# python build_llava_dataset.py --input weaver_output.jsonl --output train.json
```

### Data Mixture (~60-80K)

| Type | Share | Description |
|---|---|---|
| TASK_REFLEX | 45% | Frame + state → 1 UMAS token |
| TASK_SUBSUMPTION | 20% | Frame + **contradicting** directive → SURV_ token |
| TASK_KNOWLEDGE | 25% | Text question → text answer (recipes) |
| Replay Buffer | 10% | General dialogues, lore, personality |

> **TASK_SUBSUMPTION** — the most important for Subsumption:
> The model sees the directive "MINE_COBBLESTONE", but there is a creeper in the frame.
> The correct answer: `<|SURV_FLEE_180|>`, not `<|ACT_MINE_TARGET|>`.

---

## Open-Source Generalization

So the model does not overfit to a single server / single FOV / single player:

### 1. VDR — Visual Domain Randomization

During data collection the player every **15 minutes** changes:
- FOV: 70 → 90 → 110 (in a cycle)
- Occasionally switches basic resource packs

This teaches the model spatial geometry rather than specific pixels.

### 2. Ego-Masking

Built into `build_llava_dataset.py` (see above). With a **50%** probability it covers with black squares:
- The health bar (hearts)
- The hunger bar
- The inventory (hotbar)
- The character's hand

This forces the AI to evaluate **world geometry** rather than "cheat" by looking at the HP bar.

### 3. UMAS — Universal Macro-Action Space

We do NOT train the model on specific keyboard keys. We train it on **semantic actions**:

```
Pressing "W"           →  <|NAV_FWD|>
Pressing "S"           →  <|NAV_BWD|>
LMB click + melee      →  <|ACT_ATK_MELEE|>
RMB click + block      →  <|ACT_PLACE_ACTIVE|>
Shift + W              →  <|NAV_SNEAK_FWD|>
W + Ctrl               →  <|NAV_FWD_SPRINT|>
```

> **Canonical taxonomy:** 6 categories (`NAV_`, `CAM_`, `ACT_`, `INV_`, `SURV_`, `SYS_`).
> Full mapping in [tools.md](tools.md).

---

## Related Documents

| Document | Description |
|---|---|
| [README.md](../README.md) | Master Summary & Blueprint |
| [architecture.md](architecture.md) | Dual-Agent architecture |
| [tools.md](tools.md) | Full UMAS → Mineflayer mapping |

<p align="center">
  <sub>📅 Updated: 2026-03-30</sub>
</p>
