from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers["Content-Length"])
        body = self.rfile.read(length)

        print("\nReceived:")
        print(body.decode())

        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"OK")


HTTPServer(("127.0.0.1", 8000), Handler).serve_forever()