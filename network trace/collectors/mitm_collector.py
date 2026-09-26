import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from mitmproxy import http

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from classifier import analyze


def _body(request):
    if not request.content:
        return None
    try:
        return json.loads(request.get_text())
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError):
        return request.get_text()


def _content_type(request):
    headers = getattr(request, "headers", None)
    if headers is None:
        return None
    try:
        value = headers.get("Content-Type")
    except (AttributeError, TypeError):
        return None
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _destination(flow, request):
    destination_ip = None
    destination_port = getattr(request, "port", None)
    server = getattr(flow, "server_conn", None)
    if server is None:
        return destination_ip, destination_port
    try:
        peer = getattr(server, "peername", None)
        if peer and peer[0]:
            destination_ip = peer[0]
        if peer and len(peer) > 1 and peer[1]:
            destination_port = peer[1]
    except (TypeError, IndexError, AttributeError):
        return destination_ip, destination_port
    return destination_ip, destination_port


def _event(flow: http.HTTPFlow):
    request = flow.request
    # peername is the upstream socket after mitmdump connects.
    # In the request hook it is often still empty, so prefer the response hook.
    destination_ip, destination_port = _destination(flow, request)
    scheme = getattr(request, "scheme", None) or None

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "mitm",
        "scheme": scheme,
        "method": getattr(request, "method", None),
        "host": getattr(request, "host", None),
        "path": getattr(request, "path", None),
        "destination_ip": destination_ip,
        "destination_port": destination_port,
        "content_type": _content_type(request),
        "body": _body(request),
    }


def response(flow: http.HTTPFlow):
    # mitmdump has already decrypted this request with the local CA.
    analyze(_event(flow))
