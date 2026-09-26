import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from classifier import analyze

# Extension observations remain strictly local.
# Never forward browser-observability data to Fly.io or any remote service.
# Bound to loopback so nothing off this machine can post events either.
HOST = "127.0.0.1"
PORT = 8765


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        origin = self.headers.get("Origin")
        if origin and origin.startswith("chrome-extension://"):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/events":
            self._send(404, {"ok": False, "error": "not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0") or "0")
        except ValueError:
            self._send(400, {"ok": False, "error": "expected JSON object"})
            return
        raw = self.rfile.read(length) if length > 0 else b""
        try:
            event = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send(400, {"ok": False, "error": "expected JSON object"})
            return
        if not isinstance(event, dict):
            self._send(400, {"ok": False, "error": "expected JSON object"})
            return

        # The extension is the only client. Do not trust a caller-supplied source.
        event["source"] = "browser_extension"
        analyze(event)
        self._send(200, {"ok": True})

    def log_message(self, fmt, *args):
        return


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Listening on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
