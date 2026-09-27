"""Local Gmail send for an email the user has already approved.

OAuth tokens and the Desktop client file stay on this machine. This module does not
read the event log, and the only Gmail scope it requests is gmail.send.
"""
import base64
import contextlib
import io
import json
import os
import re
import threading
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"
# openid/email identify the connected account. They do not grant mailbox read access.
GMAIL_SCOPES = (
    GMAIL_SEND_SCOPE,
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
)
SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
REPO = Path(__file__).resolve().parents[1]
DEFAULT_CLIENT_SECRET = REPO / "secrets" / "google_oauth_client.json"
DEFAULT_TOKEN = Path(__file__).resolve().parent / ".state" / "gmail_token.json"
EMAIL = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")


class GmailError(Exception):
    """Safe to show to the local user. Never put a token or client secret in the message."""


class GmailNotConnected(GmailError):
    pass


def gmail_libraries_available():
    try:
        import google.auth.transport.requests  # noqa: F401
        import google.oauth2.credentials  # noqa: F401
        import google_auth_oauthlib.flow  # noqa: F401
    except ImportError:
        return False
    return True


def safe_gmail_error(exc):
    text = str(exc).lower()
    name = type(exc).__name__
    if "access_denied" in text or "cancelled" in text or "canceled" in text or "timeout" in text or name == "TimeoutError":
        return "Gmail connection was cancelled or timed out."
    if name == "RefreshError" or "invalid_grant" in text or "revoked" in text:
        return "Gmail authorization expired or was revoked. Connect Gmail again."
    if isinstance(exc, GmailError):
        return str(exc)
    if isinstance(exc, URLError):
        return "Could not reach Gmail. Nothing was sent."
    return "Gmail request failed."


def encode_message(to, subject, body, from_addr=None):
    message = EmailMessage()
    message["To"] = to
    message["Subject"] = subject
    if from_addr:
        message["From"] = from_addr
    message.set_content(body)
    return base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")


def _email_from_id_token(id_token):
    if not isinstance(id_token, str) or id_token.count(".") < 2:
        return None
    payload = id_token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    try:
        data = json.loads(base64.urlsafe_b64decode(payload))
    except (ValueError, json.JSONDecodeError):
        return None
    email = data.get("email") if isinstance(data, dict) else None
    if isinstance(email, str) and EMAIL.fullmatch(email):
        return email
    return None


