"""Single-user local SQLite persistence: no names, emails, or raw payloads."""
from contextlib import contextmanager
import hashlib
import hmac
import json
import secrets
import sqlite3
from pathlib import Path
from .engine import now


class EventConflict(ValueError):
    pass


class ResultStore:
    def __init__(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.path = str(path)
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS metadata (name TEXT PRIMARY KEY, value TEXT NOT NULL)')
            db.execute('INSERT OR IGNORE INTO metadata VALUES (?, ?)', ('fingerprint_key', secrets.token_hex(32)))
            db.execute('CREATE TABLE IF NOT EXISTS opt_out_results (event_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result TEXT NOT NULL)')

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()

    def list(self):
        with self.connect() as db:
            return [json.loads(row[0]) for row in db.execute('SELECT result FROM opt_out_results ORDER BY rowid DESC')]

    def run(self, finding, engine):
        with self.connect() as db:
            # Serialize event claiming across processes; durable READY prevents resubmission.
            db.execute('BEGIN IMMEDIATE')
            key = bytes.fromhex(db.execute("SELECT value FROM metadata WHERE name = 'fingerprint_key'").fetchone()[0])
            fingerprint = hmac.new(key, json.dumps(finding.to_dict(), sort_keys=True).encode(), hashlib.sha256).hexdigest()
            existing = db.execute('SELECT fingerprint, result FROM opt_out_results WHERE event_id = ?', (finding.event_id,)).fetchone()
            if existing:
                if not hmac.compare_digest(existing[0], fingerprint):
                    raise EventConflict('event_id already belongs to different input; use a new event_id')
                result = json.loads(existing[1])
                if result['status'] == 'READY':
                    # Crash after commit/before receipt: never automatically resend.
                    result.update(status='ACTION_REQUIRED', message='Previous attempt was interrupted. Verify the official mechanism before retrying.')
                    result['evidence'].append({'at': now(), 'status': 'ACTION_REQUIRED', 'message': result['message']})
                    db.execute('UPDATE opt_out_results SET result = ? WHERE event_id = ?', (json.dumps(result), finding.event_id))
                return result
            result, strategy = engine.resolve(finding)
            db.execute('INSERT INTO opt_out_results VALUES (?, ?, ?)', (finding.event_id, fingerprint, json.dumps(result)))
            # Persist READY before any remote side effect. A crash becomes uncertain, never duplicate.
            db.commit()
            result = engine.execute(finding, result, strategy)
            db.execute('UPDATE opt_out_results SET result = ? WHERE event_id = ?', (json.dumps(result), finding.event_id))
            return result
