from __future__ import annotations

from typing import TYPE_CHECKING, Any, TypeVar

from pydantic import BaseModel

from app.core.config import Settings
from app.llm.base import LLMProviderError, LLMStructuredResponse, parse_structured_text

if TYPE_CHECKING:
    from google import genai as genai_module


T = TypeVar("T", bound=BaseModel)


class GeminiProvider:
    provider_id = "gemini"

    def __init__(self, settings: Settings):
        self._settings = settings
        self._client: genai_module.Client | None = None
        self._types: Any | None = None
        api_key = (settings.gemini_api_key or "").strip()
        if api_key:
            from google import genai
            from google.genai import types

            self._client = genai.Client(api_key=api_key)
            self._types = types

    def is_configured(self) -> bool:
        return self._client is not None and self._types is not None

    def generate_text(
        self,
        *,
        model: str,
        system_instruction: str,
        prompt: str,
        max_output_tokens: int,
        temperature: float,
        use_grounding: bool = False,
    ) -> str:
        if not self.is_configured():
            raise LLMProviderError("Gemini provider is not configured")
        config = self._types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            tools=[self._types.Tool(google_search=self._types.GoogleSearch())] if use_grounding else None,
        )
        response = self._client.models.generate_content(
            model=model,
            contents=prompt,
            config=config,
        )
        text = (getattr(response, "text", "") or "").strip()
        if not text:
            raise LLMProviderError("Gemini returned empty text response")
        return text

    def generate_structured(
        self,
        *,
        model: str,
        system_instruction: str,
        prompt: str,
        schema: type[T],
        schema_name: str | None = None,
        response_json_schema: dict[str, Any] | None = None,
        max_output_tokens: int,
        temperature: float,
        use_grounding: bool = False,
    ) -> LLMStructuredResponse:
        if not self.is_configured():
            raise LLMProviderError("Gemini provider is not configured")
        config_kwargs: dict[str, Any] = {
            "system_instruction": system_instruction,
            "temperature": temperature,
            "max_output_tokens": max_output_tokens,
            "response_mime_type": "application/json",
            "tools": [self._types.Tool(google_search=self._types.GoogleSearch())] if use_grounding else None,
            "response_schema": schema,
        }
        response = self._client.models.generate_content(
            model=model,
            contents=prompt,
            config=self._types.GenerateContentConfig(**config_kwargs),
        )
        parsed = getattr(response, "parsed", None)
        if isinstance(parsed, schema):
            model_instance = parsed
        elif parsed is not None:
            model_instance = schema.model_validate(parsed)
        else:
            text = (getattr(response, "text", "") or "").strip()
            model_instance = parse_structured_text(text, schema)
        text = (getattr(response, "text", "") or "").strip() or model_instance.model_dump_json()
        usage = None
        usage_metadata = getattr(response, "usage_metadata", None)
        if usage_metadata is not None:
            try:
                usage = usage_metadata.model_dump(mode="json") if hasattr(usage_metadata, "model_dump") else dict(usage_metadata)
            except Exception:
                usage = None
        return LLMStructuredResponse(text=text, parsed=model_instance, usage=usage, finish_reason=None)
