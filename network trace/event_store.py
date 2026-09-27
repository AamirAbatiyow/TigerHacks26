import json
import hashlib
import os
from collections import deque
from pathlib import Path

# Local append-only log. This file never gets uploaded by the collectors or the extension.
EVENTS_PATH = Path(os.environ.get("HEALTHTRACE_EVENTS_PATH", Path(__file__).resolve().parent / "events.jsonl"))


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


def read_events(limit=500):
    """Bounded tail; tolerate incomplete writes and normalize legacy local captures."""
    try:
        with EVENTS_PATH.open(encoding="utf-8") as handle:
            lines = deque(handle, maxlen=limit)
    except FileNotFoundError:
        return []
    result = []
    for line in lines:
        try:
            event = json.loads(line)
            if not isinstance(event, dict) or not isinstance(event.get("findings"), list):
                continue
            if not event.get("event_id"):
                # Stable identities for existing captures, without rewriting the log.
                from classifier import prepare_event, collect_findings
                from event_filters import is_demo_relevant, sanitize_body
                event = prepare_event(event)
                if not is_demo_relevant(event):
                    continue
                event['event_id'] = 'legacy-' + hashlib.sha256(line.encode()).hexdigest()[:32]
                body, size, kind = sanitize_body(event['body'], event['content_type'], event['content_encoding'])
                event.update(body=body, body_size=size if size is not None else event["body_size"],
                             body_type=kind or event["body_type"], findings=collect_findings(body))
            result.append(event)
        except ValueError:
            continue
    return result
