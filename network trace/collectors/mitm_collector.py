import json
import sys
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


def _event(flow: http.HTTPFlow):
    request = flow.request
    # peername is the upstream socket after mitmdump connects.
    # In the request hook it is often still empty, so prefer the response hook.
    peer = getattr(flow.server_conn, "peername", None)
    destination_ip = peer[0] if peer else None
    destination_port = peer[1] if peer else request.port

    return {
        "source": "mitm",
        "method": request.method,
        "host": request.host,
        "path": request.path,
        "destination_ip": destination_ip,
        "destination_port": destination_port,
        "body": _body(request),
    }


def response(flow: http.HTTPFlow):
    # mitmdump has already decrypted this request with the local CA.
    analyze(_event(flow))
