"""Forward normalized collector events to the local API. Standard library only.

Collectors never classify or persist: the local API runs the shared classifier
and is the only writer of the event store. Events go to loopback only.
"""
import base64
import json
import urllib.request
from urllib.error import URLError

LOCAL_EVENTS_URL = "http://127.0.0.1:8765/events"
LOCAL_API_PORT = 8765
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1", "[::1]"}
# Loopback only, ignoring any proxy environment variables.
_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def _host_port(host, port):
    text = str(host or "").strip().lower()
    if text.startswith("["):
        name, _, rest = text[1:].partition("]")
        explicit = rest.lstrip(":")
    elif text.count(":") == 1:
        name, _, explicit = text.partition(":")
    else:
        name, explicit = text, ""
    try:
        return name, int(explicit or port)
    except (TypeError, ValueError):
        return name, None


def targets_local_api(event):
    """The collector's own POSTs to the local API must never be captured and re-forwarded."""
    name, port = _host_port(event.get("host"), event.get("destination_port"))
    return name in LOOPBACK_HOSTS and port == LOCAL_API_PORT


def encode(event):
    payload = dict(event)
    body = payload.pop("body", None)
    if isinstance(body, str):
        body = body.encode("utf-8", errors="surrogatepass")
    payload["body"] = None
    if body is not None:
        payload["body_base64"] = base64.b64encode(bytes(body)).decode("ascii")
    return json.dumps(payload).encode("utf-8")


def send_event(event, label):
    """POST one event to the local classifier. Returns True when the API accepted it."""
    if targets_local_api(event):
        return False
    request = urllib.request.Request(LOCAL_EVENTS_URL, data=encode(event), method="POST",
                                     headers={"Content-Type": "application/json"})
    try:
        with _opener.open(request, timeout=10) as response:
            accepted = bool(json.load(response).get("accepted"))
    except (URLError, OSError, ValueError) as error:
        print(f"[{label}] local API unavailable at {LOCAL_EVENTS_URL} ({error})", flush=True)
        return False
    if accepted:
        print(f"[{label}] {event.get('method') or '?'} {event.get('host') or '?'}{event.get('path') or ''} "
              "-> local classifier", flush=True)
    return accepted
