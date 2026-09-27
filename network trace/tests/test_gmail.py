import base64
import io
import json
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from datetime import date
from email import message_from_bytes
from email.policy import default as email_policy
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'fly-analytics'))

import event_store
from gmail_service import (
    DEFAULT_CLIENT_SECRET, DEFAULT_TOKEN, GMAIL_SCOPES, GMAIL_SEND_SCOPE, GmailError, GmailService, encode_message,
)
from local_api import create_server
from privacy.contract import PrivacyFinding
from privacy.engine import OptOutEngine
from privacy_email import DEFAULT_ACTION, build_privacy_email, verified_email_recipient
from server import create_server as fly_server

SENTINEL = "SENTINEL-CARD-VALUE"
TODAY = date(2026, 9, 27)
EMAIL_STRATEGY = {
    "id": "example-email",
    "company": "Example Health",
    "aliases": [],
    "canonical_domain": "example.test",
    "domains": ["example.test"],
    "rights": ["limit_sensitive_data", "deletion"],
    "jurisdiction": ["CA"],
    "applicability": "Documented privacy mailbox for this test.",
    "submission_method": "email",
    "verified_endpoint": "mailto:privacy@example.test",
    "required_fields": [],
    "verification_requirements": [],
    "source": "https://example.test/privacy",
    "last_verified": "2026-09-26",
    "status": "verified",
    "instructions": "Email the published privacy contact.",
}


def finding(state="CA", company="Example Health", domain="example.test"):
    user = {"state": state} if state else {"state": None}
    return PrivacyFinding.parse({
        "event_id": "evt-1",
        "company": {"name": company, "domain": domain},
        "reason": {"code": "sensitive_data", "label": "Sensitive data observed", "description": "financial, identity"},
        "user": user,
    })


def rules_with_deadline(days=45, source="https://www.oag.ca.gov/privacy/ccpa", effective="2023-01-01"):
    rules = json.loads((ROOT / "fly-analytics/privacy/rules.json").read_text())
    rules["jurisdictions"]["CA"] = {
        **rules["jurisdictions"]["CA"],
        "response_deadline_days": days,
        "source": source,
        "effective": effective,
    }
    return rules


class Provider:
    def __init__(self, item):
        self.item = item

    def getPrivacyFinding(self, event_id):
        if event_id != self.item.event_id:
            raise KeyError(event_id)
        return self.item

    def listPrivacyFindings(self):
        return [self.item]


def git(*args):
    return subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True)


class EmailDraftTests(unittest.TestCase):
    def engine(self, strategies=None, rules=None):
        return OptOutEngine(strategies=strategies if strategies is not None else [EMAIL_STRATEGY],
                            rules=rules, today=TODAY)

    def test_verified_recipient_and_deadline(self):
        engine = self.engine(rules=rules_with_deadline())
        draft = build_privacy_email(engine, finding(), state="CA")
        self.assertEqual(draft["to"], "privacy@example.test")
        self.assertEqual(draft["recipient_source"], "verified")
        self.assertIn("Example Health", draft["subject"])
        self.assertIn("Please limit retaining or using", draft["body"])
        self.assertIn("Categories observed: financial, identity.", draft["body"])
        self.assertIn("response period of 45 days (https://www.oag.ca.gov/privacy/ccpa).", draft["body"])
        self.assertNotIn("litigation", draft["body"].lower())
        self.assertNotIn("lawsuit", draft["body"].lower())

    def test_unverified_deadline_is_omitted(self):
        shipped = build_privacy_email(self.engine(), finding(), state="CA")
        self.assertNotIn("response period of", shipped["body"])
        self.assertIsNone(shipped["deadline"])
        stale_source = build_privacy_email(self.engine(rules=rules_with_deadline(source="http://example.test/rule")), finding())
        self.assertIsNone(stale_source["deadline"])
        future = build_privacy_email(self.engine(rules=rules_with_deadline(effective="2099-01-01")), finding())
        self.assertIsNone(future["deadline"])
        text_days = rules_with_deadline()
        text_days["jurisdictions"]["CA"]["response_deadline_days"] = "45"
        self.assertIsNone(build_privacy_email(self.engine(rules=text_days), finding())["deadline"])
        self.assertIsNone(build_privacy_email(self.engine(rules=rules_with_deadline()), finding(state=None), state="TX")["deadline"])

    def test_no_verified_mailbox_is_not_guessed(self):
        engine = OptOutEngine(today=TODAY)
        draft = build_privacy_email(engine, finding(company="fly-analytics.fly.dev", domain="fly-analytics.fly.dev", state=None))
        self.assertIsNone(draft["to"])
        self.assertIsNone(verified_email_recipient(engine, finding()))
        portal = json.loads((ROOT / "fly-analytics/privacy/strategies.json").read_text())[0]
        self.assertIsNone(verified_email_recipient(self.engine(strategies=[portal]), finding(company="Microsoft", domain="microsoft.com")))
        https_only = {**EMAIL_STRATEGY, "verified_endpoint": "https://example.test/privacy", "contact_email": ""}
        self.assertIsNone(verified_email_recipient(self.engine(strategies=[https_only]), finding()))
        other = {**EMAIL_STRATEGY, "id": "other", "verified_endpoint": "mailto:other@example.test"}
        self.assertIsNone(verified_email_recipient(self.engine(strategies=[EMAIL_STRATEGY, other]), finding()))

    def test_manual_recipient_and_selected_identity_only(self):
        draft = build_privacy_email(
            self.engine(), finding(company="fly-analytics.fly.dev", domain="fly-analytics.fly.dev", state=None),
            to="privacy@example.test",
            include_identity={"email": False, "first_name": True},
            identity={"email": "hidden@example.test", "first_name": "Avery"},
        )
        self.assertEqual(draft["recipient_source"], "user")
        self.assertIn("First name: Avery", draft["body"])
        self.assertNotIn("hidden@example.test", draft["body"])
        with self.assertRaises(Exception):
            build_privacy_email(self.engine(), finding(), include_identity={"notes": True}, identity={"notes": SENTINEL})

    def test_observability_values_are_not_copied_into_the_draft(self):
        draft = build_privacy_email(self.engine(), finding())
        self.assertNotIn(SENTINEL, json.dumps(draft))
        self.assertNotIn("payment.card_number", json.dumps(draft))
        self.assertNotIn("events.jsonl", json.dumps(draft))


