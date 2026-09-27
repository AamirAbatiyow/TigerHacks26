# Fly receiver integration

The browser sends its real cross-origin JSON POST to **http://localhost:4319/collect**. `demoapp/server/bridge.py` forwards the unchanged body via plaintext HTTP to the team-controlled **http://fly-analytics.fly.dev/collect** receiver. HTTP is deliberate for this synthetic-data tshark demonstration.

## Run

Terminal 1:

```sh
cd demoapp
python3 server/bridge.py
```

Terminal 2:

```sh
cd demoapp
npm ci
npm run dev
```

Open **http://localhost:5173**. If `.env` or `.env.local` exists, remove an old direct-Fly override or set `VITE_ANALYTICS_URL=http://localhost:4319/collect`, then restart Vite.

## Payload and trigger

The final **Confirm my offer** action sends one `offer_confirmed` JSON event containing synthetic contact information, health answers, selected prescription, demo-card values, pharmacy, price, interaction metadata, UUID, and timestamp. The browser serializes the nested object with `JSON.stringify`; the bridge forwards those exact bytes. Demo Checkout itself creates no request, and no payment provider is contacted.

The website does not expose an in-page analytics toggle. Its footer links to `/privacy`, where analytics sharing and the opt-out request contact are disclosed. Nothing in the website persists the questionnaire or demo-card values. Capture tools and receiver logs may retain bodies, so use only synthetic data.

## CORS and verification

The local bridge responds to browser requests with:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

It returns 204 for OPTIONS and 200 after Fly accepts the forwarded POST. Fly deployment files live under `network trace/fly-analytics/`; this checkout change does not modify or redeploy them.

1. Select an offer, manually enter synthetic details, reach Demo Checkout, and click **Use Demo Card**. Open Chrome Network with Preserve log and filter `collect`.
2. Click **Confirm my offer**. Inspect the POST to localhost:4319, its payment object, and successful response. OPTIONS is the preflight, not the sensitive-looking disclosure.
3. The teammate can run `flyctl logs -a fly-analytics` to verify `Path: /collect` and the body.
4. Analytics failure or the five-second timeout does not block confirmation; there are no automatic retries.

The exact event structure is documented in [the contract](./demo-contract.md) and [JSON schema](./demo-event.schema.json).

## Packet capture

Run this manually on the interface carrying the Fly-bound traffic:

```sh
sudo tshark -i en0 -Y 'http.request.method == "POST"'
```

The agent does not run sudo commands. Because the payload is intentionally plaintext, the synthetic `payment` object can appear in the capture. Never use this setup with real personal, health, or card information.
