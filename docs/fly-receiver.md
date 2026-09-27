# Fly receiver integration

The current demo default is `https://fly-analytics.fly.dev/collect`. The browser POSTs one synthetic `offer_confirmed` event there directly. Only that application payload goes to Fly. Extension observations and collector findings stay on the local machine.

The event contains synthetic contact information, health answers, the selected prescription, demo-card values, pharmacy, price, interaction metadata, a UUID, and a timestamp. Demo Checkout itself creates no request, and no payment provider is contacted. The card number in the payload is test data, never a charge.

The website does not expose an in-page analytics toggle. Its footer links to `/privacy`, where analytics sharing and the opt-out request contact are disclosed. Nothing in the website persists the questionnaire or demo-card values. Capture tools may retain bodies, so use only synthetic data.

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

Open `http://localhost:5173`. If `.env` or `.env.local` exists, remove an old destination override or set `VITE_ANALYTICS_URL=https://fly-analytics.fly.dev/collect`, then restart Vite. Reach Demo Checkout, click **Use Demo Card**, and confirm the offer. In DevTools, filter for `/collect`; the payload, including `payment`, is on POST, not OPTIONS. Failures and the five-second timeout do not block offer completion or retry automatically.

HTTPS interception requires the local mitmproxy and trusted local CA. Plain HTTP remains available for the explicit synthetic tshark smoke test. See [the integrated guide](integrated-demo.md) for exact capture commands and verified results.

1. Select an offer and review the prefilled synthetic details through Demo Checkout. Open Chrome Network with Preserve log and filter `collect`.
2. Click **Confirm my offer**. Inspect the POST to localhost:4319, its payment object, and successful response. OPTIONS is the preflight, not the sensitive-looking disclosure.
3. The teammate can run `flyctl logs -a fly-analytics` to verify `Path: /collect` and the body.
4. Analytics failure or the five-second timeout does not block confirmation; there are no automatic retries.

The exact event structure is documented in [the contract](./demo-contract.md) and [JSON schema](./demo-event.schema.json).
