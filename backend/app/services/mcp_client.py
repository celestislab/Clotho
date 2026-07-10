import asyncio
import logging
import json
from typing import Optional
from contextlib import AsyncExitStack
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from app.core.config import settings
from app.schemas.game_state import Observation
from app.schemas.agent import Goal, GoalResult

# Set up logging for this module
logger = logging.getLogger("clotho.mcp_client")
logging.basicConfig(level=settings.log_level.upper())

class MCPClientManager:
    """
    Manages the lifecycle of the TypeScript MCP body bridge.
    Spawns the node process on startup, coordinates JSON-RPC over stdio,
    and terminates the subprocess gracefully on shutdown.
    """
    def __init__(self):
        self.session: Optional[ClientSession] = None
        self._exit_stack: Optional[AsyncExitStack] = None
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        """Starts the TS MCP server as a subprocess and establishes a client session."""
        async with self._lock:
            if self.session is not None:
                logger.warning("MCP Client is already running.")
                return

            logger.info(f"Launching TS MCP bridge in directory: {settings.clotho_ts_dir}")
            
            # Setup stdio server parameters
            # Runs 'npx tsx src/bridge-main.ts' inside the Clotho TS folder
            server_params = StdioServerParameters(
                command="npx",
                args=["tsx", "src/bridge-main.ts"],
                cwd=settings.clotho_ts_dir,
            )

            self._exit_stack = AsyncExitStack()
            try:
                # 1. Start the subprocess and get communication streams
                read_stream, write_stream = await self._exit_stack.enter_async_context(
                    stdio_client(server_params)
                )
                
                # 2. Bind the MCP Client Session to the streams
                self.session = await self._exit_stack.enter_async_context(
                    ClientSession(read_stream, write_stream)
                )
                
                # 3. Perform the JSON-RPC initialization handshake
                await self.session.initialize()
                logger.info("Successfully connected to Clotho TS MCP server bridge.")
                
            except Exception as e:
                logger.error(f"Failed to establish MCP connection: {e}")
                await self.stop()
                raise

    async def stop(self) -> None:
        """Closes the session and terminates the subprocess, releasing resources."""
        async with self._lock:
            if self._exit_stack is not None:
                logger.info("Shutting down TS MCP subprocess bridge...")
                await self._exit_stack.aclose()
                self._exit_stack = None
            self.session = None
            logger.info("TS MCP bridge stopped.")

    async def get_state(self) -> Observation:
        """Queries the TS bot for the current Minecraft observation."""
        if self.session is None:
            raise RuntimeError("MCP Client is not connected. Call start() first.")
        
        logger.debug("Calling tool 'get_state'")
        response = await self.session.call_tool("get_state", {})
        
        # Extract the JSON text from the MCP text response content block
        raw_text = response.content[0].text
        logger.debug(f"Received state response: {raw_text}")
        
        return Observation.model_validate_json(raw_text)

    async def set_goal(self, goal: Goal) -> GoalResult:
        """Sends a high-level goal command to the TS bot."""
        if self.session is None:
            raise RuntimeError("MCP Client is not connected. Call start() first.")
        
        # Exclude None values so the JSON matches Zod's optional expectations
        arguments = goal.model_dump(exclude_none=True)
        logger.info(f"Calling tool 'set_goal' with goal: {arguments}")
        
        response = await self.session.call_tool("set_goal", arguments)
        raw_text = response.content[0].text
        logger.info(f"Goal result: {raw_text}")
        
        return GoalResult.model_validate_json(raw_text)

    async def get_goal_status(self) -> Optional[GoalResult]:
        """Queries the status of the most recently set goal."""
        if self.session is None:
            raise RuntimeError("MCP Client is not connected. Call start() first.")
        
        logger.debug("Calling tool 'get_goal_status'")
        response = await self.session.call_tool("get_goal_status", {})
        raw_text = response.content[0].text
        
        data = json.loads(raw_text)
        if data is None:
            return None
        return GoalResult.model_validate(data)

# Singleton manager instance
mcp_client = MCPClientManager()
