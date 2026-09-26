SENSITIVE_FIELDS = {
    "birth_control": "HIGH",
    "pregnancy_goal": "HIGH",
    "symptom": "MEDIUM",
    "user_id": "LOW",
}

HEALTH_RISKS = {"HIGH", "MEDIUM"}


def _shown(event, key):
    value = event.get(key)
    if value is None or value == "":
        return "(missing)"
    return value


def _walk(value, prefix, findings):
    if isinstance(value, dict):
        for key, child in value.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            if key in SENSITIVE_FIELDS and not isinstance(child, (dict, list)):
                findings.append((SENSITIVE_FIELDS[key], path, child))
            if isinstance(child, (dict, list)):
                _walk(child, path, findings)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            path = f"{prefix}.{index}" if prefix else str(index)
            if isinstance(child, (dict, list)):
                _walk(child, path, findings)


def analyze(event):
    if not isinstance(event, dict):
        print("\n=== OBSERVED REQUEST ===", flush=True)
        print("Body (unparsed):", event, flush=True)
        return

    print("\n=== OBSERVED REQUEST ===", flush=True)
    print("Timestamp:", _shown(event, "timestamp"), flush=True)
    print("Source:", _shown(event, "source"), flush=True)
    print("Scheme:", _shown(event, "scheme"), flush=True)
    print("Method:", _shown(event, "method"), flush=True)
    print("Host:", _shown(event, "host"), flush=True)
    print("Path:", _shown(event, "path"), flush=True)
    print("Destination IP:", _shown(event, "destination_ip"), flush=True)
    print("Destination Port:", _shown(event, "destination_port"), flush=True)
    print("Content-Type:", _shown(event, "content_type"), flush=True)

    body = event.get("body")
    if isinstance(body, (dict, list)):
        findings = []
        _walk(body, "", findings)
        if findings:
            print(flush=True)
        for risk, path, value in findings:
            print(f"[{risk}] {path}: {value}", flush=True)
        if any(risk in HEALTH_RISKS for risk, _, _ in findings):
            print("\n[!] Sensitive health data observed", flush=True)
        return

    if body is not None and body != "":
        print("\nBody (unparsed):", body, flush=True)
