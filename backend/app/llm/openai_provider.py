from __future__ import annotations

from typing import Any, Iterable, TypeVar

import httpx
from pydantic import BaseModel

from app.core.config import Settings
from app.llm.base import LLMProviderError, LLMStructuredResponse, LLMStructuredStreamChunk, parse_structured_text


T = TypeVar("T", bound=BaseModel)


class OpenAIProvider:
    provider_id = "openai"

    def __init__(self, settings: Settings):
        self._settings = settings
        self._api_key = (settings.openai_api_key or "").strip()
        self._base_url = (settings.openai_base_url or "https://api.openai.com/v1").rstrip("/")

    def is_configured(self) -> bool:
        return bool(self._api_key)

    def _request(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.is_configured():
            raise LLMProviderError("OpenAI provider is not configured")
        try:
            response = httpx.post(
                f"{self._base_url}/responses",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                json=payload,
                timeout=httpx.Timeout(300.0, connect=20.0),
            )
        except Exception as exc:
            raise LLMProviderError(f"OpenAI request failed before receiving a response: {exc}") from exc
        if response.is_error:
            detail = ""
            try:
                payload_json = response.json()
                if isinstance(payload_json, dict):
                    error = payload_json.get("error")
                    if isinstance(error, dict):
                        detail = str(error.get("message") or "")
            except Exception:
                detail = response.text.strip()
            suffix = f": {detail}" if detail else ""
            raise LLMProviderError(f"OpenAI request failed with {response.status_code}{suffix}")
        return response.json()

    @staticmethod
    def _normalize_json_schema(schema: dict[str, Any]) -> dict[str, Any]:
        def walk(node: Any) -> Any:
            if isinstance(node, dict):
                normalized = {key: walk(value) for key, value in node.items()}
                if normalized.get("type") == "object":
                    normalized["additionalProperties"] = False
                    properties = normalized.get("properties")
                    if isinstance(properties, dict):
                        normalized["required"] = list(properties.keys())
                return normalized
            if isinstance(node, list):
                return [walk(item) for item in node]
            return node

        return walk(schema)

    @staticmethod
    def _extract_output_text(payload: dict[str, Any]) -> str:
        output_text = payload.get("output_text")
        if isinstance(output_text, str) and output_text.strip():
            return output_text.strip()
        outputs = payload.get("output")
        collected: list[str] = []
        if isinstance(outputs, list):
            for item in outputs:
                if not isinstance(item, dict):
                    continue
                content = item.get("content")
                if not isinstance(content, list):
                    continue
                for part in content:
                    if not isinstance(part, dict):
                        continue
                    text = part.get("text")
                    if isinstance(text, str) and text.strip():
                        collected.append(text)
        normalized = "".join(collected).strip()
        if not normalized:
            raise LLMProviderError("OpenAI returned empty text response")
        return normalized

    def _build_payload(
        self,
        *,
        model: str,
        system_instruction: str,
        prompt: str,
        max_output_tokens: int,
        use_grounding: bool,
        response_format: dict[str, Any] | None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": model,
            "instructions": system_instruction,
            "input": prompt,
            "max_output_tokens": max_output_tokens,
        }
        reasoning_effort = self._reasoning_effort(model=model, max_output_tokens=max_output_tokens)
        if reasoning_effort is not None:
            payload["reasoning"] = {"effort": reasoning_effort}
        if use_grounding:
            payload["tools"] = [{"type": "web_search"}]
            payload["include"] = ["web_search_call.action.sources"]
        if response_format is not None:
            payload["text"] = {"format": response_format}
        return payload

    @staticmethod
    def _reasoning_effort(*, model: str, max_output_tokens: int) -> str | None:
        normalized = (model or "").strip().lower()
        if not normalized.startswith("gpt-5"):
            return None
        if "pro" in normalized:
            return "high"
        if max_output_tokens <= 2048:
            return "low"
        if max_output_tokens >= 20000:
            return "high"
        return "medium"

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
        payload = self._build_payload(
            model=model,
            system_instruction=system_instruction,
            prompt=prompt,
            max_output_tokens=max_output_tokens,
            use_grounding=use_grounding,
            response_format=None,
        )
        response = self._request(payload)
        return self._extract_output_text(response)

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
        json_schema = self._normalize_json_schema(response_json_schema or schema.model_json_schema())
        payload = self._build_payload(
            model=model,
            system_instruction=system_instruction,
            prompt=prompt,
            max_output_tokens=max_output_tokens,
            use_grounding=use_grounding,
            response_format={
                "type": "json_schema",
                "name": schema_name or schema.__name__.lower(),
                "schema": json_schema,
                "strict": True,
            },
        )
        response = self._request(payload)
        text = self._extract_output_text(response)
        parsed = parse_structured_text(text, schema)
        usage = response.get("usage") if isinstance(response.get("usage"), dict) else None
        return LLMStructuredResponse(
            text=text,
            parsed=parsed,
            usage=usage,
            finish_reason=response.get("status") if isinstance(response.get("status"), str) else None,
        )

    def stream_structured(
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
    ) -> Iterable[LLMStructuredStreamChunk]:
        response = self.generate_structured(
            model=model,
            system_instruction=system_instruction,
            prompt=prompt,
            schema=schema,
            schema_name=schema_name,
            response_json_schema=response_json_schema,
            max_output_tokens=max_output_tokens,
            temperature=temperature,
            use_grounding=use_grounding,
        )
        yield LLMStructuredStreamChunk(
            text=response.text,
            usage=response.usage,
            finish_reason=response.finish_reason,
        )
