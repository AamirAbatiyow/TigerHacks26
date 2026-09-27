import base64
import binascii
import json
import re
import sys
import time
import uuid
import hashlib
from urllib.parse import parse_qs, urlsplit
from http.server import HTTPServer
from pathlib import Path

from classifier import analyze
from event_store import read_events
from semantic_classifier import get_classifier

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'fly-analytics'))
from server import Handler as PrivacyHandler
from privacy.contract import ValidationError
from privacy.engine import OptOutEngine
from privacy.store import ResultStore
from live_privacy import EventPrivacyFindingProvider
from gmail_service import GmailError, GmailService
from privacy_email import DEMO_PRIVACY_EMAIL, EMAIL, build_privacy_email

HOST, PORT = '127.0.0.1', 8765
UI_ORIGINS = {'http://localhost:5174', 'http://127.0.0.1:5174'}
COLLECTOR_SOURCES = {'mitm', 'tshark'}
MAX_EVENT_BYTES = 4 * 1048576
MAX_GMAIL_BYTES = 65536
GMAIL_OBSERVABILITY_KEYS = {'findings', 'events', 'body_base64', 'embeddings', 'observations', 'packet', 'packets'}


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
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-PatientPrivy-Extension')
        self.end_headers()

    def _json_object(self, limit):
        length = int(self.headers.get('Content-Length', '0'))
        if not 0 < length <= limit:
            raise ValueError()
        payload = json.loads(self.rfile.read(length))
        if not isinstance(payload, dict):
            raise ValueError()
        if set(payload) & GMAIL_OBSERVABILITY_KEYS:
            raise ValidationError('Send only the approved email. Captured observations are not accepted here.')
        return payload

    def _action_draft(self, payload):
        allowed = {'event_id', 'to', 'state', 'include_identity', 'identity', 'contacts'}
        if set(payload) - allowed or not isinstance(payload.get('event_id'), str):
            raise ValidationError('Drafts need a finding id and optional recipient, state, or discovered contacts.')
        finding = self.server.provider.getPrivacyFinding(payload['event_id'])
        event = next((e for e in read_events() if e.get('event_id') == finding.event_id), {})
        draft = build_privacy_email(
            self.server.engine, finding, to=payload.get('to'), state=payload.get('state'),
            include_identity=payload.get('include_identity'), identity=payload.get('identity'),
            event=event, contacts=payload.get('contacts'))
        draft['draft_id'] = str(uuid.uuid4())
        # Drafts are temporary local memory, shared by extension and dashboard.
        now = time.monotonic()
        self.server.drafts = {key: value for key, value in self.server.drafts.items() if now - value['created'] < 1800}
        if len(self.server.drafts) >= 100:
            self.server.drafts.pop(next(iter(self.server.drafts)))
        self.server.drafts[draft['draft_id']] = {'draft': draft, 'created': now}
        return draft

    def _get_draft(self, draft_id):
        saved = self.server.drafts.get(draft_id) if isinstance(draft_id, str) else None
        if not saved or time.monotonic() - saved['created'] >= 1800:
            raise ValidationError('Draft expired. Take Privacy Action again to review a fresh draft.')
        return saved

    def _action_send(self, payload):
        allowed = {'approved', 'draft_id', 'to', 'subject', 'body', 'recipient_source', 'recipient_confirmed'}
        if set(payload) - allowed:
            raise ValidationError('Send only the reviewed draft and email fields.')
        if payload.get('approved') is not True:
            raise ValidationError('Explicit approval is required. Review the email and choose Send with Gmail.')
        saved = self._get_draft(payload.get('draft_id'))
        draft = saved['draft']
        to, subject, body = payload.get('to'), payload.get('subject'), payload.get('body')
        source = payload.get('recipient_source')
        if not all(isinstance(x, str) for x in (to, subject, body)) or source not in {'user', 'verified', 'discovered', 'demo'}:
            raise ValidationError('Review recipient, subject, message, and recipient source.')
        if any(char in to or char in subject for char in '\r\n') or not EMAIL.fullmatch(to.strip()) or not subject.strip() or not body.strip():
            raise ValidationError('Enter one email address, a single-line subject, and a message.')
        if len(subject) > 200 or len(body) > 8000 or len(to) > 254:
            raise ValidationError('The approved email is too long.')
        if source == 'verified':
            finding = self.server.provider.getPrivacyFinding(draft['event_id'])
            current = build_privacy_email(self.server.engine, finding)
            if draft['recipient_source'] != source or current['to'] != to.strip() or draft['to'] != to.strip():
                raise ValidationError('The verified contact changed. Review a new draft.')
        if source == 'demo':
            if draft['recipient_source'] != 'demo' or to.strip() != DEMO_PRIVACY_EMAIL or draft['to'] != DEMO_PRIVACY_EMAIL:
                raise ValidationError('The demo contact changed. Review a new draft.')
        if source == 'discovered':
            if payload.get('recipient_confirmed') is not True:
                raise ValidationError('Confirm the discovered recipient and its page source before sending.')
            if not any(c['email'] == to.strip() for c in draft['recipient_candidates']):
                raise ValidationError('This address was not discovered for this draft.')
        fingerprint = hashlib.sha256(json.dumps([to.strip(), subject.strip(), body]).encode()).hexdigest()
        if saved.get('receipt') and saved.get('fingerprint') == fingerprint:
            return saved['receipt']
        if saved.get('attempted'):
            raise ValidationError('This draft has already been attempted. Check Gmail Sent before creating another request.')
        # Claim before the external call: no implicit retry or duplicate send after a lost response.
        saved.update(attempted=True, fingerprint=fingerprint)
        receipt = self.server.gmail.send_message(to.strip(), subject.strip(), body)
        saved['receipt'] = {'ok': True, 'delivery_status': 'gmail_sent', **receipt}
        return saved['receipt']

    def do_GET(self):
        if not self.privacy_allowed():
            return
        path = self.path.split('?', 1)[0]
        if path == '/api/privacy/actions/draft':
            try:
                draft_id = parse_qs(urlsplit(self.path).query).get('id', [None])[0]
                self.respond(200, self._get_draft(draft_id)['draft'])
            except ValidationError as exc:
                self.respond(400, {'error': str(exc)})
            return
        if path == '/api/gmail/status':
            self.respond(200, self.server.gmail.status())
            return
        if self.path.split('?', 1)[0] == '/events':
            self.respond(200, {'events': read_events()})
        else:
            super().do_GET()

    def do_POST(self):
        if not self.privacy_allowed():
            return
        path = self.path.split('?', 1)[0]
        if path.startswith('/api/gmail/') or path.startswith('/api/privacy/actions/'):
            try:
                payload = {} if path in {'/api/gmail/connect', '/api/gmail/disconnect'} and self.headers.get('Content-Length', '0') == '0' else self._json_object(MAX_GMAIL_BYTES)
                if path == '/api/gmail/connect':
                    result = self.server.gmail.begin_connect()
                    self.respond(400 if result.get('error') else 200, result)
                elif path == '/api/gmail/disconnect':
                    self.respond(200, self.server.gmail.disconnect())
                elif path == '/api/privacy/actions/draft':
                    self.respond(200, self._action_draft(payload))
                elif path == '/api/privacy/actions/send':
                    self.respond(200, self._action_send(payload))
                else:
                    self.respond(404, {'error': 'Not found'})
            except KeyError:
                self.respond(404, {'error': 'Privacy finding not found'})
            except GmailError as exc:
                self.respond(409, {'error': str(exc)})
            except ValidationError as exc:
                self.respond(400, {'error': str(exc)})
            except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
                self.respond(400, {'error': 'Expected a small JSON object'})
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


def create_server(port=PORT, db_path=None, gmail=None):
    server = HTTPServer((HOST, port), Handler)
    server.privacy_enabled = True
    server.drafts = {}
    server.provider = EventPrivacyFindingProvider()
    server.engine = OptOutEngine()
    server.store = ResultStore(db_path or ROOT / 'privacy.sqlite3')
    server.gmail = gmail if gmail is not None else GmailService()
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
