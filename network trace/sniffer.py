import subprocess
import json

cmd = [
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

SENSITIVE_FIELDS = {
    "birth_control": "HIGH",
    "pregnancy_goal": "HIGH",
    "symptom": "MEDIUM",
    "user_id": "LOW",
}

process = subprocess.Popen(
    cmd,
    stdout=subprocess.PIPE,
    stderr=subprocess.DEVNULL,
    text=True,
    bufsize=1
)

for line in process.stdout:
    print("RAW:", repr(line))
    parts = line.strip().split("\t")

    if len(parts) < 3:
        continue

    method, uri, dst, dst_port, host, hex_body = parts

    body = bytes.fromhex(hex_body).decode()

    print("\n=== OBSERVED REQUEST ===")
    print("Method:", method)
    print("Endpoint:", uri)
    print("Destination IP:", dst)
    print("Destination Port:", dst_port)
    print("Host:", host)
    print("Raw body:", body)

    try:
        data = json.loads(body)

        print("\nParsed fields:")
        for key, value in data.items():
            risk = SENSITIVE_FIELDS.get(key, "UNKNOWN")
            print(f"[{risk}] {key}: {value}")

    except json.JSONDecodeError:
        print("Body was not valid JSON")