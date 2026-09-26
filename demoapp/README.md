# Scriptwell

A prescription-savings website for testing a health-data disclosure browser extension. Its checkout accepts synthetic demo-card values only. No real coupons, payments, pharmacies, email, or health services are connected.

## Start

```sh
cd demoapp
npm ci
python3 server/bridge.py
```

In another terminal run `cd demoapp && npm run dev`. Node 20.12+ is required. Visit **http://localhost:5173**. The browser sends one analytics event to **http://localhost:4319/collect**; the Python bridge forwards it over plaintext HTTP to the team-controlled Fly receiver. This HTTP path is intentional for the synthetic tshark demonstration.

## Demonstrate

Browse a concern or search a medication, choose a pharmacy, and manually fill the identity and health steps with synthetic information. At **Demo Checkout**, click **Use Demo Card**, then confirm with **Optional analytics sharing** on. The single JSON POST includes the synthetic payment object. No payment request is made.

Turn sharing off using `#analytics-sharing-toggle`, click `#reset-flow-button`, and repeat. The offer still confirms; no analytics event is built or sent. Reset preserves the privacy choice. A fresh profile defaults to on. Only this preference is saved; answers are not persisted. “Sharing details” exposes the destination and last delivery result for troubleshooting.

## Configure

Copy `.env.example` to `.env`. Change the destination with `VITE_ANALYTICS_URL`; configure receiver port/host and allowed origin with `ANALYTICS_PORT`, `ANALYTICS_HOST`, and `ALLOWED_ORIGIN`. `APP_PORT` controls the Vite dev port. Restart after changes and rebuild for deployment.

Change the visible brand in `src/config.ts`. Update medications and illustrative pharmacy offers in `src/catalog.ts`. Payload field names and mapping live in `src/analytics.ts`.

For the offline local receiver, set `VITE_ANALYTICS_URL=http://localhost:4318/v1/events` in `.env`, then run `npm run dev:all`. See [Fly connection notes](../docs/fly-receiver.md) for HTTP packet capture and CORS checks.

## Check

```sh
npm run build
npm test
npm run format:check
```

`npm run preview` serves the production build on 5173. Tests use a temporary loopback port and   fixtures. The optional local receiver does not log form values; its `/health` exposes only an in-memory count. The teammate’s Fly receiver may log the complete payload: use fictional inputs only.

See [the integration contract](../docs/demo-contract.md) for origins, complete payload, schema, extension selectors, deployment notes, DevTools steps, and the judge script. This is a demonstration of data disclosure, not a legal determination about HIPAA.
