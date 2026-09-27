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
    ("financial", "HIGH", "credit card|debit card|card number|card num|card no|cc number|cc num|primary account number|"
                          "cardholder|card holder|name on card|card last|cvc|cvv|ccv|security code|card verification|"
                          "exp month|exp year|expiration month|expiration year|expiry month|expiry year|card expiration|"
                          "card expiry|routing number|routing no|aba number|aba routing|bank account|account number|"
                          "iban|bic|swift code|swift bic|sort code|payment token|card token"),
    ("biometrics", "HIGH", "weight|height|bmi|blood pressure|heart rate|pulse|glucose|oxygen saturation|temperature|vital|biometric"),
    ("medications", "HIGH", "medication|prescription|drug|dosage|dose|rx|allergy"),
    ("diagnoses", "HIGH", "diagnosis|condition|disease|health concern|health.concern"),
    ("symptoms", "MEDIUM", "symptom|nausea|headache|fatigue|pain|vomiting|dizziness|fever|health.duration"),
    ("location", "HIGH", "location|latitude|longitude|gps|zip code|zipcode|billing zip|postal|address"),
    ("identity", "HIGH", "email|e mail|phone|telephone|full name|first name|last name|person.name|patient name|date of birth|dob|ssn|contact|user id|account id"),
    ("device_identifiers", "LOW", "device|identifier|advertising id|session id|ip address|fingerprint|viewport|language|user agent"),
    ("appointments", "MEDIUM", "appointment|provider|physician|doctor|clinic|pharmacy|pharmacist"),
]


def tokens(value):
    value = re.sub(r"\[\d+\]", " ", str(value))
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", value)
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

# Ambiguous on their own (session expiration, map pan, Swift version); financial only
# when another word of the path places them in a payment context.
PAYMENT_CONTEXT = {"payment", "card", "credit", "debit", "cc", "billing", "bank", "checkout", "wallet"}
CONTEXTUAL_FINANCIAL = [tokens(alias) for alias in
                        "pan|exp|expiration|expiry|expire|exp date|expiration date|expiry date|valid thru|"
                        "valid through|swift".split("|")]
EXPIRY_WORDS = {"exp", "expiration", "expiry", "expire", "valid", "thru"}
CVC_WORDS = [["cvc"], ["cvv"], ["ccv"], ["security", "code"], ["card", "verification"]]
ROUTING_WORDS = {"routing", "aba"}

# Issuer prefixes and lengths; together with Luhn, arbitrary numeric IDs rarely qualify.
CARD_NETWORKS = [
    (re.compile(r"4"), {13, 16, 19}),
    (re.compile(r"5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720"), {16}),
    (re.compile(r"3[47]"), {15}),
    (re.compile(r"6011|65|64[4-9]"), {16, 17, 18, 19}),
    (re.compile(r"35(?:2[89]|[3-8]\d)"), {16, 17, 18, 19}),
    (re.compile(r"3(?:0[0-5]|[689])"), {14, 15, 16, 17, 18, 19}),
    (re.compile(r"62"), {16, 17, 18, 19}),
]
CARD_TEXT = re.compile(r"\d(?:[ -]?\d){12,18}")
GROUPED_CARD = re.compile(r"\d{4}([ -])\d{4}\1\d{4}\1\d{4}(?:\1\d{1,3})?|\d{4}([ -])\d{6}\2\d{4,5}")
EXPIRY_VALUE = re.compile(r"(0?[1-9]|1[0-2])\s?[/-]\s?(\d{2}|20\d{2})")
IBAN_LENGTHS = {
    "AD": 24, "AE": 23, "AT": 20, "BE": 16, "BG": 22, "BH": 22, "BR": 29, "CH": 21, "CY": 28, "CZ": 24,
    "DE": 22, "DK": 18, "EE": 20, "ES": 24, "FI": 18, "FR": 27, "GB": 22, "GR": 27, "HR": 21, "HU": 28,
    "IE": 22, "IL": 23, "IS": 26, "IT": 27, "KW": 30, "KZ": 20, "LI": 21, "LT": 20, "LU": 20, "LV": 21,
    "MC": 27, "MT": 31, "MX": 18, "NL": 18, "NO": 15, "PK": 24, "PL": 28, "PT": 25, "QA": 29, "RO": 24,
    "RS": 22, "SA": 24, "SE": 24, "SI": 19, "SK": 24, "SM": 27, "TR": 26, "UA": 29,
}


