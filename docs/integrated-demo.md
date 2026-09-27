# Integrated HealthTrace demo

## Canonical layout

- `extension/`: the only unpacked MV3 extension, retaining the teammate popup and UX.
- `frontend/`: the single dashboard source; `extension/visualization/` is its generated production bundle, not an independent UI.
- `demoapp/`: the only demo health app, ScriptWell. It runs locally on `http://localhost:5173` and is deployed to `https://scriptwell.fly.dev` from the same code.
- `network trace/`: shared classifier, collectors, event store, local API, and Fly receiver.

The canonical extension contains the migrated observer: metadata normalization, request headers, initiator/tab attribution, third-party flag, local-only POST, and localhost recursion prevention. It registers one listener with demo-specific URL permissions. No classification is duplicated in JavaScript.

## Real flow

1. ScriptWell (`demoapp`, local or deployed) builds a synthetic prescription offer and POSTs it to `https://fly-analytics.fly.dev/collect` when optional sharing is enabled.
2. The MV3 HealthTrace observer records request metadata and POSTs only to `http://127.0.0.1:8765/events`. It does not read request bodies, perform classification, or send observations to Fly. Its host permissions cover the demo/Fly destinations and the local API; it skips its own API requests.
3. With the browser configured to use mitmproxy, the HTTPS request is decrypted locally. The response hook normalizes it and POSTs it (raw body base64-encoded) to `http://127.0.0.1:8765/events` with `source: "mitm"`. For plaintext HTTP, tshark parses the on-wire body and POSTs it the same way with `source: "tshark"`. Collectors are standard-library only (`collectors/local_sink.py`): they never classify, load the model, or write the event log, and they never forward requests to the local API itself.
4. The local API is the single ingestion path for all three sources (`process_event`). Requests with a browser `Origin` are always treated as metadata-only extension events. It runs the shared classifier, which filters demo traffic, sanitizes bodies, normalizes the event, generates an observation UUID, and appends it to local JSONL. Binary/compressed bodies remain absent; size/type metadata is retained.
5. GET `/events` returns the latest 500 observations. Existing captures receive stable legacy IDs and are reclassified in memory without rewriting the historical log. Incomplete lines are ignored. The dashboard on port 5174, its extension bundle, and popup read this local API. Browser metadata and collector payload observations are separate records, not deduplicated requests.
6. A local provider adapts classified observations to the existing privacy engine and SQLite result store. It copies categories and destination metadata, not raw values or contact details. No state of residence or corporate identity is inferred. Fly has no configured verified strategy, so its findings are correctly unsupported. Processing records the unsupported result locally and submits nothing.

The remote receiver accepts only `/collect` POSTs, returns `{"ok":true}`, and does not log or retain payload bodies. Its privacy endpoints remain present and disabled remotely. `/collect` CORS permits exactly the origins in `ALLOWED_ORIGINS` (default: `http://localhost:5173`, `http://127.0.0.1:5173`, `https://scriptwell.fly.dev`, and the legacy `http://localhost:3000`); `*` is never honored. The local event API permits the dashboard's port 5174 origins and Chrome extension origins, checks the loopback Host, and rejects unrelated web origins.

## ScriptWell environments

**ScriptWell may be remote. The privacy observability pipeline remains local.** Both modes use the same ScriptWell build, extension, dashboard, classifier, event schema, and receiver; only configuration differs. The deployed site sends only its synthetic health payload to the Fly receiver. Extension metadata, mitmproxy/tshark captures, classifier output, the event log, and privacy results never leave this machine.

| Variable | Used by | Default | Purpose |
|---|---|---|---|
| `VITE_ANALYTICS_URL` | ScriptWell build (`demoapp/src/analytics.ts`) | `https://fly-analytics.fly.dev/collect` | Where ScriptWell POSTs the synthetic payload. Production sets it in `demoapp/fly.toml` build args. |
| `SCRIPTWELL_ORIGINS` | Local classifier/filter (`network trace/demo_config.py`) | `http://localhost:5173,http://127.0.0.1:5173,https://scriptwell.fly.dev` | Exact origins treated as ScriptWell for filtering and the `ScriptWell` label. |
| `SCRIPTWELL_RECEIVER_HOSTS` | Local classifier/filter | `fly-analytics.fly.dev` | Synthetic-data receiver hosts that are always demo-relevant. |
| `ALLOWED_ORIGINS` | Fly receiver (`network trace/fly-analytics/server.py`) | ScriptWell origins plus legacy `http://localhost:3000` | Exact CORS allowlist for `/collect`. |