class GmailService:
    def __init__(self, client_secret_path=None, token_path=None):
        secret = client_secret_path or os.environ.get("PATIENTPRIVY_GOOGLE_CLIENT_SECRET") or DEFAULT_CLIENT_SECRET
        token = token_path or os.environ.get("PATIENTPRIVY_GMAIL_TOKEN") or DEFAULT_TOKEN
        self.client_secret_path = Path(secret)
        self.token_path = Path(token)
        self._lock = threading.Lock()
        self._thread = None
        self._generation = 0
        self._error = None
        self._authorization_invalid = False

    def _load_token(self):
        try:
            data = json.loads(self.token_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        if not isinstance(data, dict) or not isinstance(data.get("token"), str) or not data["token"]:
            return None
        return data

    def _write_token(self, data):
        self.token_path.parent.mkdir(parents=True, exist_ok=True)
        self.token_path.write_text(json.dumps(data), encoding="utf-8")
        try:
            os.chmod(self.token_path, 0o600)
        except OSError:
            pass

    def _expired(self, data):
        expiry = data.get("expiry")
        if not expiry:
            return False
        try:
            parsed = datetime.fromisoformat(str(expiry).replace("Z", "+00:00"))
        except ValueError:
            return True
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed <= datetime.now(timezone.utc) + timedelta(seconds=60)

    def _save_credentials(self, creds, email):
        data = json.loads(creds.to_json())
        if email:
            data["account_email"] = email
        self._write_token(data)

    def _refresh(self, data):
        if not gmail_libraries_available():
            raise GmailError("Gmail libraries are not installed. Run: python3 -m pip install -r 'network trace/requirements-gmail.txt'")
        from google.auth.exceptions import RefreshError
        from google.auth.transport.requests import Request as GoogleRequest
        from google.oauth2.credentials import Credentials
        creds = Credentials.from_authorized_user_info(data, list(GMAIL_SCOPES))
        try:
            creds.refresh(GoogleRequest())
        except RefreshError as exc:
            raise GmailError("Gmail authorization expired or was revoked. Connect Gmail again.") from exc
        email = data.get("account_email") if isinstance(data.get("account_email"), str) else _email_from_id_token(getattr(creds, "id_token", None))
        self._save_credentials(creds, email)

    def _access(self):
        data = self._load_token()
        if not data:
            raise GmailNotConnected("Gmail is not connected. Choose Connect Gmail first.")
        if self._expired(data):
            self._refresh(data)
            data = self._load_token()
        if not data or not data.get("token"):
            raise GmailNotConnected("Gmail is not connected. Choose Connect Gmail first.")
        email = data.get("account_email")
        return data["token"], email if isinstance(email, str) and EMAIL.fullmatch(email) else None

    def status(self):
        if self._thread and self._thread.is_alive():
            return {"connected": False, "status": "pending", "email": None}
        data = self._load_token()
        if self._authorization_invalid:
            return {"connected": False, "status": "disconnected", "email": None, "error": self._error}
        if data:
            email = data.get("account_email")
            return {
                "connected": True,
                "status": "connected",
                "email": email if isinstance(email, str) else None,
            }
        result = {"connected": False, "status": "disconnected", "email": None}
        if self._error:
            result["error"] = self._error
        return result

    def _client_ready(self):
        path = self.client_secret_path
        if not path.is_file():
            raise GmailError(
                "Google OAuth client file not found. Set PATIENTPRIVY_GOOGLE_CLIENT_SECRET "
                "or place the Desktop client JSON at secrets/google_oauth_client.json."
            )
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raise GmailError("Google OAuth client file could not be read.") from None
        installed = data.get("installed") if isinstance(data, dict) else None
        if not isinstance(installed, dict) or not installed.get("client_id") or not installed.get("client_secret"):
            raise GmailError("The OAuth client must be a Google Desktop app client. Web client JSON cannot be used for the local callback.")
        return data

    def begin_connect(self):
        try:
            self._client_ready()
        except GmailError as exc:
            self._error = str(exc)
            return {"connected": False, "status": "disconnected", "email": None, "error": str(exc)}
        if not gmail_libraries_available():
            message = "Gmail libraries are not installed. Run: python3 -m pip install -r 'network trace/requirements-gmail.txt'"
            self._error = message
            return {"connected": False, "status": "disconnected", "email": None, "error": message}
        with self._lock:
            if self._thread and self._thread.is_alive():
                return {"connected": False, "status": "pending", "email": None}
            self._error = None
            generation = self._generation
            self._thread = threading.Thread(target=self._oauth_flow, args=(generation,), name="gmail-oauth", daemon=True)
            self._thread.start()
        return {"connected": False, "status": "pending", "email": None}

    def _oauth_flow(self, generation):
        try:
            from google_auth_oauthlib.flow import InstalledAppFlow
            flow = InstalledAppFlow.from_client_secrets_file(str(self.client_secret_path), scopes=list(GMAIL_SCOPES))
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                creds = flow.run_local_server(
                    host="127.0.0.1",
                    port=0,
                    open_browser=True,
                    timeout_seconds=180,
                    authorization_prompt_message="",
                    success_message="Gmail connected. You can close this tab and return to PatientPrivy.",
                )
            if generation != self._generation:
                return
            self._save_credentials(creds, _email_from_id_token(getattr(creds, "id_token", None)))
            self._authorization_invalid = False
            self._error = None
        except Exception as exc:
            if generation == self._generation:
                self._error = safe_gmail_error(exc)

    def _revoke(self, data):
        token = data.get("refresh_token") or data.get("token")
        if not isinstance(token, str) or not token:
            return
        request = Request(
            "https://oauth2.googleapis.com/revoke",
            data=urlencode({"token": token}).encode(),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            urlopen(request, timeout=5).read()
        except (HTTPError, URLError, TimeoutError, OSError):
            return

    def disconnect(self):
        data = self._load_token() or {}
        with self._lock:
            self._generation += 1
            self._error = None
        self._revoke(data)
        try:
            self.token_path.unlink()
        except FileNotFoundError:
            pass
        except OSError:
            return {"connected": False, "status": "disconnected", "email": None,
                    "error": "Could not remove the local Gmail authorization."}
        return self.status()

    def _post_raw(self, access_token, raw):
        request = Request(
            SEND_URL,
            data=json.dumps({"raw": raw}).encode(),
            headers={"Authorization": "Bearer " + access_token, "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=20) as response:
                payload = json.loads(response.read().decode())
        except HTTPError as exc:
            if exc.code == 401:
                raise GmailError("Gmail authorization expired or was revoked. Connect Gmail again.") from None
            raise GmailError("Gmail rejected the message. Check Sent mail before trying again.") from None
        except (URLError, TimeoutError, OSError):
            raise GmailError("Gmail did not confirm delivery. Check Sent mail before trying again.") from None
        except (ValueError, json.JSONDecodeError):
            raise GmailError("Gmail returned an unreadable response. Check Sent mail before trying again.") from None
        message_id = payload.get("id") if isinstance(payload, dict) else None
        if not isinstance(message_id, str) or not message_id:
            raise GmailError("Gmail did not confirm the message. Check Sent mail before trying again.")
        return message_id

    def send_message(self, to, subject, body):
        """Send one already-approved plain-text message. Callers must enforce approval before this."""
        try:
            access, email = self._access()
            message_id = self._post_raw(access, encode_message(to, subject, body, email))
        except GmailError as exc:
            if 'revoked' in str(exc) or 'expired' in str(exc):
                self._authorization_invalid = True
                self._error = str(exc)
            raise
        except Exception:
            raise GmailError("Gmail did not confirm delivery. Check Sent mail before trying again.") from None
        return {"message_id": message_id, "email": email}
