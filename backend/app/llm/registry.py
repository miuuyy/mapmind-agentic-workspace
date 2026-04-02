from __future__ import annotations

from app.core.config import Settings
from app.llm.base import LLMProvider, LLMProviderError
from app.llm.catalog import provider_catalog_entry
from app.llm.gemini_provider import GeminiProvider
from app.llm.openai_provider import OpenAIProvider


def build_llm_provider(settings: Settings) -> LLMProvider | None:
    try:
        provider_id = provider_catalog_entry(settings.ai_provider).provider_id
    except ValueError as exc:
        raise LLMProviderError(f"Unsupported AI provider: {settings.ai_provider}") from exc
    if provider_id == "openai":
        provider = OpenAIProvider(settings)
    elif provider_id == "gemini":
        provider = GeminiProvider(settings)
    else:
        raise LLMProviderError(f"Unsupported AI provider: {provider_id}")
    return provider if provider.is_configured() else None
