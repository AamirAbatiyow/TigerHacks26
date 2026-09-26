from http.server import BaseHTTPRequestHandler, HTTPServer
import urllib.request


FLY_URL = "http://fly-analytics.fly.dev/collect"


class Handler(BaseHTTPRequestHandler):

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)

        request = urllib.request.Request(
            FLY_URL,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({})
        )

        try:
            with opener.open(request, timeout=10) as response:
                result = response.read()

            self.send_response(200)
            self.cors()
            self.end_headers()
            self.wfile.write(result)

        except Exception as e:
            print("Forwarding failed:", e)

            self.send_response(502)
            self.cors()
            self.end_headers()
            self.wfile.write(b"Forwarding failed")


print("Bridge listening on http://localhost:4319")
HTTPServer(("127.0.0.1", 4319), Handler).serve_forever()
