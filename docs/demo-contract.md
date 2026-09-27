# Prescription savings demonstration contract

> **Current browser destination:** `POST http://localhost:4319/collect`. The local HTTP bridge forwards the same JSON body over plaintext HTTP to `http://fly-analytics.fly.dev/collect` for the tshark demonstration. Do not use real personal, health, or payment information.

## Run locally

Requires Node 20.12+ and npm. From the repository root:

```sh
cd demoapp
npm ci
python3 server/bridge.py
```

In another terminal, run `cd demoapp && npm run dev`. Open **http://localhost:5173** (use `localhost`, not `127.0.0.1`). `npm run build` type-checks and creates `dist/`. `npm test` runs the analytics, failure-handling, and local-receiver regression tests.

## Origins and request

- First-party website: `http://localhost:5173`.
- Browser analytics destination: `http://localhost:4319/collect`.
- Plaintext forwarding destination: `http://fly-analytics.fly.dev/collect`.
- Method: `POST`; header `Content-Type: application/json`.
- Real browser `fetch`, `mode: cors`, `credentials: omit`, `cache: no-store`, `referrerPolicy: no-referrer`.
- Trigger: final valid submission of `#offer-intake-form` via `#confirm-offer-button` (button text “Confirm my offer”). Enter-key submission also works. Search, choosing a pharmacy, typing, and continuing from step 1 do not emit analytics.
- The browser sends an `OPTIONS` CORS preflight before the POST. Preflight does not contain the sensitive-looking payload. The bridge returns **204** for OPTIONS and **200** after successful forwarding.
- Different ports are different origins, though these localhost origins are same-site. The bridge and Fly app are team-controlled demo services, not commercial analytics or payment providers.
- The bridge forwards the original JSON body unchanged. No second request is made by the browser, and the checkout UI itself makes no request.

## JSON contract

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
    "weight_lb": 160,
    "concern": "  anxiety",
    "symptoms": "  restlessness and difficulty sleeping",
    "duration": "1_to_6_months",
    "current_medications": "None",
    "medication_allergies": "None"
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
3. Choose Mental wellness → Sertraline → Meadow Pharmacy. Manually type synthetic identity and health details, continue to Demo Checkout, and click **Use Demo Card**.
4. Click **Confirm my offer**. Select the POST and inspect Headers, Payload, and Timing. Verify OPTIONS is 204 and POST is 200. The payload contains person, health, prescription, payment, offer, interaction, and privacy objects.
5. The extension should identify the request independently; this app does not fake an extension alert. The bridge forwards the JSON to Fly without storing it.
6. Open the footer Privacy Policy link and verify that `/privacy` discloses the shared data categories and opt-out contact.

## Storage and failure behavior

Form fields, including demo payment fields, live only in React memory. No form submission is written to local storage, session storage, cookies, URLs, a database, or files. The confirmation retains a first name and selected offer until reset/reload. DevTools, tshark, the extension, bridge/Fly logs, or other capture tools may retain their own copies; clear those separately. No email, pharmacy, payment processor, or health provider is connected.

Analytics failure, non-2xx, CORS rejection, or a five-second timeout never prevents first-party confirmation. There is no retry, beacon fallback, unload transmission, background queue, or replay.

## Judge script

1. Start both services and open the website. Explain verbally that all people, pharmacy offers, health details, and payment values are synthetic.
2. Browse a health concern or search for a medication. Compare three illustrative prices and choose a pharmacy.
3. Manually enter synthetic identity and health details. Continue to Demo Checkout and click **Use Demo Card**.
4. Confirm the offer. Show the extension’s explanation and the single outgoing event's synthetic payment fields.
5. Open the Privacy Policy from the footer and show the analytics disclosure and `Scriptwell@gmail.com` privacy contact.
6. Use “Explore another medication” to start a blank flow for the next judge.

## Verification performed

- TypeScript check and production build: `npm run build` passed.
- Analytics and receiver regression tests cover exact demo-card serialization, single-request behavior, failure isolation, CORS, receiver validation, and non-retention.
- Browser verification passed through all three intake steps. **Use Demo Card** populated only synthetic text inputs with `autocomplete="off"`; bridge delivery returned `sent` and the offer confirmation rendered.
- In a real browser, condition browsing → medication → pharmacy → blank two-step form → confirmation passed.
- Empty first-step submission was blocked by native required validation.
- Enabled browser submission received an HTTP-success acknowledgement; local receiver count rose from 1 to 2. (Count 1 was the earlier analytics-branch browser check.)
- With the receiver stopped, enabled browser submission still confirmed the offer and reported `failed`; no retry was queued.
- Browser-extension detection/explanation must be checked with the team's actual extension. The website's diagnostics are not evidence that an extension detected the request.
- The homepage has no analytics-sharing control. Browser verification confirmed the footer contact and dedicated `/privacy` policy, including analytics disclosure and opt-out request language.

## Commands and Git workflow

Work started on `testapp` at `109fb7c` with a clean working tree. Each feature branch was created from the latest merged `testapp`, verified, committed, and merged with `--no-ff` before the next branch began:

1. `feat/demoapp-frontend`: branded UI, catalog, search, pharmacy comparisons.
2. `feat/demoapp-intake`: manual questionnaire, required validation, offer confirmation.
3. `feat/demoapp-analytics`: real browser POST, receiver, schema and this contract.
4. `feat/demoapp-privacy`: preference, reset, regression checks and final documentation.

The later `feat/demoapp-privacy-policy` update removes the in-page sharing preference, adds the dedicated policy route and footer contact, and updates the integration documentation to match the revised demo story.

Key commands executed: `npm install`, `npm run build` for each stage, `npm run dev`, `npm run dev:analytics`, `npm test`, `npm run format`, `npm run format:check`, and `curl -fsS http://localhost:4318/health`. Final startup uses `npm run dev:all`. Git inspection used `git status --short`, `git log --oneline`, and `git diff --check`; each stage used `git switch -c`, `git add`, `git commit`, `git switch testapp`, and `git merge --no-ff`. Sandbox restrictions required permission for dependency downloads, loopback listeners, and Git metadata writes.

Repository note: the original directory was `demo app/` with an empty `demo.txt`; the implementation is in the explicitly requested `demoapp/`. During development the tracked `demo app/demo.txt` was deleted outside these changes. That deletion was preserved as an unrelated, uncommitted change and excluded from feature commits. No merge conflicts occurred.