Origins match exactly on scheme, host, and port. Other `*.fly.dev` apps are not ScriptWell. The extension cannot read environment variables, so its ScriptWell origins live in `extension/background.js` and `manifest.json`; `network trace/tests/test_scriptwell_origins.py` fails if they drift from `SCRIPTWELL_ORIGINS` or the receiver allowlist. If the deployed hostname changes, update `demo_config.py`, the receiver default (or its `ALLOWED_ORIGINS`), `extension/background.js`, and `manifest.json`; then reload the extension and redeploy the receiver.

## One-command startup (deployed ScriptWell)

After the one-time setup below (`npm ci --prefix frontend`, the extension build, and optionally the semantic model), start every local service from the repository root:

```sh
./start_demo.sh
```

It checks for `python3`, `mitmdump`, `tshark`, `npm`, `curl`, `lsof`, and `networksetup`, and refuses to start if port 8765, 18080, or 5174 is already in use. It starts the local API first and waits for it, then mitmproxy on `127.0.0.1:18080`, the tshark collector on `en0`, and the dashboard on `http://localhost:5174`. It does not start ScriptWell; open `https://scriptwell.fly.dev`. If any service exits, the script names it and stops the others. Ctrl-C stops everything it started, including tshark and Vite child processes, and nothing else.

The launcher also manages the macOS secure (HTTPS) web proxy, so there is no manual proxy step. It saves the current secure-proxy settings for the network service behind the default route (override with `PROXY_SERVICE=Wi-Fi ./start_demo.sh`). Once mitmproxy is listening it sets the secure proxy to `127.0.0.1:18080` and prints `Secure proxy: enabled -> 127.0.0.1:18080`. On Ctrl-C, SIGTERM, a startup failure, or a service exiting, it restores the exact previous settings and prints `Secure proxy: restored previous state`. The HTTP web proxy must be off: the launcher refuses to start if it is on, and it also refuses an authenticated secure proxy, whose credentials it cannot restore. While the demo runs, every app's HTTPS goes through mitmproxy. The existing mitmproxy CA trust is required and is not modified.

Manual prerequisite: load the repository's `extension/` directory as an unpacked extension in Chrome, as described below.

## Local ScriptWell (commands from repository root, separate terminals)

Requires Python 3.10+, Node 22.12+ for the dashboard toolchain, mitmproxy, tshark, and Chrome.

```sh
npm ci --prefix demoapp
npm ci --prefix frontend
npm run build:extension --prefix frontend
```

Optional semantic layer: fetch the local encoder once (about 23 MB, checksum-verified, gitignored). Without it, or with `HEALTHTRACE_SEMANTIC=0`, classification uses rules only. Inference is on-device and runs only in the local API process, which loads the model once at startup and needs `numpy` and `onnxruntime`. mitmdump and the tshark collector need neither. Start the local API before the collectors.

```sh
python3 'network trace/fetch_semantic_model.py'
```

```sh
python3 'network trace/local_api.py'
```

```sh
mitmdump --listen-host 127.0.0.1 --listen-port 18080 -s 'network trace/collectors/mitm_collector.py'
```

```sh
TSHARK_INTERFACE=en0 python3 'network trace/collectors/tshark_collector.py'
```

```sh
npm run dev --prefix demoapp
```

```sh
npm run dev --prefix frontend
```

Load the repository's **extension/** directory as an unpacked MV3 extension in Chrome. Remove any previously installed **Local Request Observer** from Chrome to avoid duplicate observations; deleting its source does not uninstall an already loaded copy. The extension's report button opens the rebuilt bundled dashboard; the standalone dashboard is `http://127.0.0.1:5174`.

`./start_demo.sh` routes HTTPS through mitmproxy and restores the proxy on exit; if you start services by hand instead, the secure web proxy must point at `127.0.0.1:18080` while mitmdump runs. Complete mitmproxy's local CA trust setup if not already installed; do not bypass certificate warnings. The extension does not change proxy settings or install a CA.

Open `http://localhost:5173`, choose Sertraline and a pharmacy, keep all information fictional, select pharmacy preference and duration, and confirm the offer. Sharing details should show an acknowledged request. The dashboard should show browser metadata plus mitm findings. Disable optional sharing and repeat: the offer still completes but no new analytics disclosure is sent.

For a plaintext HTTP capture without changing the demo default:

```sh
curl --max-time 20 -H 'Origin: http://localhost:5173' \
  -H 'Content-Type: application/json' \
  --data-binary @'network trace/tests/demo-payload.json' \
  http://fly-analytics.fly.dev/collect
```

For a deterministic HTTPS smoke test with the existing local CA:

