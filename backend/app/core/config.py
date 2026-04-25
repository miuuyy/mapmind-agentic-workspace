from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.llm.catalog import provider_default_model, provider_model_options


class Settings(BaseSettings):
    app_name: str = "Clew"
    api_host: str = "127.0.0.1"
    api_port: int = 8787
    root_dir: Path = Path(__file__).resolve().parents[3]
    db_path: Path = Path(__file__).resolve().parents[2] / "data" / "knowledge_graph.sqlite3"
    ai_provider: str = Field(default="gemini", validation_alias=AliasChoices("KG_AI_PROVIDER", "AI_PROVIDER"))
    default_model: str = provider_default_model("gemini")
    frontend_origin: str = "http://127.0.0.1:5178"
    planner_max_output_tokens: int = 200000
    orchestrator_max_output_tokens: int = 16384
    quiz_max_output_tokens: int = 4096
    assistant_max_output_tokens: int = 800
    planner_thinking_budget: int = 65535
    gemini_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("KG_GEMINI_API_KEY", "GEMINI_API_KEY"),
    )
    openai_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("KG_OPENAI_API_KEY", "OPENAI_API_KEY"),
    )
    openai_base_url: str = Field(
        default="https://api.openai.com/v1",
        validation_alias=AliasChoices("KG_OPENAI_BASE_URL", "OPENAI_BASE_URL"),
    )
    local_user_name: str = "Local User"
    local_user_email: str = "local@example.com"

    model_config = SettingsConfigDict(
        env_prefix="KG_",
        case_sensitive=False,
    )

    def model_post_init(self, __context) -> None:  # type: ignore[override]
        try:
            model_options = provider_model_options(self.ai_provider)
        except ValueError as exc:
            raise ValueError(f"unsupported provider {self.ai_provider}") from exc
        if self.default_model not in model_options:
            self.default_model = provider_default_model(self.ai_provider)

    def with_workspace_overrides(self, workspace_config) -> "Settings":
        """Return a copy with token limits overridden by workspace config values."""
        overrides = {
            "ai_provider": getattr(workspace_config, "ai_provider", self.ai_provider),
            "default_model": getattr(workspace_config, "default_model", self.default_model),
            "planner_max_output_tokens": workspace_config.planner_max_output_tokens,
            "orchestrator_max_output_tokens": workspace_config.orchestrator_max_output_tokens,
            "quiz_max_output_tokens": workspace_config.quiz_max_output_tokens,
            "assistant_max_output_tokens": workspace_config.assistant_max_output_tokens,
            "planner_thinking_budget": workspace_config.planner_thinking_budget,
        }
        if workspace_config.gemini_api_key and not self.gemini_api_key_from_env:
            overrides["gemini_api_key"] = workspace_config.gemini_api_key
        if getattr(workspace_config, "openai_api_key", None) and not self.openai_api_key_from_env:
            overrides["openai_api_key"] = workspace_config.openai_api_key
        if getattr(workspace_config, "openai_base_url", None) and not self.openai_base_url_from_env:
            overrides["openai_base_url"] = workspace_config.openai_base_url
        return self.model_copy(update=overrides)

    @property
    def gemini_api_key_from_env(self) -> bool:
        return bool((self.gemini_api_key or "").strip())

    @property
    def openai_api_key_from_env(self) -> bool:
        return bool((self.openai_api_key or "").strip())

    @property
    def openai_base_url_from_env(self) -> bool:
        configured = (self.openai_base_url or "").strip().rstrip("/")
        return bool(configured and configured != "https://api.openai.com/v1")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
