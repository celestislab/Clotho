# Clotho — Embodied VLA Agent Framework
# Multi-stage: Hermes (Python planner) + Clotho TS extensions (body, reflex, schemas)
#
# Build context: /opt/Celestis/Clotho

# ──────────────────────────────────────────────────────
# Stage 1: Clotho TypeScript (body + schemas + reflex)
# ──────────────────────────────────────────────────────
FROM node:22-slim AS clotho-ts

WORKDIR /opt/clotho

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ripgrep \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first for layer caching
COPY package.json package-lock.json* ./
RUN npm install

# Copy TS source (excluding hermes/ — handled in Python stage)
COPY src/ ./src/
COPY tsconfig.json ./

# ──────────────────────────────────────────────────────
# Stage 2: Hermes planner (Python, vendored in Clotho)
# ──────────────────────────────────────────────────────
FROM python:3.12-slim AS hermes-planner

WORKDIR /opt/hermes

RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ripgrep ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install uv (fast Python package manager used by Hermes)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

# Copy vendored Hermes source
COPY src/hermes/ ./

# Create venv and install Hermes
RUN uv venv /opt/hermes-venv --python 3.12 \
    && uv pip install --python /opt/hermes-venv -e ".[all]" 2>/dev/null \
    || uv pip install --python /opt/hermes-venv -e "." 2>/dev/null \
    || echo "[WARN] Full Hermes install failed, core only"

ENV PATH="/opt/hermes-venv/bin:$PATH"

# ──────────────────────────────────────────────────────
# Stage 3: Reflex model runtime (vLLM / llama.cpp)
# ──────────────────────────────────────────────────────
FROM python:3.12-slim AS reflex-runtime

WORKDIR /opt/reflex

RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl build-essential cmake \
    && rm -rf /var/lib/apt/lists/*

# Install vLLM for reflex model serving (oneiro-mc)
# On AMD: use ROCm variant; on CPU: skip
RUN pip install --no-cache-dir vllm 2>/dev/null \
    || echo "[WARN] vLLM install failed — use llama.cpp or external endpoint"

# ──────────────────────────────────────────────────────
# Stage 4: Final runtime image
# ──────────────────────────────────────────────────────
FROM node:22-slim

WORKDIR /opt/clotho

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 git curl ripgrep ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install uv for runtime
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

# Copy Hermes from builder
COPY --from=hermes-planner /opt/hermes /opt/hermes
COPY --from=hermes-planner /opt/hermes-venv /opt/hermes-venv
ENV PATH="/opt/hermes-venv/bin:$PATH"

# Copy Clotho TS from builder
COPY --from=clotho-ts /opt/clotho /opt/clotho

# Copy docs
COPY docs/ ./docs/
COPY README.md AGENTS.md ./

# Default env
ENV MC_HOST=127.0.0.1 \
    MC_PORT=25565 \
    MC_USERNAME=Oneiro \
    MC_AUTH=offline \
    MODEL_NAME=oneiro-mc \
    LOG_LEVEL=info \
    PLANNER_PROVIDER=google \
    PLANNER_MODEL=gemini-3.5-flash

# Entrypoint: run Clotho agent (body + reflex online, Hermes planner via MCP)
CMD ["npx", "tsx", "src/index.ts"]
