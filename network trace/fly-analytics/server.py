import json
import os
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from privacy.contract import LocalPrivacyFindingProvider, ValidationError
from privacy.engine import OptOutEngine, ROOT
from privacy.store import EventConflict, ResultStore

# ScriptWell (local and deployed) only. Observability events from the extension do not come here.
# ALLOWED_ORIGINS is a comma-separated list of exact origins; "*" is never honored.
DEFAULT_ALLOWED_ORIGINS = ("http://localhost:5173,http://127.0.0.1:5173,https://scriptwell.fly.dev,"
                           "http://localhost:3000")


def parse_allowed_origins(text):
    origins = {item.strip().rstrip("/") for item in str(text).split(",")}
    return frozenset(o for o in origins if re.fullmatch(r"https?://[A-Za-z0-9.-]+(:\d{1,5})?", o))


ALLOWED_ORIGINS = parse_allowed_origins(os.environ.get("ALLOWED_ORIGINS", DEFAULT_ALLOWED_ORIGINS))


class Handler(BaseHTTPRequestHandler):
    def _cors_headers(self):
        if self.headers.get("Origin") in getattr(self.server, "allowed_origins", ALLOWED_ORIGINS):
            self.send_header("Access-Control-Allow-Origin", self.headers["Origin"])
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def extension_findings_origin(self):
        # Only the redacted, read-only provider previews are available to the extension.
        origin = self.headers.get('Origin', '')
        if urlsplit(self.path).path != '/api/privacy/findings':
            return None
        if re.fullmatch(r'chrome-extension://[a-p]{32}', origin):
            return origin
        return None

    def privacy_allowed(self):
        if not getattr(self.server, 'privacy_enabled', False):
            self.respond(404, {'error': 'Local privacy MVP is disabled'})
            return False
        port = self.server.server_port
        if self.headers.get('Host') not in {f'127.0.0.1:{port}', f'localhost:{port}'}:
            self.respond(403, {'error': 'Invalid local host'})
            return False
        origin = self.headers.get('Origin')
        extension_origin = self.extension_findings_origin()
        if extension_origin and self.command == 'GET' and self.headers.get('X-HealthTrace-Extension') == extension_origin.removeprefix('chrome-extension://'):
            return True
        allowed = {'http://localhost:5173', 'http://127.0.0.1:5173', f'http://localhost:{port}', f'http://127.0.0.1:{port}'}
        if (origin and origin not in allowed) or self.headers.get('Sec-Fetch-Site') == 'cross-site':
            self.respond(403, {'error': 'Untrusted origin'})
            return False
        return True

    def respond(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        extension_origin = self.extension_findings_origin()
        if extension_origin:
            self.send_header('Access-Control-Allow-Origin', extension_origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        origin = self.extension_findings_origin()
        if origin:
            if not getattr(self.server, 'privacy_enabled', False):
                self.respond(404, {'error': 'Local privacy MVP is disabled'})
                return
            port = self.server.server_port
            if (self.headers.get('Host') not in {f'127.0.0.1:{port}', f'localhost:{port}'}
                    or self.headers.get('Access-Control-Request-Method') != 'GET'
                    or self.headers.get('Access-Control-Request-Headers', '').lower() != 'x-healthtrace-extension'):
                self.respond(403, {'error': 'Invalid extension preflight'})
                return
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Methods', 'GET')
            self.send_header('Access-Control-Allow-Headers', 'X-HealthTrace-Extension')
            self.end_headers()
            return
        self.send_response(204)
        if self.path == '/collect':
            self._cors_headers()
        self.end_headers()

    def do_GET(self):
        path = urlsplit(self.path).path
        if not path.startswith('/api/privacy/'):
            self.respond(404, {'error': 'Not found'})
            return
        if not self.privacy_allowed():
            return
        if path == '/api/privacy/results':
            self.respond(200, {'results': self.server.store.list()})
        elif path == '/api/privacy/findings':
            try:
                # Preview contains only resolution metadata, never fixture PII.
                findings = [self.server.engine.resolve(f)[0] for f in self.server.provider.listPrivacyFindings()]
                self.respond(200, {'findings': findings})
            except ValidationError as exc:
                self.respond(400, {'error': str(exc)})
        else:
            self.respond(404, {'error': 'Not found'})

    def do_POST(self):
        path = urlsplit(self.path).path
        if path.startswith('/api/privacy/'):
            if not self.privacy_allowed():
                return
            if path != '/api/privacy/run':
                self.respond(404, {'error': 'Not found'})
                return
            if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                self.respond(415, {'error': 'Use application/json'})
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 4096:
                    raise ValidationError('Body must be between 1 and 4096 bytes')
                raw = json.loads(self.rfile.read(length))
                if not isinstance(raw, dict) or set(raw) != {'event_id'} or not isinstance(raw['event_id'], str):
                    raise ValidationError('Send only a string event_id; input comes from the provider')
                finding = self.server.provider.getPrivacyFinding(raw['event_id'])
                self.respond(200, self.server.store.run(finding, self.server.engine))
            except EventConflict as exc:
                self.respond(409, {'error': str(exc)})
            except KeyError:
                self.respond(404, {'error': 'Fixture event not found'})
            except (ValueError, UnicodeDecodeError) as exc:
                self.respond(400, {'error': str(exc) if isinstance(exc, ValidationError) else 'Invalid JSON or content length'})
            return
        if path != '/collect':
            self.respond(404, {'error': 'Not found'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 1048576:
                raise ValueError()
            if self.headers.get('Content-Encoding', 'identity') != 'identity':
                raise ValueError()
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError()
        except (ValueError, UnicodeDecodeError):
            self.respond(400, {'error': 'Expected an uncompressed JSON object under 1 MiB'})
            return
        # Receipt only: never print or retain payload bodies on the remote receiver.
        self.send_response(200)
        self._cors_headers()
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"ok":true}')


def create_server(port=8080, local=False, provider=None, db_path=None, allowed_origins=None):
    server = HTTPServer(('127.0.0.1' if local else '0.0.0.0', port), Handler)
    server.allowed_origins = ALLOWED_ORIGINS if allowed_origins is None else frozenset(allowed_origins)
    server.privacy_enabled = local
    if local:
        server.provider = provider or LocalPrivacyFindingProvider(ROOT / 'fixtures')
        server.engine = OptOutEngine()
        server.store = ResultStore(db_path or Path(__file__).parent / 'data' / 'privacy.sqlite3')
    return server


if __name__ == '__main__':
    local = os.environ.get('PRIVACY_LOCAL_MODE') == '1'
    server = create_server(int(os.environ.get('PORT', '8080')), local,
                           provider=LocalPrivacyFindingProvider(Path(os.environ.get('PRIVACY_FIXTURE_DIR', ROOT / 'fixtures'))),
                           db_path=os.environ.get('PRIVACY_DB_PATH'))
    print(f'Listening on {server.server_address}; privacy MVP {"enabled (local only)" if local else "disabled"}; '
          f'CORS origins: {", ".join(sorted(server.allowed_origins))}', flush=True)
    server.serve_forever()
