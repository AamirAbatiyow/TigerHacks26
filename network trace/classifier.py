import json
from datetime import datetime, timezone

from event_filters import host_port, is_demo_relevant, origin_host_port, sanitize_body
from event_store import append_event

# Field name -> (severity, category). Nested objects are walked by key name.
FIELDS = {
    "birth_control": ("HIGH", "reproductive_health"),
    "pregnancy_goal": ("HIGH", "reproductive_health"),
    "symptom": ("MEDIUM", "symptom"),
    "user_id": ("LOW", "identity"),
}

SENSITIVE_FIELDS = {name: severity for name, (severity, _) in FIELDS.items()}
HEALTH_RISKS = {"HIGH", "MEDIUM"}

EVENT_FIELDS = (
    "timestamp",
    "source",
    "scheme",
    "method",
    "host",
    "path",
    "destination_ip",
    "destination_port",
    "content_type",
    "content_encoding",
    "initiator",
    "tab_id",
    "third_party",
    "request_type",
    "body",
    "body_size",
    "body_type",
)

RULE = "─" * 40
SOURCE_LABELS = {
    "tshark": "tshark",
    "mitm": "mitmproxy",
    "browser_extension": "browser extension",
}


def _blank(value):
    if value == "":
        return None
    return value


def _third_party(initiator, host):
    origin_host, _ = origin_host_port(initiator)
    target_host, _ = host_port(host)
    if not origin_host or not target_host:
        return None
    return origin_host.lower() != target_host.lower()


def prepare_event(event):
    prepared = {key: None for key in EVENT_FIELDS}
    if not isinstance(event, dict):
        return prepared
    for key in EVENT_FIELDS:
        if key in event:
            prepared[key] = _blank(event.get(key))
    if prepared["timestamp"] is None:
        prepared["timestamp"] = datetime.now(timezone.utc).isoformat()
    if prepared["third_party"] is None:
        prepared["third_party"] = _third_party(prepared["initiator"], prepared["host"])
    return prepared


def _walk(value, prefix, findings):
    if isinstance(value, dict):
        for key, child in value.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            meta = FIELDS.get(str(key))
            if meta and not isinstance(child, (dict, list)):
                severity, category = meta
                findings.append({
                    "field": path,
                    "value": child,
                    "category": category,
                    "severity": severity,
                })
            if isinstance(child, (dict, list)):
                _walk(child, path, findings)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            path = f"{prefix}.{index}" if prefix else str(index)
            if isinstance(child, (dict, list)):
                _walk(child, path, findings)


def collect_findings(body):
    findings = []
    if isinstance(body, (dict, list)):
        _walk(body, "", findings)
    return findings


def _short(value, limit=80):
    if isinstance(value, bool) or value is None:
        text = json.dumps(value)
    else:
        text = str(value)
    text = " ".join(text.split())
    if len(text) > limit:
        return text[: limit - 1] + "…"
    return text


def _local_time(timestamp):
    try:
        parsed = datetime.fromisoformat(str(timestamp).replace("Z", "+00:00"))
    except ValueError:
        return _short(timestamp) if timestamp else "unknown"
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone().strftime("%I:%M:%S %p").lstrip("0")


def _origin_label(initiator):
    host, port = origin_host_port(initiator)
    if not host:
        return "unknown"
    return f"{host}:{port}" if port else host


def _body_label(event):
    body_type = event.get("body_type")
    size = event.get("body_size")
    if body_type is None and event.get("source") == "browser_extension":
        return "unavailable to extension"
    if body_type in ("compressed", "binary"):
        encoding = event.get("content_encoding")
        detail = f", {encoding}" if body_type == "compressed" and encoding else ""
        return f"{body_type}{detail}, {size} bytes (not stored)"
    if body_type == "json":
        return f"JSON, {size} bytes"
    if body_type == "text":
        return f"text, {size} bytes"
    if body_type == "empty":
        return "empty"
    return "none"


def _row(label, value):
    print(f"{label + ':':<13}{value}", flush=True)


def print_card(event):
    findings = event.get("findings") or []
    if findings:
        title = "SENSITIVE DATA EVENT"
    elif event.get("source") == "browser_extension":
        title = "BROWSER REQUEST"
    else:
        title = "OBSERVED REQUEST"

    third_party = event.get("third_party")
    third_label = "YES" if third_party is True else "NO" if third_party is False else "unknown"
    scheme = event.get("scheme")
    method = event.get("method") or "?"
    path = event.get("path") or "/"

    print(f"\n{RULE}\n{title}\n{RULE}", flush=True)
    _row("Time", _local_time(event.get("timestamp")))
    _row("Source", SOURCE_LABELS.get(event.get("source"), event.get("source") or "unknown"))
    _row("Protocol", str(scheme).upper() if scheme else "unknown")
    print(flush=True)
    _row("From", _origin_label(event.get("initiator")))
    _row("To", _short(event.get("host") or "unknown"))
    _row("Endpoint", _short(f"{method} {path}"))

    if findings:
        print("\nSensitive data:", flush=True)
        for finding in findings:
            print(f"  {finding['severity']:<7}{finding['field']}", flush=True)
            print(f"         {_short(finding['value'])}", flush=True)
            print(flush=True)
    else:
        print(flush=True)

    _row("Third party", third_label)
    _row("Body", _body_label(event))
    print(RULE, flush=True)


def analyze(event):
    if not isinstance(event, dict):
        return []

    prepared = prepare_event(event)
    if not is_demo_relevant(prepared):
        return []

    body, body_size, body_type = sanitize_body(
        prepared["body"], prepared["content_type"], prepared["content_encoding"]
    )
    prepared["body"] = body
    prepared["body_size"] = body_size
    prepared["body_type"] = body_type

    findings = collect_findings(body) if body_type == "json" else []
    prepared["findings"] = findings
    event.clear()
    event.update(prepared)

    print_card(event)
    append_event(event)
    return findings
