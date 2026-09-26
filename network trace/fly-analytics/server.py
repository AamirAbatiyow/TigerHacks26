import os
from http.server import BaseHTTPRequestHandler, HTTPServer

# Local demo page only. Observability events from the extension do not come here.
ALLOWED_ORIGIN = "http://localhost:3000"


class Handler(BaseHTTPRequestHandler):
    def _cors_headers(self):
        if self.headers.get("Origin") == ALLOWED_ORIGIN:
            self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)

        print("\n=== RECEIVED ===", flush=True)
        print("Path:", self.path, flush=True)
        print("From:", self.client_address, flush=True)
        print("Body:", body.decode(), flush=True)

        self.send_response(200)
        self._cors_headers()
        self.end_headers()
        self.wfile.write(b"OK")


port = int(os.environ.get("PORT", "8080"))

print(f"Listening on 0.0.0.0:{port}", flush=True)
HTTPServer(("0.0.0.0", port), Handler).serve_forever()
