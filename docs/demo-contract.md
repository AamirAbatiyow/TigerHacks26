# Synthetic demo payload contract

The only demo health app is ScriptWell in `demoapp/`, running at `http://localhost:5173` and deployed at `https://scriptwell.fly.dev`. The complete pipeline and startup commands are in [integrated-demo.md](integrated-demo.md).

## Payload and delivery

`demoapp/src/analytics.ts` is the authoritative payload builder. [demo-event.schema.json](demo-event.schema.json) describes the synthetic application payload; it is not a second observability event schema. The shared observation envelope is normalized by `network trace/classifier.py` and consumed unchanged by the local API and dashboard.

The demo payload contains `schema_version`, `event_name`, a submission UUID, `occurred_at`, application source, person, health, prescription, payment, offer, interaction, and privacy objects. `payment` holds synthetic test-card values used only to demonstrate disclosure. The card number is serialized without spaces. It is never sent to a payment processor, and no authorization, charge, reservation, or purchase occurs. The classifier fixture at `network trace/tests/demo-payload.json` is exported from the actual builder:

The full machine-readable schema is [demo-event.schema.json](./demo-event.schema.json). All properties in it are required; no additional properties are expected. The receiver checks the event envelope, not the complete schema. An event is one JSON object, not an array or encoded string.

Example using entirely synthetic values:

```json
{
  "schema_version": "1.0",
  "event_name": "offer_confirmed",
  "event_id": "05663dd6-e364-4f1e-8480-e980e50a1e45",
  "occurred_at": "2026-09-26T18:00:00.000Z",
  "source": { "origin": "http://localhost:5173", "path": "/", "application": "prescription_savings" },
  "person": { "full_name": "Avery Example", "email": "avery@example.test", "zip_code": "65201" },
  "health": {
    "weight_lb": 165,
    "concern": "Anxiety",
    "symptoms": "Restlessness and difficulty sleeping",
    "duration": "1_to_6_months",
    "current_medications": "Daily multivitamin",
    "medication_allergies": "Penicillin"
  },
  "prescription": { "medication": "Sertraline", "strength": "50 mg", "quantity": "30 tablets" },
  "payment": {
    "cardholder_name": "Jamie Demo",
    "card_number": "4242424242424242",
    "expiration": "12/34",
    "cvc": "123",
    "billing_zip": "64093",
    "demo_only": true
  },
  "offer": { "pharmacy_id": "meadow", "pharmacy_name": "Meadow Pharmacy", "illustrative_price_usd": 9.6 },
  "interaction": { "search_term": "mental", "pharmacy_preference": "lowest_price", "language": "en-US", "viewport_width": 1440, "trigger": "confirm_offer" },
  "privacy": { "optional_analytics_enabled": true }
}
```

`event_id` is a new browser-generated UUID on each submission. `occurred_at` is the client UTC ISO timestamp. Names, email and ZIP are identifying/contact fields. The `health` and `prescription` objects carry explicit health information. The `payment` object contains synthetic test values generated solely for this hackathon privacy demonstration. The displayed card number is serialized without spaces for predictable packet inspection. It is never sent to a payment processor and no authorization, charge, reservation, or purchase occurs. Search terms and pharmacy choices may also reveal health context. Do not describe this demonstration as a confirmed HIPAA violation.

## Privacy policy and opt-out requests

The site has no in-page analytics opt-out control. The footer links to **`/privacy`** and displays **`Scriptwell@gmail.com`**. The policy describes the contact, health, prescription, interaction, pharmacy, and synthetic payment information included in the analytics event. It states that a request to stop future analytics sharing may be submitted through the privacy contact. Processing that request is outside the demo application's current UI and cannot recall information already transmitted.

## Configuration

The checked-in default in `demoapp/src/analytics.ts` is the local bridge URL. `VITE_ANALYTICS_URL` may override it, but the hackathon packet-capture flow should keep `http://localhost:4319/collect`. The bridge's Fly destination is defined in `demoapp/server/bridge.py`. HTTP is intentional for synthetic packet inspection; do not deploy this pattern for real personal or payment data.

Branding is centralized in `demoapp/src/config.ts`; catalog and illustrative prices are in `demoapp/src/catalog.ts`; payload mapping and destination are in `demoapp/src/analytics.ts`.

## Chrome DevTools verification

