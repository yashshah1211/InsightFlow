"""Explicit local-only secret loading; no dotenv evaluation, logging, or network IO."""
from __future__ import annotations
import os
from pathlib import Path

KEY = "ADAPTION_API_KEY"


def load_key(path: Path, environment=None):
    environment = os.environ if environment is None else environment
    if environment.get(KEY):
        return "process_environment"
    if path.name != ".env.local" or path.stat().st_size > 64 * 1024:
        raise ValueError("Use the ignored local .env.local secret file")
    matches = []
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        name, separator, value = line.strip().removeprefix("export ").partition("=")
        if separator and name.strip() == KEY:
            value = value.strip()
            if value.startswith(("'", '"')):
                if len(value) < 2 or value[-1] != value[0]:
                    raise ValueError("Invalid local Adaption key entry")
                value = value[1:-1]
            if not value or any(c.isspace() or ord(c) < 32 for c in value) or any(c in value for c in "$`\\\"'"):
                raise ValueError("Invalid local Adaption key entry")
            matches.append(value)
    if len(matches) != 1:
        raise ValueError("Exactly one nonempty local Adaption key entry is required")
    environment[KEY] = matches[0]
    return "local_secret_file"
