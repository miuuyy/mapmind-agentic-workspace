"""Entry point for the Clew MCP stdio server."""
from __future__ import annotations

import asyncio
import logging
import sys

from .server import run_stdio


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stderr,
    )
    try:
        asyncio.run(run_stdio())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
