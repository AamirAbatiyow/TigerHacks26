import json
import subprocess
import sys
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
    "-e", "http.file_data",
]


def decode_file_data(field):
    if not field:
        return ""
    cleaned = "".join(field.split()).replace(":", "")
    try:
        return bytes.fromhex(cleaned).decode("utf-8", errors="replace")
    except ValueError:
        return field


def parse_body(text):
    if text is None or text == "":
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


def parse_tshark_line(line):
    # Keep empty columns. strip() would drop leading tabs and shift the fields.
    fields = line.rstrip("\r\n").split("\t")
    if not any(part.strip() for part in fields):
        return None

    while len(fields) < 6:
        fields.append("")

    method, path, destination_ip, destination_port, host = fields[:5]
    file_data = "\t".join(fields[5:])
    if not method:
        return None

    port = int(destination_port) if destination_port.isdigit() else None
    return {
        "source": "tshark",
        "method": method,
        "host": host or None,
        "path": path or None,
        "destination_ip": destination_ip or None,
        "destination_port": port if port is not None else (destination_port or None),
        "body": parse_body(decode_file_data(file_data)),
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
