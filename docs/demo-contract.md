# Prescription savings demonstration contract

## Run locally

Requires Node 20.12+ and npm. From the repository root:

```sh
cd demoapp
npm ci
npm run dev:all
```

Alternatively run `npm run dev` and `npm run dev:analytics` in separate terminals. Open **http://localhost:5173** (use `localhost`, not `127.0.0.1`). `npm run build` type-checks and creates `dist/`; `npm run preview` serves that build on 5173. `npm test` checks the real receiver, CORS, errors, and non-retention.

## Origins and request

- First-party website: `http://localhost:5173`.
- Fictional third-party analytics service: `http://localhost:4318`.
- Destination: `http://localhost:4318/v1/events`.
- Method: `POST`; header `Content-Type: application/json`.
- Real browser `fetch`, `mode: cors`, `credentials: omit`, `cache: no-store`, `referrerPolicy: no-referrer`.
- Trigger: final valid submission of `#offer-intake-form` via `#confirm-offer-button` (button text “Confirm my offer”). Enter-key submission also works. Search, choosing a pharmacy, typing, and continuing from step 1 do not emit analytics.
- The browser ordinarily sends an `OPTIONS` CORS preflight before the POST. Preflight does not contain the health payload. The receiver permits the configured first-party origin, POST, OPTIONS, and Content-Type; accepted POST returns **204**.
- Different ports are different origins, though these localhost origins are same-site. This is a fictional analytics receiver, not an actual commercial analytics service. Extensions that classify third parties only by registrable domain may need to treat this origin explicitly as the demo destination.
- No proxy: requests go directly from browser to the second port.

## JSON contract

The full machine-readable schema is [demo-event.schema.json](./demo-event.schema.json). All properties in it are required; no additional properties are expected. The receiver checks the event envelope, not the complete schema. An event is one JSON object, not an array or encoded string.

Example **entirely fictional** payload:

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
    "concern": "Fictional anxiety",
    "symptoms": "Fictional restlessness and difficulty sleeping",
    "duration": "1_to_6_months",
    "current_medications": "None",
    "medication_allergies": "None"
  },
  "prescription": { "medication": "Sertraline", "strength": "50 mg", "quantity": "30 tablets" },
  "offer": { "pharmacy_id": "meadow", "pharmacy_name": "Meadow Pharmacy", "illustrative_price_usd": 9.6 },
  "interaction": { "search_term": "mental", "pharmacy_preference": "lowest_price", "language": "en-US", "viewport_width": 1440, "trigger": "confirm_offer" },
  "privacy": { "optional_analytics_enabled": true }
}
```

`event_id` is a new browser-generated UUID on each submission. `occurred_at` is the client UTC ISO timestamp. Names, email and ZIP are identifying/contact fields. The `health` and `prescription` objects carry explicit health information. Search terms and pharmacy choices may also reveal health context. Language, viewport width, event name, and preference are ordinary interaction metadata, but association with a person can still matter. Do not describe this demonstration as a confirmed HIPAA violation.

## Privacy integration (implemented in the following privacy branch)

Reserved stable selector: **`#analytics-sharing-toggle`**, a native checkbox (`checked=true` means enabled). Use `.click()` or a checkbox-aware interaction such as Playwright `setChecked(false)`; assigning `.checked` alone does not update React state. The setting will gate event construction and fetch at submission time. Off means no analytics POST, no queued event, and no later replay; the first-party confirmation still appears. Turning off cannot recall a request already dispatched.

## Configuration

Copy `demoapp/.env.example` to `demoapp/.env` to override defaults. The file is ignored by Git. `VITE_ANALYTICS_URL` is the full destination URL, `ANALYTICS_PORT` is the receiver port, `ANALYTICS_HOST` is the bind host, `ALLOWED_ORIGIN` is the exact permitted website origin, and `APP_PORT` changes the Vite dev port. Update corresponding values together and restart both processes. Vite variables are compiled into production builds: rebuild after changing the endpoint. Use two different HTTPS origins when deploying; an HTTPS website cannot use an HTTP analytics destination. Provision only a team-controlled fictional receiver. This task does not deploy anything.

Branding is centralized in `demoapp/src/config.ts`; catalog and illustrative prices are in `demoapp/src/catalog.ts`; payload mapping and destination are in `demoapp/src/analytics.ts`.

## Chrome DevTools verification

1. Open the website in Chrome with your unpacked extension installed and permitted on both origins.
2. Open DevTools → Network, enable Preserve log, and filter by `4318` or `v1/events`. Keep Fetch/XHR selected or use All to also see preflight.
3. Choose Mental wellness → Sertraline → Meadow Pharmacy. Manually type fictional details. Submit the final questionnaire.
4. Select the POST, inspect Headers (destination, method, Origin), Payload (person, health, prescription), and Timing. Verify 204. The extension should identify the request independently; this app does not fake an extension alert.
5. The receiver terminal prints an event number and receipt timestamp, never submitted values. `curl http://localhost:4318/health` returns the in-memory accepted event count. Restart the receiver to zero this count. There is no endpoint for reading submissions.
6. In the final privacy version, disable optional analytics, reset the offer flow, manually fill it again, and submit. Verify confirmation still appears, no new POST is recorded, and the receiver count is unchanged. Clear the Network list between rounds if necessary. With no earlier preflight cached, the enabled round typically shows OPTIONS + POST; the disabled round must show neither caused by submission.

## Storage and failure behavior

Form fields live only in React memory. Nothing is written to local storage, session storage, cookies, URLs, a database, or files. The confirmation retains a first name and selected offer until reset/reload. Receiver bodies are discarded after processing; response and console logs never echo them. DevTools or the extension may retain their own captures; clear those separately. The receiver count is aggregate, in memory only. No email, pharmacy, payment, health-provider, or real analytics service is connected.

Analytics failure, non-2xx, CORS rejection, or a five-second timeout never prevents first-party confirmation. There is no retry, beacon fallback, unload transmission, background queue, or replay. The technical delivery status is available as `[data-analytics-status]` for integration checks; it is not an extension finding.

## Judge script

1. Start both services and open the website. Explain verbally that all people, pharmacy offers, and entered health details are fictional.
2. Browse a health concern or search for a medication. Compare three illustrative prices and choose a pharmacy.
3. Manually enter Avery Example, avery@example.test, 65201, 160 lb; choose Lowest price. Continue and enter the fictional health details from the example above.
4. Confirm the offer. Show the extension’s explanation of the actual outgoing request and its destination.
5. Disable optional analytics; start a fresh flow and manually enter the fictional details again. Confirm that the offer works without a new analytics request.
6. Reset the offer flow for the next judge. Re-enable sharing explicitly before repeating the enabled demonstration.
