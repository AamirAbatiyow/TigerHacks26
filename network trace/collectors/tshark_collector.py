import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from classifier import analyze

# Plaintext HTTP on the Wi-Fi interface. TLS on 443 stays opaque here;
# decrypted HTTPS is observed by collectors/mitm_collector.py instead.
TSHARK_CMD = [
    "tshark",
    "-l",
    "-i", "en0",
    "-Y", "http.request",
    "-T", "fields",
    "-e", "http.request.method",
    "-e", "http.request.uri",
    "-e", "ip.dst",
    "-e", "tcp.dstport",
    "-e", "http.host",
    "-e", "http.content_type",
    "-e", "http.content_encoding",
    "-e", "http.file_data",
]


def decode_file_data(field):
    # Keep bytes. classifier.py decides whether the body is text, JSON, or binary.
    if not field:
        return None
    cleaned = "".join(field.split()).replace(":", "")
    try:
        return bytes.fromhex(cleaned)
    except ValueError:
        return field


def parse_tshark_line(line):
    # Keep empty columns. strip() would drop leading tabs and shift the fields.
    fields = line.rstrip("\r\n").split("\t")
    if not any(part.strip() for part in fields):
        return None

    while len(fields) < 8:
        fields.append("")

    method = fields[0].strip()
    path = fields[1].strip()
    destination_ip = fields[2].strip()
    destination_port = fields[3].strip()
    host = fields[4].strip()
    content_type = fields[5].strip()
    content_encoding = fields[6].strip()
    file_data = "\t".join(fields[7:])
    if not method:
        return None

    port = int(destination_port) if destination_port.isdigit() else None
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "tshark",
        "scheme": "http",
        "method": method,
        "host": host or None,
        "path": path or None,
        "destination_ip": destination_ip or None,
        "destination_port": port if port is not None else (destination_port or None),
        "content_type": content_type or None,
        "content_encoding": content_encoding or None,
        "initiator": None,
        "tab_id": None,
        "third_party": None,
        "request_type": None,
        "body": decode_file_data(file_data),
    }


def main():
    process = subprocess.Popen(
        TSHARK_CMD,
        stdout=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    try:
        if process.stdout is None:
            return
        for line in process.stdout:
            event = parse_tshark_line(line)
            if event is not None:
                analyze(event)
    except KeyboardInterrupt:
        pass
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == "__main__":
    main()