def _contains(words, alias):
    return any(words[i:i + len(alias)] == alias for i in range(len(words)))


def luhn_valid(digits):
    """Luhn mod 10: from the rightmost digit, double every second digit (minus 9 if over 9); sum % 10 == 0."""
    total = 0
    for position, char in enumerate(reversed(digits)):
        digit = int(char)
        if position % 2:
            digit = digit * 2 - 9 if digit > 4 else digit * 2
        total += digit
    return total % 10 == 0


def card_number(value):
    """(digits, grouped) for a plausible payment card number, else None."""
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        return None
    text = str(value).strip()
    if not CARD_TEXT.fullmatch(text):
        return None
    digits = re.sub(r"[ -]", "", text)
    if not any(prefix.match(digits) and len(digits) in lengths for prefix, lengths in CARD_NETWORKS):
        return None
    if not luhn_valid(digits):
        return None
    return digits, bool(GROUPED_CARD.fullmatch(text))


def iban_valid(value):
    if not isinstance(value, str):
        return False
    text = value.replace(" ", "")
    if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{11,30}", text) or IBAN_LENGTHS.get(text[:2]) != len(text):
        return False
    rearranged = text[4:] + text[:4]
    return int("".join(str(int(char, 36)) for char in rearranged)) % 97 == 1


def aba_routing_valid(value):
    text = str(value).strip() if isinstance(value, (str, int)) and not isinstance(value, bool) else ""
    if not re.fullmatch(r"\d{9}", text):
        return False
    d = [int(char) for char in text]
    return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + d[2] + d[5] + d[8]) % 10 == 0


def _financial(reason):
    return {"category": "financial", "severity": SEVERITY["financial"],
            "confidence": VALUE_RULE_CONFIDENCE, "reason": reason}


def financial_value_match(words, value):
    """Structural payment detection. Card numbers need issuer prefix, length, and Luhn, plus either a
    payment context in the path or card-style digit grouping; the other checks need the field's own context."""
    context = bool(PAYMENT_CONTEXT & set(words))
    card = card_number(value)
    if card and (context or card[1]):
        return _financial("value is a Luhn-valid payment card number")
    if iban_valid(value):
        return _financial("value is a checksum-valid IBAN")
    text = str(value).strip() if isinstance(value, (str, int)) and not isinstance(value, bool) else ""
    if any(_contains(words, alias) for alias in CVC_WORDS) and re.fullmatch(r"\d{3,4}", text):
        return _financial("value is a 3-4 digit card security code")
    if context and EXPIRY_WORDS & set(words) and EXPIRY_VALUE.fullmatch(text):
        return _financial("value is a card expiration date")
    if ROUTING_WORDS & set(words) and aba_routing_valid(value):
        return _financial("value is a checksum-valid ABA routing number")
    return None


def _ip_address(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9A-Fa-f:.]{7,45}", value) or value.count(":") == 1:
        return False
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return False
    return True


def rule_match(path, value):
    """Deterministic detection: structural payment values, key vocabulary, then value signatures."""
    words = tokens(path)
    structural = financial_value_match(words, value)
    if structural:
        return structural
    for category, severity, aliases in RULES:
        for alias in aliases:
            if _contains(words, alias):
                return {"category": category, "severity": severity, "confidence": PATH_RULE_CONFIDENCE,
                        "reason": f"field name contains '{' '.join(alias)}'"}
    if PAYMENT_CONTEXT & set(words):
        for alias in CONTEXTUAL_FINANCIAL:
            if _contains(words, alias):
                return {"category": "financial", "severity": SEVERITY["financial"],
                        "confidence": PATH_RULE_CONFIDENCE,
                        "reason": f"field name contains '{' '.join(alias)}' in a payment context"}
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
