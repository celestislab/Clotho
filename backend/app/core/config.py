import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    # Configure Pydantic to read from '.env' file relative to execution dir
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"  # ignores extra environment variables
    )

    # --- LLM API Settings ---
    # Defaults target Google Gemini's OpenAI-compatible endpoint. The API key
    # must come from the environment / .env only — never hardcoded here.
    llm_api_key: str = Field(default="", alias="LLM_API_KEY")
    llm_base_url: str = Field(default="https://generativelanguage.googleapis.com/v1beta/openai/", alias="LLM_BASE_URL")
    llm_model: str = Field(default="gemini-3.5-flash", alias="LLM_MODEL")

    # --- Clotho TS Settings ---
    # Path where Clotho TS is located so we can run commands inside it
    clotho_ts_dir: str = Field(default="..", alias="CLOTHO_TS_DIR")

    # --- Minecraft Settings ---
    mc_host: str = Field(default="127.0.0.1", alias="MC_HOST")
    mc_port: int = Field(default=25565, alias="MC_PORT")
    mc_username: str = Field(default="Oneiro", alias="MC_USERNAME")
    mc_version: str = Field(default="1.21.11", alias="MC_VERSION")
    mc_auth: str = Field(default="offline", alias="MC_AUTH")

    # --- App Orchestration ---
    loop_interval_seconds: int = Field(default=15, alias="LOOP_INTERVAL_SECONDS")
    log_level: str = Field(default="info", alias="LOG_LEVEL")
    # When true, the Observe-Plan-Act loop starts automatically on boot instead
    # of waiting for a manual POST /agent/start. This is what makes the Docker
    # container self-driving.
    auto_start_planner: bool = Field(default=False, alias="AUTO_START_PLANNER")

    # --- Memory & Persona ---
    # Directory for persistent planner memory (score, achievements, world DB).
    # Defaults to ./data/memory inside the backend working directory.
    memory_dir: str = Field(default="data/memory", alias="MEMORY_DIR")
    # The Minecraft username of the player the agent should listen to and
    # address in chat. Used in the system prompt for command parsing.
    player_name: str = Field(default="", alias="PLAYER_NAME")

    @property
    def is_mock_mode(self) -> bool:
        """Determines if the LLM client should run in mock mode (no key provided)."""
        return not self.llm_api_key.strip()

# Instantiate config singleton
settings = Settings()
