"""One-time download of the local semantic encoder (about 23 MB). Inference never uses the network."""
import hashlib
import sys
import urllib.request

from semantic_classifier import MODEL_DIR, MODEL_NAME

REVISION = "1110a243fdf4706b3f48f1d95db1a4f5529b4d41"
FILES = {
    "onnx/model_qint8_arm64.onnx": "4278337fd0ff3c68bfb6291042cad8ab363e1d9fbc43dcb499fe91c871902474",
    "vocab.txt": "07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3",
}


def main():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    for remote, expected in FILES.items():
        target = MODEL_DIR / remote.rsplit("/", 1)[-1]
        if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == expected:
            print(f"ok       {target.name}")
            continue
        url = f"https://huggingface.co/{MODEL_NAME}/resolve/{REVISION}/{remote}"
        data = urllib.request.urlopen(url, timeout=120).read()
        if hashlib.sha256(data).hexdigest() != expected:
            sys.exit(f"Checksum mismatch for {remote}; not saved")
        target.write_bytes(data)
        print(f"fetched  {target.name} ({len(data) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
