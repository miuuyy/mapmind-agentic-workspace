from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Protocol, TypeVar

from pydantic import BaseModel


T = TypeVar("T", bound=BaseModel)


class LLMProviderError(RuntimeError):
    pass


@dataclass
class LLMStructuredResponse:
    text: str
    parsed: Any
    usage: dict[str, Any] | None = None
    finish_reason: str | None = None


class LLMProvider(Protocol):
    provider_id: str

    def is_configured(self) -> bool: ...

    def generate_text(
        self,
        *,
        model: str,
        system_instruction: str,
        prompt: str,
        max_output_tokens: int,
        temperature: float,
        use_grounding: bool = False,
    ) -> str: ...

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
    ) -> LLMStructuredResponse: ...


def parse_structured_text(text: str, schema: type[T]) -> T:
    normalized = (text or "").strip()
    if not normalized:
        raise LLMProviderError("provider returned empty structured response")
    try:
        payload = json.loads(normalized)
    except json.JSONDecodeError as exc:
        raise LLMProviderError(f"provider returned invalid JSON: {exc}") from exc
    return schema.model_validate(payload)
