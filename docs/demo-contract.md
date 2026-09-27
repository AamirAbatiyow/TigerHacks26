# Synthetic demo payload contract

The only demo health app is ScriptWell in `demoapp/`, running at `http://localhost:5173`. The complete pipeline and startup commands are in [integrated-demo.md](integrated-demo.md).

## Payload and delivery

`demoapp/src/analytics.ts` is the authoritative payload builder. [demo-event.schema.json](demo-event.schema.json) describes the synthetic application payload; it is not a second observability event schema. The shared observation envelope is normalized by `network trace/classifier.py` and consumed unchanged by the local API and dashboard.

The demo payload contains `schema_version`, `event_name`, a submission UUID, `occurred_at`, application source, person, health, prescription, offer, interaction, and privacy objects. The classifier fixture at `network trace/tests/demo-payload.json` is exported from the actual builder:

```sh
(cd demoapp && node --import tsx tests/export-payload.ts)
```

The final valid `#offer-intake-form` submission via `#confirm-offer-button` sends JSON to `https://fly-analytics.fly.dev/collect`, using POST, `Content-Type: application/json`, CORS mode, omitted credentials, and no-referrer policy. Searching, typing, pharmacy selection, and the first questionnaire step do not send analytics. The receiver acknowledges with HTTP 200 and does not retain or print payloads. See [Fly receiver details](fly-receiver.md).

## Privacy and reset

`#analytics-sharing-toggle` is a native checkbox. Off skips payload construction and fetch entirely; the offer still confirms. Only this preference persists under `scriptwell.optional-analytics.v1`. Form answers stay in React memory. `#reset-flow-button` clears the current flow and delivery status, retaining the preference; the next intake starts with clearly fictional example values.

Changing the preference cannot recall an earlier disclosure. There is no replay, retry queue, unload transmission, or fallback beacon. Non-success responses and the five-second timeout report failure without breaking the offer. **Sharing details** exposes the destination and delivery status (`[data-analytics-status]`). It is a receiver acknowledgement, not evidence that the extension observed the request.

## Configuration and verification

`VITE_ANALYTICS_URL` overrides the destination. Restart Vite or rebuild after changing it. `APP_PORT` controls the demo port; the integrated allowlists assume 5173. `ANALYTICS_PORT`, `ANALYTICS_HOST`, and `ALLOWED_ORIGIN` apply only to the optional Node receiver, not Fly or the observability API.

Use the fictional prefilled answers, select a pharmacy preference and duration, and confirm. The browser Network panel should show the HTTPS POST; with the extension and proxy configured, the local dashboard should show separate metadata and payload observations. Turn sharing off and repeat to verify no new analytics POST. Tests use synthetic fixtures and never submit privacy requests to companies.