```sh
curl --max-time 20 --proxy http://127.0.0.1:18080 \
  --cacert "$HOME/.mitmproxy/mitmproxy-ca-cert.pem" \
  -H 'Origin: http://localhost:5173' -H 'Content-Type: application/json' \
  --data-binary @'network trace/tests/demo-payload.json' \
  https://fly-analytics.fly.dev/collect
```

`tshark -D` lists interface names; use the actual outbound interface (lo0 for loopback). Packet capture permissions may be required. Fly keeps HTTP available solely for this synthetic test. The optional Node receiver remains a transport test utility for the same demo app and is not used by the integrated default.

For an isolated fresh session, set the same `HEALTHTRACE_EVENTS_PATH` to a new local JSONL path in **all three Python/collector terminals**. Otherwise all use `network trace/events.jsonl`. Stop processes with Ctrl+C. Privacy results are stored in ignored `network trace/privacy.sqlite3`.

## Deployed ScriptWell

- Fly app: `scriptwell` (static nginx container, `demoapp/Dockerfile`, `demoapp/fly.toml`, internal port 8080, HTTPS forced, `/healthz` check).
- URL: `https://scriptwell.fly.dev`
- Receiver: unchanged Fly app `fly-analytics` at `https://fly-analytics.fly.dev/collect`.

Deploy or redeploy ScriptWell (the receiver URL is compiled in from `demoapp/fly.toml` build args):

```sh
cd demoapp && flyctl deploy --remote-only
flyctl status -a scriptwell
```

Redeploy the receiver after changing its CORS allowlist. To override the default without a code change, set `ALLOWED_ORIGINS` (exact origins, comma-separated) as an environment variable first:

```sh
cd 'network trace/fly-analytics' && flyctl deploy --remote-only
# optional: flyctl secrets set -a fly-analytics ALLOWED_ORIGINS='http://localhost:5173,http://127.0.0.1:5173,https://scriptwell.fly.dev'
```

To observe the deployed site, run `./start_demo.sh` with the extension loaded. `npm run dev --prefix demoapp` is not needed. Do not add `scriptwell.fly.dev` or `fly-analytics.fly.dev` to the proxy bypass list. Open `https://scriptwell.fly.dev` and complete the same fictional flow. The extension observes it through its `https://scriptwell.fly.dev/*` host permission and still posts only to `127.0.0.1:8765`. mitmproxy decrypts it with the existing local CA, and the classifier labels it `From: ScriptWell (scriptwell.fly.dev:443)` with `third_party: true`. Deployed traffic is HTTPS-only, so tshark does not see its body; the plaintext curl test above remains the tshark path. The deployed site cannot read the local API: that API accepts only the dashboard and extension origins.

## Classifier and changed files

- `network trace/classifier.py`: recursive scalar leaves including primitive arrays and dotted/bracketed paths; camel/snake/kebab/acronym token normalization; plural/alias rules; boundary-aware path matching; email/phone value signatures; category, severity, and original value retained. Vocabulary covers identity/contact, reproduction, symptoms, mental health, medication, diagnoses, insurance, location, device identifiers, vitals, sexual health, substances, and providers/appointments. Specific categories take precedence over broader contexts; heuristic coverage is not universal natural-language understanding. Findings also carry `confidence`, `detection_method` (`rule`, `semantic`, `rule+semantic`), and `reason`.
- `network trace/semantic_classifier.py`: optional on-device layer. all-MiniLM-L6-v2 (int8 ONNX) embeds a normalized path/value string and compares it to cached category prototypes, with benign-field rejection and conservative thresholds. Rules always win on conflict (the semantic guess is kept as `semantic_candidate`); semantics fills gaps and boosts agreeing rules. `benchmark_semantic.py` reports load time, latency, and memory.
- `network trace/demo_config.py`: single source of ScriptWell origins and receiver hosts for the local pipeline.
- `network trace/event_filters.py`, `event_store.py`, `local_api.py`, new `live_privacy.py`: ScriptWell/receiver filtering, recursion exclusions, normalized local reads, local privacy provider, and unified API.
- `network trace/collectors/tshark_collector.py`: configurable capture interface; existing parsing preserved. It and `mitm_collector.py` forward events through `collectors/local_sink.py` instead of calling the classifier.
- `network trace/fly-analytics/server.py`, `privacy/contract.py`: restrictive CORS, bounded JSON receipt handling, preserved privacy routes, explicit unknown residency supported.
- `frontend/src/App.jsx`, `components/PrivacyPanel.jsx`, `components/NetworkScene.jsx`, new `data/liveEvents.js`, `vite.config.js`: polling and connection/empty states, presentation mapping from canonical events, real privacy findings, separate UI port, consistent app label.
- Removed the mock graph source, playback timer, and fixed popup count. Rebuilt `extension/visualization/` so its compiled JS no longer contains the mock network graph.
- `extension/background.js`, manifest, popup HTML/JS, and privacy loader: integrated MV3 observer, local API reads, real count, retained existing privacy actions.
- `demoapp/src/analytics.ts`, `Intake.tsx`, `.env.example`: HTTPS default, fictional sample answers, synthetic-input notice. Existing privacy toggle remains authoritative.
- Tests under `network trace/tests/`, `extension/tests/`, and `demoapp/tests/`; README/contract pointers and this guide; `.gitignore` excludes local privacy results.

