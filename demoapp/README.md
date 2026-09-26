# Scriptwell

A fictional prescription-savings website for testing a health-data disclosure browser extension. Built with React, TypeScript, Vite, and a small Node HTTP receiver. No real coupons, payments, pharmacies, email, or health services are connected.

## Start

```sh
cd demoapp
npm ci
npm run dev:all
```

Node 20.12+ required. Visit **http://localhost:5173**. The separate analytics receiver listens on **http://localhost:4318**. Both ports must be free; Vite fails instead of silently switching ports. Stop both with Ctrl+C. Or use `npm run dev` and `npm run dev:analytics` separately.

## Demonstrate

Browse a concern or search a medication, choose a pharmacy, and manually fill both questionnaire steps using fictional information. Confirm the offer with **Optional analytics sharing** on. The browser POSTs JSON to `http://localhost:4318/v1/events`. Inspect it with the extension or Chrome DevTools.

Turn sharing off using `#analytics-sharing-toggle`, click `#reset-flow-button`, and repeat. The offer still confirms; no analytics event is built or sent. Reset preserves the privacy choice. A fresh profile defaults to on. Only this preference is saved; answers are not persisted. “Sharing details” exposes the destination and last delivery result for troubleshooting.

## Configure

Copy `.env.example` to `.env`. Change the destination with `VITE_ANALYTICS_URL`; configure receiver port/host and allowed origin with `ANALYTICS_PORT`, `ANALYTICS_HOST`, and `ALLOWED_ORIGIN`. `APP_PORT` controls the Vite dev port. Restart after changes and rebuild for deployment.

Change the visible brand in `src/config.ts`. Update medications and illustrative pharmacy offers in `src/catalog.ts`. Payload field names and mapping live in `src/analytics.ts`.

## Check

```sh
npm run build
npm test
npm run format:check
```

`npm run preview` serves the production build on 5173; keep the receiver running separately. Tests use a temporary loopback port and fictional fixtures. No form values are logged by the receiver; `/health` exposes only the in-memory accepted-event count.

See [the integration contract](../docs/demo-contract.md) for origins, complete payload, schema, extension selectors, deployment notes, DevTools steps, and the judge script. This is a demonstration of data disclosure, not a legal determination about HIPAA.
