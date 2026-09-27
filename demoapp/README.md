# Scriptwell

A prescription-savings website for testing a health-data disclosure browser extension. Built with React, TypeScript, Vite, and a small Node HTTP receiver. No real coupons, payments, pharmacies, email, or health services are connected.

## Start

```sh
cd demoapp
npm ci
npm run dev
```

Node 20.12+ required. Visit **http://localhost:5173**. The browser sends analytics directly to the team-controlled **https://fly-analytics.fly.dev/collect** receiver. The local receiver is not needed for this mode. Vite fails instead of silently switching ports. Stop with Ctrl+C.

## Demonstrate

Browse a concern or search a medication, choose a pharmacy, and complete both questionnaire steps using fictional information. Confirm the offer with **Optional analytics sharing** on. The browser POSTs JSON to `https://fly-analytics.fly.dev/collect`. Inspect it with the extension or Chrome DevTools.

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

`npm run preview` serves the production build on 5173. Tests use a temporary loopback port and   fixtures. The optional local receiver does not log form values; its `/health` exposes only an in-memory count. The Fly receiver returns a receipt without logging or retaining the payload. Use fictional inputs only.

See [the integration contract](../docs/demo-contract.md) for origins, complete payload, schema, extension selectors, deployment notes, DevTools steps, and the judge script. This is a demonstration of data disclosure, not a legal determination about HIPAA.

For the complete collector, extension, dashboard, and privacy setup, use [the integrated demo guide](../docs/integrated-demo.md).

## Deploy

The same build is deployed to https://scriptwell.fly.dev as a static nginx container (`Dockerfile`, `nginx.conf`, `fly.toml`). The receiver URL is compiled in from the `VITE_ANALYTICS_URL` build arg in `fly.toml`.

```sh
cd demoapp && flyctl deploy --remote-only
```