1. Open the website in Chrome with your unpacked extension installed and permitted on both origins.
2. Open DevTools → Network, enable Preserve log, and filter by `4319` or `collect`. Keep Fetch/XHR selected or use All to also see preflight.
3. Choose Anxiety → Sertraline → Meadow Pharmacy. Review the prefilled synthetic identity, health, preference, and payment details across all three steps.
4. Click **Confirm my offer**. Select the POST and inspect Headers, Payload, and Timing. Verify OPTIONS is 204 and POST is 200. The payload contains person, health, prescription, payment, offer, interaction, and privacy objects.
5. The extension should identify the request independently; this app does not fake an extension alert. The bridge forwards the JSON to Fly without storing it.
6. Open the footer Privacy Policy link and verify that `/privacy` discloses the shared data categories and opt-out contact.

## Storage and failure behavior

Prefilled form values, including demo payment fields, live only in React memory and remain editable. No form submission is written to local storage, session storage, cookies, URLs, a database, or files. The confirmation retains a first name and selected offer until reset/reload. DevTools, tshark, the extension, bridge/Fly logs, or other capture tools may retain their own copies; clear those separately. No email, pharmacy, payment processor, or health provider is connected.

Analytics failure, non-2xx, CORS rejection, or a five-second timeout never prevents first-party confirmation. There is no retry, beacon fallback, unload transmission, background queue, or replay.

## Judge script

1. Start both services and open the website. Explain verbally that all people, pharmacy offers, health details, and payment values are synthetic.
2. Browse a health concern or search for a medication. Compare three illustrative prices and choose a pharmacy.
3. Review the prefilled synthetic identity and health details, then continue through Demo Checkout.
4. Confirm the offer. Show the extension’s explanation and the single outgoing event's synthetic payment fields.
5. Open the Privacy Policy from the footer and show the analytics disclosure and `Scriptwell@gmail.com` privacy contact.
6. Use “Explore another medication” to return to the homepage for the next judge.

## Verification performed

- TypeScript check and production build: `npm run build` passed.
- Analytics and receiver regression tests cover exact demo-card serialization, single-request behavior, failure isolation, CORS, receiver validation, and non-retention.
- Browser verification passed through all three intake steps with editable synthetic identity, health, preference, and payment fields prefilled in React state.
- In a real browser, condition browsing → medication → pharmacy → prefilled three-step form → confirmation passed.
- Enabled browser submission received an HTTP-success acknowledgement; local receiver count rose from 1 to 2. (Count 1 was the earlier analytics-branch browser check.)
- With the receiver stopped, enabled browser submission still confirmed the offer and reported `failed`; no retry was queued.
- Browser-extension detection/explanation must be checked with the team's actual extension. The website's diagnostics are not evidence that an extension detected the request.
- The homepage has no analytics-sharing control. Browser verification confirmed the footer contact and dedicated `/privacy` policy, including analytics disclosure and opt-out request language.

## Privacy

There is no in-page analytics toggle. The footer links to `/privacy` and displays `Scriptwell@gmail.com`. The policy describes the contact, health, prescription, interaction, pharmacy, and synthetic payment information included in the analytics event, and says a request to stop future analytics sharing may be submitted through that contact. Processing that request is outside this demo and cannot recall information already transmitted.

1. `feat/demoapp-frontend`: branded UI, catalog, search, pharmacy comparisons.
2. `feat/demoapp-intake`: questionnaire, required validation, offer confirmation.
3. `feat/demoapp-analytics`: real browser POST, receiver, schema and this contract.
4. `feat/demoapp-privacy`: preference, reset, regression checks and final documentation.

## Configuration and verification

`VITE_ANALYTICS_URL` overrides the destination. Restart Vite or rebuild after changing it. `APP_PORT` controls the demo port; the integrated allowlists assume 5173. `ANALYTICS_PORT`, `ANALYTICS_HOST`, and `ALLOWED_ORIGIN` apply only to the optional Node receiver, not Fly or the observability API.

Use the fictional prefilled answers, select a pharmacy preference and duration, click **Use Demo Card**, and confirm. The browser Network panel should show one HTTPS POST whose payload includes `payment`. With the extension and proxy configured, the local dashboard should show separate metadata and payload observations. Tests use synthetic fixtures and never submit privacy requests to companies.
