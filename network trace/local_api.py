import base64
import binascii
import json
import re
import sys
import time
from http.server import HTTPServer
from pathlib import Path

from classifier import analyze
from event_store import read_events
from semantic_classifier import get_classifier

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'fly-analytics'))
from server import Handler as PrivacyHandler
from privacy.engine import OptOutEngine
from privacy.store import ResultStore
from live_privacy import EventPrivacyFindingProvider

HOST, PORT = '127.0.0.1', 8765
UI_ORIGINS = {'http://localhost:5174', 'http://127.0.0.1:5174'}
COLLECTOR_SOURCES = {'mitm', 'tshark'}
MAX_EVENT_BYTES = 4 * 1048576


def process_event(event, collector=False):
    """Single ingestion path for every source: filter, sanitize, classify, persist, print.

    Local collectors (mitmproxy, tshark) send no Origin and may carry a base64 body.
    Browser clients are always the metadata-only extension observer.
    """
    event.pop('event_id', None)
    encoded = event.pop('body_base64', None)
    if collector and event.get('source') in COLLECTOR_SOURCES:
        event['body'] = base64.b64decode(encoded, validate=True) if isinstance(encoded, str) else None
    else:
        event['source'] = 'browser_extension'
        event['body'] = None
    analyze(event)
    return event


class Handler(PrivacyHandler):
    def allowed(self):
        port = self.server.server_port
        if self.headers.get('Host') not in {f'127.0.0.1:{port}', f'localhost:{port}'}:
            return False
        origin = self.headers.get('Origin')
        if origin:
            return origin in UI_ORIGINS or bool(re.fullmatch(r'chrome-extension://[a-p]{32}', origin))
        return self.headers.get('Sec-Fetch-Site') != 'cross-site'

    def privacy_allowed(self):
        if not self.allowed():
            self.respond(403, {'error': 'Untrusted local client'})
            return False
        return True

    def respond(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        origin = self.headers.get('Origin')
        if origin and self.allowed():
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        if not self.allowed():
            self.respond(403, {'error': 'Untrusted local client'})
            return
        self.send_response(204)
        if self.headers.get('Origin'):
            self.send_header('Access-Control-Allow-Origin', self.headers['Origin'])
            self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-HealthTrace-Extension')
        self.end_headers()

    def do_GET(self):
        if not self.privacy_allowed():
            return
        if self.path.split('?', 1)[0] == '/events':
            self.respond(200, {'events': read_events()})
        else:
            super().do_GET()

    def do_POST(self):
        if not self.privacy_allowed():
            return
        if self.path.startswith('/api/privacy/'):
            super().do_POST()
            return
        if self.path != '/events':
            self.respond(404, {'error': 'Not found'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= MAX_EVENT_BYTES:
                raise ValueError()
            event = json.loads(self.rfile.read(length))
            if not isinstance(event, dict):
                raise ValueError()
            process_event(event, collector=not self.headers.get('Origin'))
        except (ValueError, UnicodeDecodeError, binascii.Error):
            self.respond(400, {'error': 'Expected a JSON event object under 4 MiB'})
            return
        self.respond(200, {'ok': True, 'accepted': bool(event.get('event_id'))})

    def log_message(self, fmt, *args):
        pass


def create_server(port=PORT, db_path=None):
    server = HTTPServer((HOST, port), Handler)
    server.privacy_enabled = True
    server.provider = EventPrivacyFindingProvider()
    server.engine = OptOutEngine()
    server.store = ResultStore(db_path or ROOT / 'privacy.sqlite3')
    return server


def load_semantic_model():
    start = time.perf_counter()
    model = get_classifier()
    if model:
        print(f'Semantic classifier ready: {model.model_path.name} in {(time.perf_counter() - start) * 1000:.0f} ms', flush=True)
    else:
        print('WARNING: semantic classifier unavailable; classifying with deterministic rules only', flush=True)


if __name__ == '__main__':
    load_semantic_model()
    server = create_server()
    print(f'Local events and privacy API: http://{HOST}:{PORT} (sole classifier and event store writer)', flush=True)
    server.serve_forever()
