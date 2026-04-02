from __future__ import annotations

import unittest

from pydantic import BaseModel

from app.core.config import Settings
from app.llm.openai_provider import OpenAIProvider


class _SchemaStub(BaseModel):
    ok: bool


class OpenAIProviderTests(unittest.TestCase):
    def setUp(self) -> None:
        settings = Settings()
        settings.openai_api_key = "test-key"
        self.provider = OpenAIProvider(settings)

    def test_build_payload_uses_reasoning_for_gpt5_family(self) -> None:
        payload = self.provider._build_payload(  # noqa: SLF001
            model="gpt-5.4",
            system_instruction="system",
            prompt="prompt",
            max_output_tokens=24000,
            use_grounding=False,
            response_format=None,
        )

        self.assertNotIn("temperature", payload)
        self.assertEqual(payload["reasoning"]["effort"], "high")

    def test_build_payload_omits_reasoning_for_non_reasoning_family(self) -> None:
        payload = self.provider._build_payload(  # noqa: SLF001
            model="gpt-4.1",
            system_instruction="system",
            prompt="prompt",
            max_output_tokens=4000,
            use_grounding=True,
            response_format=None,
        )

        self.assertNotIn("temperature", payload)
        self.assertNotIn("reasoning", payload)
        self.assertEqual(payload["tools"], [{"type": "web_search"}])

    def test_generate_structured_uses_text_format_json_schema(self) -> None:
        payload = self.provider._build_payload(  # noqa: SLF001
            model="gpt-5.4-mini",
            system_instruction="system",
            prompt="prompt",
            max_output_tokens=4096,
            use_grounding=False,
            response_format={
                "type": "json_schema",
                "name": "schema_stub",
                "schema": _SchemaStub.model_json_schema(),
                "strict": True,
            },
        )

        self.assertIn("text", payload)
        self.assertEqual(payload["text"]["format"]["type"], "json_schema")

    def test_normalize_json_schema_sets_additional_properties_false(self) -> None:
        normalized = self.provider._normalize_json_schema(  # noqa: SLF001
            {
                "type": "object",
                "properties": {
                    "inline_quiz": {
                        "anyOf": [
                            {
                                "type": "object",
                                "properties": {
                                    "question": {"type": "string"},
                                },
                            },
                            {"type": "null"},
                        ]
                    }
                },
                "$defs": {
                    "Child": {
                        "type": "object",
                        "properties": {
                            "value": {"type": "string"},
                        },
                    }
                },
            }
        )

        self.assertFalse(normalized["additionalProperties"])
        self.assertEqual(normalized["required"], ["inline_quiz"])
        self.assertFalse(normalized["properties"]["inline_quiz"]["anyOf"][0]["additionalProperties"])
        self.assertEqual(normalized["properties"]["inline_quiz"]["anyOf"][0]["required"], ["question"])
        self.assertFalse(normalized["$defs"]["Child"]["additionalProperties"])
        self.assertEqual(normalized["$defs"]["Child"]["required"], ["value"])


if __name__ == "__main__":
    unittest.main()
