import json
from urllib.parse import urlsplit

COMPRESSED_ENCODINGS = {"gzip", "x-gzip", "br", "deflate", "zstd", "compress", "x-compress"}
BINARY_TYPES = {
    "application/octet-stream",
    "application/protobuf",
    "application/x-protobuf",
    "application/grpc",
    "application/zip",
    "application/gzip",
    "application/pdf",
}
BINARY_PREFIXES = ("image/", "audio/", "video/", "font/")
COMPRESSED_MAGIC = (b"\x1f\x8b", b"\x28\xb5\x2f\xfd")


def host_port(value):
    """Split a Host-style value like 'localhost:5173'. Port is None when absent."""
    if not isinstance(value, str) or not value.strip():
        return None, None
    if value.strip() == "::1":
        return "::1", None
    try:
        parts = urlsplit("//" + value.strip())
        port = parts.port
    except ValueError:
        return None, None
    host = (parts.hostname or "").rstrip(".") or None
    return host, port


def origin_host_port(value):
    """Split an origin/initiator like 'http://localhost:5173/page'. Fills the default port."""
    if not isinstance(value, str) or not value.strip() or value.strip() == "null":
        return None, None
    text = value.strip()
    if "://" not in text:
        text = "http://" + text
    try:
        parts = urlsplit(text)
        port = parts.port
    except ValueError:
        return None, None
    host = (parts.hostname or "").rstrip(".") or None
    if port is None:
        port = {"http": 80, "https": 443}.get(parts.scheme)
    return host, port


def _port(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


# Keep PatientPrivy's local services out of the stream, while allowing observed
# traffic from any website. Simple-view noise suppression remains in the UI.
def is_demo_relevant(event):
    if not isinstance(event, dict):
        return False

    host, explicit_port = host_port(event.get("host"))
    if host in {"localhost", "127.0.0.1", "::1"} and (explicit_port or _port(event.get("destination_port"))) in {8765, 8080, 5174}:
        return False
    return True


def _encoded_size(value):
    try:
        return len(json.dumps(value, ensure_ascii=False).encode("utf-8"))
    except (TypeError, ValueError):
        return None


# Privacy/readability boundary:
# Never persist raw compressed or binary request bodies. The classifier cannot
# read them, and decoding them as text fills events.jsonl with escaped garbage.
# Returns (body, body_size, body_type).
def sanitize_body(raw, content_type=None, content_encoding=None):
    if raw is None:
        return None, None, None
    if isinstance(raw, (dict, list)):
        return raw, _encoded_size(raw), "json"

    if isinstance(raw, str):
        data = raw.encode("utf-8", errors="surrogatepass")
    elif isinstance(raw, (bytes, bytearray)):
        data = bytes(raw)
    else:
        return None, None, None

    size = len(data)
    if size == 0:
        return None, 0, "empty"

    encodings = {
        token.strip().lower()
        for token in str(content_encoding or "").split(",")
        if token.strip()
    }
    if encodings - {"identity"} or data.startswith(COMPRESSED_MAGIC):
        return None, size, "compressed"

    media_type = str(content_type or "").split(";", 1)[0].strip().lower()
    if (
        media_type in BINARY_TYPES
        or media_type.startswith(BINARY_PREFIXES)
        or "protobuf" in media_type
        or "grpc" in media_type
    ):
        return None, size, "binary"

    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return None, size, "binary"
    if any(ord(char) < 32 and char not in "\t\n\r" for char in text):
        return None, size, "binary"

    try:
        parsed = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return text, size, "text"
    if isinstance(parsed, (dict, list)):
        return parsed, size, "json"
    return text, size, "text"
