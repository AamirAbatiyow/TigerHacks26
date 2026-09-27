# Synthetic demo payload contract

The only demo health app is ScriptWell in `demoapp/`, running at `http://localhost:5173` and deployed at `https://scriptwell.fly.dev`. The complete pipeline and startup commands are in [integrated-demo.md](integrated-demo.md).

## Payload and delivery

`demoapp/src/analytics.ts` is the authoritative payload builder. [demo-event.schema.json](demo-event.schema.json) describes the synthetic application payload; it is not a second observability event schema. The shared observation envelope is normalized by `network trace/classifier.py` and consumed unchanged by the local API and dashboard.

The demo payload contains `schema_version`, `event_name`, a submission UUID, `occurred_at`, application source, person, health, prescription, payment, offer, interaction, and privacy objects. `payment` holds synthetic test-card values used only to demonstrate disclosure. The card number is serialized without spaces. It is never sent to a payment processor, and no authorization, charge, reservation, or purchase occurs. The classifier fixture at `network trace/tests/demo-payload.json` is exported from the actual builder:

```sh
(cd demoapp && node --import tsx tests/export-payload.ts)
```

The final valid `#offer-intake-form` submission via `#confirm-offer-button` sends JSON to `https://fly-analytics.fly.dev/collect`, using POST, `Content-Type: application/json`, CORS mode, omitted credentials, and no-referrer policy. Searching, typing, pharmacy selection, and the earlier questionnaire steps do not send analytics. **Use Demo Card** (`#use-demo-card-button`) only fills the checkout fields. The receiver acknowledges with HTTP 200 and does not retain or print payloads. See [Fly receiver details](fly-receiver.md).

## Privacy

There is no in-page analytics toggle. The footer links to `/privacy` and displays `Scriptwell@gmail.com`. The policy describes the contact, health, prescription, interaction, pharmacy, and synthetic payment information included in the analytics event, and says a request to stop future analytics sharing may be submitted through that contact. Processing that request is outside this demo and cannot recall information already transmitted.

Form answers, including demo payment fields, stay in React memory. There is no replay, retry queue, unload transmission, or fallback beacon. Non-success responses and the five-second timeout report failure without breaking the offer. `[data-analytics-status]` is a receiver acknowledgement, not evidence that the extension observed the request.

## Configuration and verification

`VITE_ANALYTICS_URL` overrides the destination. Restart Vite or rebuild after changing it. `APP_PORT` controls the demo port; the integrated allowlists assume 5173. `ANALYTICS_PORT`, `ANALYTICS_HOST`, and `ALLOWED_ORIGIN` apply only to the optional Node receiver, not Fly or the observability API.

Use the fictional prefilled answers, select a pharmacy preference and duration, click **Use Demo Card**, and confirm. The browser Network panel should show one HTTPS POST whose payload includes `payment`. With the extension and proxy configured, the local dashboard should show separate metadata and payload observations. Tests use synthetic fixtures and never submit privacy requests to companies.
