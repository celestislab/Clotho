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
    llm_api_key: str = Field(default="", alias="LLM_API_KEY")
    llm_base_url: str = Field(default="https://api.fireworks.ai/inference/v1", alias="LLM_BASE_URL")
    llm_model: str = Field(default="gemini-3.5-flash", alias="LLM_MODEL")

    # --- Clotho TS Settings ---
    # Path where Clotho TS is located so we can run commands inside it
    clotho_ts_dir: str = Field(default="..", alias="CLOTHO_TS_DIR")

    # --- Minecraft Settings ---
    mc_host: str = Field(default="127.0.0.1", alias="MC_HOST")
    mc_port: int = Field(default=25565, alias="MC_PORT")
    mc_username: str = Field(default="Oneiro", alias="MC_USERNAME")
    mc_version: str = Field(default="1.21.11", alias="MC_VERSION")

    # --- App Orchestration ---
    loop_interval_seconds: int = Field(default=15, alias="LOOP_INTERVAL_SECONDS")
    log_level: str = Field(default="info", alias="LOG_LEVEL")

    @property
    def is_mock_mode(self) -> bool:
        """Determines if the LLM client should run in mock mode (no key provided)."""
        return not self.llm_api_key.strip()

# Instantiate config singleton
settings = Settings()