## Verification (2026-09-26)

Baseline: all 13 privacy and 8 extension tests passed. After installing missing dependencies, the pre-existing demo suite had one stale URL assertion (expected Fly HTTP, implementation used a local receiver). Updated it to the integrated HTTPS default.

Final results: 13 privacy tests, 6 pipeline tests, 5 demo tests, and 11 extension/dashboard tests pass (35 total). Frontend lint, standalone and extension dashboard builds, demoapp build, and extension JavaScript syntax checks pass. Vite reports the existing large 3D bundle size as a warning.

Final commands:

```sh
(cd 'network trace/fly-analytics' && python3 -m unittest discover -s tests -v)
python3 -m unittest discover -s 'network trace/tests' -v
npm test --prefix demoapp
node --test extension/tests/*.test.mjs
npm run lint --prefix frontend
npm run build --prefix demoapp
npm run build:extension --prefix frontend
```

The classifier fixture is generated from the actual `createOfferEvent` implementation, not a separately invented payload. Regenerate after payload changes:

```sh
(cd demoapp && node --import tsx tests/export-payload.ts)
```

Live validation used a separate `/tmp/healthtrace-validation.jsonl`: actual HTTPS through mitmproxy and HTTP through tshark each produced 17 findings; the real demo UI confirmed Fly acknowledgement; the dashboard rendered those captured values; the privacy panel displayed the real unsupported findings. A Node harness ran the actual extension observer and verified a successful POST into the running local API. The Fly CORS change was deployed and verified: localhost:5173 allowed, an unrelated origin received no allow-origin header.

Remaining manual verification: loading/reloading HealthTrace in Chrome and sending a browser request with the proxy enabled. Chrome was unavailable through the connected browser automation; the in-app browser validated the demo and dashboard but does not run this unpacked extension. Proxy/CA configuration was not changed on the user's machine. There is no verified Fly opt-out mechanism, no automatic opt-out submission, and no cross-collector request deduplication. The API shows a bounded recent window, not a complete historical query interface.


## Deployment verification (2026-09-26)

ScriptWell was deployed to `https://scriptwell.fly.dev` and the receiver redeployed with the ScriptWell allowlist. Page and assets load over HTTPS, HTTP redirects to HTTPS, and receiver preflights allow exactly localhost:5173, 127.0.0.1:5173, and the deployed origin. `https://other-app.fly.dev` and `http://scriptwell.fly.dev` get no allow-origin header. The receiver logs contained no payload values. Headless Chrome, using a throwaway profile proxied through a temporary mitmdump with the keychain-trusted CA and no certificate flags, completed the deployed form: status `sent`. mitmproxy classified the POST as `From: ScriptWell (scriptwell.fly.dev:443)`, third party, 17 findings. The local API served it, and the privacy preview contained no synthetic PII. Only ScriptWell and receiver hosts were stored. The same form also submitted from `npm run dev --prefix demoapp` at localhost:5173. Loading the unpacked extension in real Chrome against the deployed site remains a manual check.

## Consolidation verification

The deprecated observer and bare-bones demo directories have been removed. The unused
forwarding bridge and obsolete validation report were removed too. The capture smoke
client now uses the current demo-builder fixture and port 18080; the unused frontend
privacy proxy was removed because every dashboard uses the local API directly.
Legacy port 3000 was removed from observation permissions and filtering; Fly's CORS
compatibility origin remains, alongside the required 5173 origins.

A package regression check validates MV3, the worker/popup/icons, generated dashboard
asset paths, and the absence of duplicate/deprecated directories. The observer test
checks exactly one listener, matching manifest filters, and recursion prevention for
localhost, IPv4, and IPv6 loopback. All 35 tests pass. A live Fly OPTIONS request was
rechecked after consolidation and explicitly allowed `http://localhost:5173`.
No collector, classifier, schema, privacy-engine behavior, or teammate UI was rewritten.
