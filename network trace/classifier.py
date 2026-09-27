import ipaddress
import json
import re
import uuid
from datetime import datetime, timezone

from demo_config import APP_NAME, is_scriptwell_origin
from event_filters import host_port, is_demo_relevant, origin_host_port, sanitize_body
from event_store import append_event
from semantic_classifier import get_classifier

# Ordered, token-boundary rules. More specific categories precede broad context.
VOCABULARY = [
    ("reproductive_health", "HIGH", "reproductive|birth control|contraception|contraceptive|pregnancy|pregnant|fertility|ovulation|last period|menstrual|menstruation"),
    ("sexual_health", "HIGH", "sexual|sti|std|hiv|sexually transmitted"),
    ("mental_health", "HIGH", "mental|depression|anxiety|phq|gad|suicidal|psychiatric|mood"),
    ("substance_use", "HIGH", "substance|alcohol|tobacco|smoking|nicotine|cannabis|recreational drug"),
    ("insurance", "HIGH", "insurance|policy number|member id|subscriber id"),
    ("biometrics", "HIGH", "weight|height|bmi|blood pressure|heart rate|pulse|glucose|oxygen saturation|temperature|vital|biometric"),
    ("medications", "HIGH", "medication|prescription|drug|dosage|dose|rx|allergy"),
    ("diagnoses", "HIGH", "diagnosis|condition|disease|health concern|health.concern"),
    ("symptoms", "MEDIUM", "symptom|nausea|headache|fatigue|pain|vomiting|dizziness|fever|health.duration"),
    ("location", "HIGH", "location|latitude|longitude|gps|zip code|zipcode|postal|address"),
    ("identity", "HIGH", "email|e mail|phone|telephone|full name|first name|last name|person.name|patient name|date of birth|dob|ssn|contact|user id|account id"),
    ("device_identifiers", "LOW", "device|identifier|advertising id|session id|ip address|fingerprint|viewport|language|user agent"),
    ("appointments", "MEDIUM", "appointment|provider|physician|doctor|clinic|pharmacy|pharmacist"),
]


def tokens(value):
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", str(value))
    value = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", value).lower()
    aliases = {"allergies": "allergy", "diagnoses": "diagnosis"}
    words = re.findall(r"[a-z]+|[0-9]+", value)
    return [aliases.get(w, w[:-1] if w.endswith("s") and not w.endswith(("ss", "is")) else w) for w in words]


RULES = [(category, severity, [tokens(alias) for alias in aliases.split("|")])
         for category, severity, aliases in VOCABULARY]
SEVERITY = {category: severity for category, severity, _ in VOCABULARY}

# Content signatures help when a key provides no semantic clue.
VALUE_SIGNATURES = [
    ("identity", "an email address", re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")),
    ("identity", "a phone number", re.compile(r"(?:\+1[- .]?)?\(?[2-9]\d{2}\)?[- .]\d{3}[- .]\d{4}")),
    ("device_identifiers", "a MAC address", re.compile(r"(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}")),
]

PATH_RULE_CONFIDENCE = 0.90
VALUE_RULE_CONFIDENCE = 0.97
SEMANTIC_CONFIDENCE_CAP = 0.85


def _ip_address(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9A-Fa-f:.]{7,45}", value) or value.count(":") == 1:
        return False
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return False
    return True


def rule_match(path, value):
    """Deterministic detection: key vocabulary first, then value signatures."""
    words = tokens(path)
    for category, severity, aliases in RULES:
        for alias in aliases:
            if any(words[i:i + len(alias)] == alias for i in range(len(words))):
                return {"category": category, "severity": severity, "confidence": PATH_RULE_CONFIDENCE,
                        "reason": f"field name contains '{' '.join(alias)}'"}
    if isinstance(value, str):
        for category, label, pattern in VALUE_SIGNATURES:
            if pattern.fullmatch(value):
                return {"category": category, "severity": SEVERITY[category],
                        "confidence": VALUE_RULE_CONFIDENCE, "reason": f"value is {label}"}
        if _ip_address(value):
            return {"category": "device_identifiers", "severity": SEVERITY["device_identifiers"],
                    "confidence": VALUE_RULE_CONFIDENCE, "reason": "value is an IP address"}
    return None


def matching_category(path, value):
    match = rule_match(path, value)
    return (match["category"], match["severity"]) if match else None


EVENT_FIELDS = (
    "event_id",
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
    prepared["event_id"] = str(uuid.uuid4())
    if prepared["timestamp"] is None:
        prepared["timestamp"] = datetime.now(timezone.utc).isoformat()
    if prepared["third_party"] is None:
        prepared["third_party"] = _third_party(prepared["initiator"], prepared["host"])
    return prepared


def _walk(value, path, leaves):
    if isinstance(value, dict):
        for key, child in value.items():
            _walk(child, f"{path}.{key}" if path else str(key), leaves)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _walk(child, f"{path}[{index}]", leaves)
    else:
        leaves.append((path, value))


def _semantic_confidence(score):
    return round(min(SEMANTIC_CONFIDENCE_CAP, 0.3 + 0.7 * score), 2)


def fuse(path, value, rule, semantic):
    """Rules win; semantics fills gaps, corroborates agreement, and is kept for debugging on conflict."""
    if not rule and not semantic:
        return None
    finding = {"field": path, "value": value}
    semantic_reason = semantic and f"meaning resembles '{semantic['prototype']}' (similarity {semantic['score']:.2f})"
    if rule and semantic and semantic["category"] == rule["category"]:
        combined = 1 - (1 - rule["confidence"]) * (1 - _semantic_confidence(semantic["score"]))
        finding.update(category=rule["category"], severity=rule["severity"], confidence=round(min(0.99, combined), 2),
                       detection_method="rule+semantic", reason=f"{rule['reason']}; {semantic_reason}")
    elif rule:
        finding.update(category=rule["category"], severity=rule["severity"], confidence=rule["confidence"],
                       detection_method="rule", reason=rule["reason"])
        if semantic:
            finding["semantic_candidate"] = {"category": semantic["category"], "score": semantic["score"]}
    else:
        finding.update(category=semantic["category"], severity=SEVERITY[semantic["category"]],
                       confidence=_semantic_confidence(semantic["score"]), detection_method="semantic",
                       reason=semantic_reason)
    return finding


def collect_findings(body):
    leaves = []
    if isinstance(body, (dict, list)):
        _walk(body, "", leaves)
    semantic = get_classifier()
    semantic_matches = semantic.classify_many(leaves) if semantic and leaves else [None] * len(leaves)
    findings = []
    for (path, value), match in zip(leaves, semantic_matches):
        finding = fuse(path, value, rule_match(path, value), match)
        if finding:
            findings.append(finding)
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
    address = f"{host}:{port}" if port else host
    return f"{APP_NAME} ({address})" if is_scriptwell_origin(initiator) else address


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
            method = finding.get("detection_method")
            detail = f"  ({method}, {finding['confidence']:.2f})" if method else ""
            print(f"  {finding['severity']:<7}{finding['field']}{detail}", flush=True)
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
