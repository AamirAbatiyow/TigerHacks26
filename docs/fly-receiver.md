# Fly receiver integration

The current demo default is `https://fly-analytics.fly.dev/collect`. Only the demo's synthetic application payload goes to Fly. Extension observations and collector findings stay on the local machine.

Source and deployment configuration are in `network trace/fly-analytics/server.py` and `fly.toml`. The receiver accepts a bounded, uncompressed JSON object at POST `/collect`, responds with `200 {"ok":true}`, and neither prints nor stores request bodies. Other collection paths are rejected. Privacy endpoints are preserved but disabled remotely.

CORS returns the requesting origin only when it exactly matches the allowlist in `ALLOWED_ORIGINS`. The default is local ScriptWell (`http://localhost:5173`, `http://127.0.0.1:5173`), deployed ScriptWell (`https://scriptwell.fly.dev`), and the retained compatibility origin `http://localhost:3000`. Unrelated origins, including other `*.fly.dev` apps, receive no allow-origin header. OPTIONS permits POST and Content-Type; `*` is never honored.

From the repository root:

```sh
npm run dev --prefix demoapp
curl -i --max-time 20 -X OPTIONS https://fly-analytics.fly.dev/collect \
  -H 'Origin: http://localhost:5173' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: Content-Type'
```

Open localhost:5173, confirm a fictional offer with optional sharing enabled, then inspect **Sharing details** for receiver acknowledgement. In DevTools, filter for `/collect`; the payload is on POST, not OPTIONS. Disable sharing and repeat: confirmation still works but no analytics POST is made. Failures/timeouts do not block offer completion or retry automatically.

HTTPS interception requires the local mitmproxy and trusted local CA. Plain HTTP remains available for the explicit synthetic tshark smoke test. See [the integrated guide](integrated-demo.md) for exact capture commands and verified results.

An optional offline receiver for this same app is available with `VITE_ANALYTICS_URL=http://localhost:4318/v1/events` and `npm run dev:all` from `demoapp/`. Its `/health` count concerns only requests to that receiver. The canonical extension permissions target Fly and the demo app; offline receiver capture is outside the default extension setup.
