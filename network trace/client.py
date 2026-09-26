import json
import ssl
import sys
import urllib.request
from pathlib import Path

HTTP_URL = "http://fly-analytics.fly.dev/collect"
HTTPS_URL = "https://fly-analytics.fly.dev/collect"
PROXY = "http://127.0.0.1:8081"
MITM_CA = Path.home() / ".mitmproxy" / "mitmproxy-ca-cert.pem"

PAYLOAD = {
    "user_id": "12345",
    "birth_control": "IUD",
    "pregnancy_goal": "trying_to_conceive",
    "symptom": "nausea",
}


def post(url, opener):
    request = urllib.request.Request(
        url,
        data=json.dumps(PAYLOAD).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with opener.open(request, timeout=20) as response:
        print(response.read().decode())


def http_opener():
    # Direct connection, ignoring shell proxy variables, so tshark sees plaintext HTTP on en0.
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))


def https_opener():
    # Send only this client through the local proxy. Verification stays enabled;
    # Homebrew Python does not read the macOS keychain, so trust the mitmproxy CA file.
    if not MITM_CA.is_file():
        raise SystemExit(f"Missing mitmproxy CA: {MITM_CA}")
    context = ssl.create_default_context()
    context.load_verify_locations(cafile=str(MITM_CA))
    proxy = urllib.request.ProxyHandler({"http": PROXY, "https": PROXY})
    return urllib.request.build_opener(proxy, urllib.request.HTTPSHandler(context=context))


def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    mode = args[0] if args else "http"
    if mode == "http":
        post(HTTP_URL, http_opener())
    elif mode == "https":
        post(HTTPS_URL, https_opener())
    else:
        raise SystemExit("usage: python client.py [http|https]")


if __name__ == "__main__":
    main()
