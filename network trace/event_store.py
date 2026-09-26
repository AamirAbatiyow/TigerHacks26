import json
from pathlib import Path

# Local append-only log. This file never gets uploaded by the collectors or the extension.
EVENTS_PATH = Path(__file__).resolve().parent / "events.jsonl"


def append_event(event: dict) -> None:
    try:
        line = json.dumps(event, ensure_ascii=False)
    except (TypeError, ValueError) as error:
        print(f"Failed to store event: {error}", flush=True)
        return

    try:
        with EVENTS_PATH.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")
    except OSError as error:
        print(f"Failed to store event: {error}", flush=True)