class GmailServiceTests(unittest.TestCase):
    def test_scope_and_local_gitignored_paths(self):
        gmail_scopes = [scope for scope in GMAIL_SCOPES if "/auth/gmail" in scope or "mail.google.com" in scope]
        self.assertEqual(gmail_scopes, [GMAIL_SEND_SCOPE])
        for forbidden in ("gmail.readonly", "gmail.modify", "gmail.compose", "mail.google.com"):
            self.assertFalse(any(forbidden in scope for scope in GMAIL_SCOPES))
        self.assertEqual(DEFAULT_CLIENT_SECRET, REPO / "secrets" / "google_oauth_client.json")
        self.assertEqual(DEFAULT_TOKEN, ROOT / ".state" / "gmail_token.json")
        self.assertTrue(DEFAULT_TOKEN.is_relative_to(REPO))
        self.assertFalse(str(DEFAULT_TOKEN).startswith("http"))
        if shutil.which("git") and git("rev-parse").returncode == 0:
            for path in ("secrets/google_oauth_client.json", "network trace/.state/gmail_token.json",
                         "network trace/.state/nested/gmail_token.json"):
                self.assertEqual(git("check-ignore", "-q", "--no-index", path).returncode, 0, path)

    def test_status_is_disconnected_and_hides_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            token = Path(directory) / "gmail_token.json"
            service = GmailService(client_secret_path=Path(directory) / "missing.json", token_path=token)
            status = service.status()
            self.assertEqual(status, {"connected": False, "status": "disconnected", "email": None})
            token.write_text(json.dumps({
                "token": "ya29.SECRET", "refresh_token": "1//refresh-secret", "client_secret": "client-secret",
                "account_email": "user@gmail.com",
            }))
            status = service.status()
            self.assertEqual(status["email"], "user@gmail.com")
            encoded = json.dumps(status)
            self.assertNotIn("ya29.SECRET", encoded)
            self.assertNotIn("refresh-secret", encoded)
            self.assertNotIn("client-secret", encoded)

    def test_disconnect_removes_local_authorization(self):
        with tempfile.TemporaryDirectory() as directory:
            token = Path(directory) / "gmail_token.json"
            token.write_text(json.dumps({"token": "ya29.SECRET", "refresh_token": "1//refresh-secret", "account_email": "user@gmail.com"}))
            service = GmailService(client_secret_path=Path(directory) / "missing.json", token_path=token)
            with patch("gmail_service.urlopen", side_effect=URLError("offline")):
                status = service.disconnect()
            self.assertFalse(token.exists())
            self.assertFalse(status["connected"])
            self.assertNotIn("ya29.SECRET", json.dumps(status))

    def test_send_posts_only_the_approved_mime_and_api_errors_stay_redacted(self):
        with tempfile.TemporaryDirectory() as directory:
            token = Path(directory) / "gmail_token.json"
            token.write_text(json.dumps({"token": "ya29.SECRET", "account_email": "user@gmail.com", "expiry": "2099-01-01T00:00:00+00:00"}))
            service = GmailService(client_secret_path=Path(directory) / "missing.json", token_path=token)
            seen = {}

            def fake_urlopen(request, timeout=20):
                self.assertEqual(request.full_url, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
                payload = json.loads(request.data.decode())
                self.assertEqual(set(payload), {"raw"})
                mime = message_from_bytes(base64.urlsafe_b64decode(payload["raw"]), policy=email_policy)
                seen["body"] = mime.get_content()
                seen["to"] = mime["To"]
                class Response:
                    def read(self):
                        return b'{"id":"msg-1"}'
                    def __enter__(self):
                        return self
                    def __exit__(self, *args):
                        return False
                return Response()

            with patch("gmail_service.urlopen", fake_urlopen):
                result = service.send_message("privacy@example.test", "Privacy request", "Approved text only.\n")
            self.assertEqual(result["message_id"], "msg-1")
            self.assertEqual(seen["to"], "privacy@example.test")
            self.assertEqual(seen["body"], "Approved text only.\n")
            self.assertNotIn(SENTINEL, seen["body"])

            def fail(request, timeout=20):
                raise HTTPError(request.full_url, 500, "bad", hdrs=None, fp=io.BytesIO(b'{"access_token":"ya29.SECRET"}'))

            with patch("gmail_service.urlopen", fail):
                with self.assertRaises(GmailError) as caught:
                    service.send_message("privacy@example.test", "Privacy request", "Approved text only.\n")
            self.assertNotIn("ya29.SECRET", str(caught.exception))
            self.assertIn("rejected", str(caught.exception).lower())

    def test_revoked_account_status_is_shared_and_does_not_leak_tokens(self):
        with tempfile.TemporaryDirectory() as directory:
            token = Path(directory) / 'token.json'
            token.write_text(json.dumps({'token': 'SECRET', 'account_email': 'me@gmail.com'}))
            service = GmailService(token_path=token)
            with patch('gmail_service.urlopen', side_effect=HTTPError('https://gmail.googleapis.com',401,'revoked',None,None)):
                with self.assertRaises(GmailError):
                    service.send_message('contact@example.test','Privacy request','Approved message')
            self.assertFalse(service.status()['connected'])
            self.assertIn('revoked', service.status()['error'])
            self.assertNotIn('SECRET', json.dumps(service.status()))


class GmailApiTests(unittest.TestCase):
    def post(self, server, path, payload, origin="http://localhost:5174"):
        try:
            response = urlopen(Request(
                f"http://127.0.0.1:{server.server_port}{path}",
                data=json.dumps(payload).encode(),
                headers={"Origin": origin, "Content-Type": "application/json"},
            ))
            return response.status, json.load(response)
        except Exception as exc:
            if hasattr(exc, "code"):
                return exc.code, json.loads(exc.read().decode())
            raise

    def test_local_flow_requires_approval_and_does_not_send_implicitly(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            log = directory / "events.jsonl"
            log.write_text(json.dumps({
                "event_id": "evt-sentinel",
                "timestamp": "2026-09-27T00:00:00+00:00",
                "source": "mitm",
                "host": "fly-analytics.fly.dev",
                "path": "/collect",
                "method": "POST",
                "body": {"payment": {"card_number": SENTINEL}},
                "findings": [{"field": "payment.card_number", "value": SENTINEL, "category": "financial", "severity": "HIGH"}],
            }) + "\n")
            gmail = GmailService(client_secret_path=directory / "missing.json", token_path=directory / "gmail_token.json")
            gmail.sent = []
            gmail.send_message = lambda *args: gmail.sent.append(args) or {"message_id": "msg-1", "email": "user@gmail.com"}
            with patch.object(event_store, "EVENTS_PATH", log):
                server = create_server(0, directory / "privacy.db", gmail=gmail)
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                try:
                    status = json.load(urlopen(f"http://127.0.0.1:{server.server_port}/api/gmail/status", timeout=5))
                    self.assertEqual(status["status"], "disconnected")
                    code, draft = self.post(server, "/api/privacy/actions/draft", {"event_id": "evt-sentinel"})
                    self.assertEqual(code, 200)
                    self.assertIsNone(draft["to"])
                    self.assertEqual(draft["legal_basis"], "general")
                    self.assertNotIn(SENTINEL, json.dumps(draft))
                    self.assertNotIn("payment.card_number", json.dumps(draft))
                    self.assertIn("financial", draft["body"])
                    code, manual = self.post(server, "/api/privacy/actions/draft", {"event_id": "evt-sentinel", "to": "privacy@example.test"})
                    self.assertEqual((code, manual["recipient_source"]), (200, "user"))
                    self.assertNotIn(SENTINEL, manual["body"])
                    code, denied = self.post(server, "/api/privacy/actions/send", {
                        "to": "privacy@example.test", "subject": manual["subject"], "body": manual["body"],
                        "recipient_source": "user", "draft_id": manual["draft_id"],
                    })
                    self.assertEqual(code, 400)
                    self.assertIn("Explicit approval", denied["error"])
                    code, leaked = self.post(server, "/api/privacy/actions/send", {
                        "approved": True, "to": "privacy@example.test", "subject": "Privacy request",
                        "body": "Approved text only.", "recipient_source": "user", "findings": [{"value": SENTINEL}],
                    })
                    self.assertEqual(code, 400)
                    self.assertEqual(gmail.sent, [])
                    code, connect = self.post(server, "/api/gmail/connect", {})
                    self.assertEqual(code, 400)
                    self.assertEqual(gmail.sent, [])
                    code, sent = self.post(server, "/api/privacy/actions/send", {
                        "approved": True, "to": "privacy@example.test", "subject": manual["subject"],
                        "body": manual["body"], "recipient_source": "user", "draft_id": manual["draft_id"],
                    })
                    self.assertEqual(code, 200)
                    self.assertEqual(sent["email"], "user@gmail.com")
                    self.assertEqual(gmail.sent, [("privacy@example.test", manual["subject"], manual["body"])])
                    self.assertNotIn(SENTINEL, gmail.sent[0][2])
                    _, fresh = self.post(server, "/api/privacy/actions/draft", {"event_id": "evt-sentinel"})
                    gmail.send_message = lambda *args: (_ for _ in ()).throw(GmailError("Could not reach Gmail. Nothing was sent."))
                    code, failed = self.post(server, "/api/privacy/actions/send", {
                        "approved": True, "to": "privacy@example.test", "subject": "Privacy request",
                        "body": "Approved text only.", "recipient_source": "user", "draft_id": fresh["draft_id"],
                    })
                    self.assertEqual(code, 409)
                    self.assertIn("Nothing was sent", failed["error"])
                    self.assertEqual(json.load(urlopen(f"http://127.0.0.1:{server.server_port}/api/gmail/status"))["status"], "disconnected")
                    with self.assertRaises(Exception) as caught:
                        urlopen(Request(f"http://127.0.0.1:{server.server_port}/api/gmail/status", headers={"Origin": "https://evil.test"}))
                    self.assertEqual(caught.exception.code, 403)
                finally:
                    server.shutdown()
                    server.server_close()
                    thread.join()

    def test_verified_deadline_round_trip_and_fly_has_no_gmail_route(self):
        item = finding()
        rules = rules_with_deadline()
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            gmail = GmailService(client_secret_path=directory / "missing.json", token_path=directory / "token.json")
            server = create_server(0, directory / "privacy.db", gmail=gmail)
            server.provider = Provider(item)
            server.engine = OptOutEngine(strategies=[EMAIL_STRATEGY], rules=rules, today=TODAY)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                code, draft = self.post(server, "/api/privacy/actions/draft", {"event_id": "evt-1", "state": "CA",
                    "include_identity": {"email": False}, "identity": {"email": "hidden@example.test"}})
                self.assertEqual(code, 200)
                self.assertEqual(draft["to"], "privacy@example.test")
                self.assertEqual(draft["deadline"]["days"], 45)
                self.assertNotIn("hidden@example.test", draft["body"])
                code, mismatch = self.post(server, "/api/privacy/actions/send", {
                    "approved": True, "to": "other@example.test", "subject": draft["subject"], "body": draft["body"],
                    "recipient_source": "verified", "draft_id": draft["draft_id"],
                })
                self.assertEqual(code, 400)
            finally:
                server.shutdown()
                server.server_close()
                thread.join()

        remote = fly_server(0)
        remote_thread = threading.Thread(target=remote.serve_forever, daemon=True)
        remote_thread.start()
        try:
            with self.assertRaises(Exception) as caught:
                urlopen(f"http://127.0.0.1:{remote.server_port}/api/gmail/status")
            self.assertEqual(caught.exception.code, 404)
            self.assertNotIn("/api/gmail", (ROOT / "fly-analytics/server.py").read_text())
        finally:
            remote.shutdown()
            remote.server_close()
            remote_thread.join()


if __name__ == "__main__":
    unittest.main()
