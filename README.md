# PatientPrivy

PatientPrivy shows where health-related information from a website goes, then lets you review and send a privacy request. The demo site is [ScriptWell](https://scriptwell.fly.dev), a fictional prescription-savings app. ScriptWell sends a synthetic checkout payload to a team-controlled receiver. PatientPrivy watches that disclosure on this machine and never sends observations, findings, or email drafts off the computer.

This is a demonstration of data disclosure, not a medical service and not a legal determination about HIPAA.

## What you see

1. Open ScriptWell and confirm a fictional offer. The site POSTs that payload to `https://fly-analytics.fly.dev/collect`. The receiver returns a receipt and does not keep the body.
2. The Chrome extension records request metadata only. With the local HTTPS proxy running, mitmproxy decrypts the same request and the shared classifier labels sensitive fields.
3. The dashboard at `http://127.0.0.1:5174` groups those fields into privacy issues. The technical view still lists every raw finding.
4. **Take Privacy Action** drafts a letter you can edit. Sending uses Gmail or your email app only after you approve the message. For the ScriptWell demo, that letter is addressed to ScriptWell.

## Layout

| Path | Role |
|---|---|
| `demoapp/` | ScriptWell. Local dev on port 5173, or the deployed site. |
| `extension/` | Unpacked Chrome extension. The report view is built from `frontend/`. |
| `frontend/` | Dashboard source (simple flow and technical network). |
| `network trace/` | Local API, classifier, collectors, event log, and privacy-request drafts. |
| `docs/` | Setup, receiver contract, and privacy-action details. |

Classification runs only in the local API. The extension does not classify, and it does not read request bodies.

## Run the demo

One-time setup from the repository root. You need Python 3.10+, Node 22.12+, mitmproxy, tshark, and Chrome. Trust mitmproxy’s local CA before the first capture. The launcher does not install that certificate.

```sh
npm ci --prefix frontend
npm run build:extension --prefix frontend
```

Optional on-device semantic model (rules still run without it):

```sh
python3 'network trace/fetch_semantic_model.py'
```

Load `extension/` in Chrome at `chrome://extensions` (Developer mode → Load unpacked). Remove any older **Local Request Observer** so observations are not duplicated.

Then start the local services:

```sh
./start_demo.sh
```

The script starts the local API (`127.0.0.1:8765`), mitmproxy (`127.0.0.1:18080`), tshark, and the dashboard. It points the macOS secure web proxy at mitmproxy and restores the previous proxy settings when you stop it with Ctrl-C. It does not start ScriptWell. Open [https://scriptwell.fly.dev](https://scriptwell.fly.dev), use fictional answers, click **Use Demo Card**, and confirm the offer. Reload the extension after rebuilding `extension/visualization/`.

Gmail sending is optional and local. See [docs/integrated-demo.md](docs/integrated-demo.md) for the OAuth client, proxy requirements, a local ScriptWell terminal, and manual startup without the launcher.

## Tests

```sh
python3 -m unittest discover -s 'network trace/tests' -v
npm test --prefix frontend
npm test --prefix demoapp
node --test extension/tests/*.test.mjs
```

## More detail

- [Integrated demo](docs/integrated-demo.md) — collectors, proxy, deployed ScriptWell, and verification.
- [Privacy actions](docs/privacy-actions.md) — draft review, Gmail, and mailto.
- [ScriptWell](demoapp/README.md), [dashboard](frontend/README.md), and [extension](extension/README.md).
