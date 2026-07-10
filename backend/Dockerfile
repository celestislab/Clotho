# ==============================================================================
# Oneiro Agent Backend Dockerfile
# Combines Python 3.12 and Node.js 22 runtimes to support both 
# the FastAPI planner loop and the TypeScript Mineflayer body server.
# ==============================================================================

FROM python:3.12-slim

# Prevent Python from writing .pyc files to disk and enable unbuffered logging (realtime console logs)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install system utilities & install Node.js 22 from nodesource
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    build-essential \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# --- Stage 1: Build the TypeScript Bridge ---
WORKDIR /opt/clotho
# Copy TS dependencies first for layer caching
COPY Clotho/package.json Clotho/package-lock.json* ./
RUN npm install

# Copy TS source code and verify build
COPY Clotho/ ./

# --- Stage 2: Build the Python Backend ---
WORKDIR /opt/backend
# Copy Python requirements first for layer caching
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy Python source code
COPY backend/ ./

# --- Stage 3: Runtime Configurations ---
EXPOSE 8000

# Set default environment variables
# Point CLOTHO_TS_DIR to the location of the TS folder in the container
ENV CLOTHO_TS_DIR=/opt/clotho \
    MC_HOST=127.0.0.1 \
    MC_PORT=25565 \
    MC_USERNAME=Oneiro \
    MC_VERSION=1.21.11 \
    LOOP_INTERVAL_SECONDS=15 \
    LOG_LEVEL=info

# Start the FastAPI server using uvicorn (listening on all interfaces '0.0.0.0' inside container)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
