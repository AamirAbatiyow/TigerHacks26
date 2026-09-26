# Fly receiver integration

The current default destination is **http://fly-analytics.fly.dev/collect**. The localhost website sends a real cross-origin JSON POST directly to this team-controlled receiver. HTTP is deliberate for this fictional-data tshark demonstration. No proxy or HTTPS rewrite is used by the app.

## Run

```sh
cd demoapp
npm ci
npm run dev
```

Open **http://localhost:5173**. No local analytics server is required. If you already created `.env` or `.env.local`, remove an old `VITE_ANALYTICS_URL` override or set it to the Fly URL, then restart Vite. The default is in `src/analytics.ts`; `.env.example` documents the override. Rebuild if using `npm run preview`.

## Payload and trigger

The final **Confirm my offer** action sends the existing detailed JSON event, with contact information, weight, health concern, symptoms, duration, medications, allergies, selected prescription, pharmacy, price, interaction metadata, UUID, and timestamp. These are nested objects, serialized with `JSON.stringify` and sent with `Content-Type: application/json`, CORS mode, and omitted credentials. No unentered birth-control, pregnancy, or other health answers are fabricated. The complete schema and sample are in [the contract](./demo-contract.md) and [JSON schema](./demo-event.schema.json).

The stable checkbox remains `#analytics-sharing-toggle`. Off skips event construction and fetch entirely; the confirmation still works. `#reset-flow-button` clears the flow while retaining that preference. Nothing in the website persists the questionnaire. The Fly receiver described by the team prints entire bodies to its logs, so those values can be retained externally: use only fictional data. This differs from the optional local receiver, which discards values without logging them.

## CORS and verification

The deployed service must respond to OPTIONS and POST with:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

An exact `http://localhost:5173` allow-origin also works. The browser does not send credentials. The service already returned a successful HTTP 204 OPTIONS response with the headers above during integration. There is no Fly `server.py` or `fly.toml` in this repository; no remote deployment was performed here.

1. Enable sharing, select an offer, and manually enter fictional details. Open Chrome Network with Preserve log and filter `collect`.
2. Click Confirm my offer. Inspect the POST URL, JSON request payload, and successful response. OPTIONS is the preflight, not the health disclosure. The sharing-details panel reports acknowledgement only after a successful HTTP response.
3. The teammate can run `flyctl logs -a fly-analytics` to verify `Path: /collect` and the body. With HTTP the sniffer can inspect JSON on the network path. Do not point a hosted HTTPS frontend at this HTTP URL; browsers will block mixed content.
4. Turn sharing off, reset, and manually repeat. Confirmation must still appear without another POST. Earlier requests in Preserve log remain visible.
5. Analytics failure or the five-second timeout does not block confirmation; there are no automatic retries.

## Offline fallback

Set `VITE_ANALYTICS_URL=http://localhost:4318/v1/events` in `demoapp/.env`, then run `npm run dev:all`. The local receiver uses the existing contract and aggregate `/health` counter. That counter does not track requests sent to Fly.

## Integration check results

- The deployed HTTP endpoint returned **204** to the localhost CORS preflight, with the required allow-origin/method/header values.
- A direct HTTP POST containing explicitly fictional nested data and a symptoms array returned **200 OK**, body `OK`, with the same CORS headers.
- Production build and all **5** regression tests passed. The new transport regression checks the Fly default URL, serialized JSON, request method, opt-out suppression, and failure handling.
- **End-to-end browser delivery is not yet confirmed.** Form submissions in the available in-app browser and Safari produced the first-party confirmation but reported analytics delivery failure. Diagnostic fetch output was `TypeError: Failed to fetch`; removing the fetch cache option did not resolve it, so the original option was retained. No receiver deployment or browser security setting was changed.
- Complete the Chrome Network and teammate `flyctl logs -a fly-analytics` checks above in the intended presentation environment before relying on this integration. The successful command-line POST alone does not establish successful browser delivery or extension detection.
