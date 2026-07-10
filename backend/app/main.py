import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.services.mcp_client import mcp_client
from app.services.planner import planner
from app.api.routes import router

# Set up logging configuration
logging.basicConfig(
    level=settings.log_level.upper(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("clotho.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI Lifespan Manager. Handles setup on boot and cleanup on exit.
    """
    logger.info("Initializing Clotho Python Backend...")
    
    # 1. Start the TS MCP Server bridge subprocess on startup
    try:
        await mcp_client.start()
    except Exception as e:
        logger.error(f"Failed to start MCP client during startup sequence: {e}")
        logger.error("Backend will continue running, but tools calling Minecraft will be unavailable.")

    yield  # FastAPI starts accepting HTTP requests here
    
    # 2. Cleanup operations on shutdown
    logger.info("Shutdown sequence initiated. Cleaning up resources...")
    
    # Stop background planning loops first to prevent new MCP actions from starting
    await planner.stop()
    
    # Kill the TS bridge subprocess to prevent zombie node processes
    await mcp_client.stop()
    
    logger.info("Shutdown complete.")

# Initialize the FastAPI Application
app = FastAPI(
    title="Clotho AI Minecraft Agent Backend",
    description="The Prefrontal Cortex logic loop controller for the AMD Developer Hackathon MVP.",
    version="0.1.0",
    lifespan=lifespan
)

# Configure CORS Middleware so Frontend Dashboard can talk to us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for local testing/hackathon simplicity
    allow_credentials=True,
    allow_methods=["*"],  # Allows GET, POST, OPTIONS, etc.
    allow_headers=["*"],  # Allows all custom headers
)

# Register our agent API routes
app.include_router(router)

@app.get("/", tags=["General"])
async def root():
    """Root route indicating backend status."""
    return {
        "status": "online",
        "service": "Clotho Python Backend Planner",
        "mock_mode": settings.is_mock_mode
    }
