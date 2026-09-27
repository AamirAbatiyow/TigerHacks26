import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from mitmproxy import http

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

# Capture and normalize only; the local API classifies and stores.
from local_sink import send_event


def _raw_body(request):
    # Bytes as sent on the wire (still compressed if Content-Encoding is set).
    # The local API's classifier decides what is safe to keep.
    return getattr(request, "raw_content", None)


def _header(request, name):
    headers = getattr(request, "headers", None)
    if headers is None:
        return None
    try:
        value = headers.get(name)
    except (AttributeError, TypeError):
        return None
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _initiator(request):
    origin = _header(request, "Origin")
    if origin and origin != "null":
        return origin
    referer = _header(request, "Referer")
    if not referer:
        return None
    try:
        parts = urlsplit(referer)
    except ValueError:
        return None
    if not parts.scheme or not parts.netloc:
        return None
    return f"{parts.scheme}://{parts.netloc}"


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
        "content_type": _header(request, "Content-Type"),
        "content_encoding": _header(request, "Content-Encoding"),
        "initiator": _initiator(request),
        "tab_id": None,
        "third_party": None,
        "request_type": None,
        "body": _raw_body(request),
    }


def response(flow: http.HTTPFlow):
    # mitmdump has already decrypted this request with the local CA.
    send_event(_event(flow), "mitm")
