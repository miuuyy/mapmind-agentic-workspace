from __future__ import annotations

from app.llm.base import LLMProviderError


def build_llm_provider(settings):
    from app.llm.registry import build_llm_provider as _build_llm_provider

    return _build_llm_provider(settings)


def provider_model_options(provider_id: str) -> list[str]:
    from app.llm.catalog import provider_model_options as _provider_model_options

    return _provider_model_options(provider_id)


def provider_default_model(provider_id: str) -> str:
    from app.llm.catalog import provider_default_model as _provider_default_model

    return _provider_default_model(provider_id)


__all__ = ["LLMProviderError", "build_llm_provider", "provider_model_options", "provider_default_model"]
