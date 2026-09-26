# Privacy opt-out MVP

This feature extends the existing Python collector and React HealthTrace dashboard.
There was no database, authentication, user model, live finding API, email client,
background worker, or functional popup reason source in the repository. The network
map and popup monitoring counters use simulated data; the popup privacy issue section
uses the backend finding provider. This slice adds local SQLite and a
provider boundary; it does not infer privacy rights from health traffic.

## Run in the existing app

From the repository root, in two terminals:

```sh
PRIVACY_LOCAL_MODE=1 python3 'network trace/fly-analytics/server.py'
```

```sh
cd frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173/?privacy=1 or choose **Privacy opt-outs** in the dashboard.
The extension popup's blue action button loads current issues from the same backend
provider/resolver as the dashboard. Choose a company/reason when several findings are
available. A single finding is selected automatically. Its label follows the right
(e.g. **Opt out** or **Request deletion**) and its destination matches that finding's
**Open official mechanism** link exactly. Unsupported or unavailable findings disable
the button. Every click re-fetches and re-resolves the selected event before opening
an official page; removed or stale findings never fall back to another destination.
There is no fixed company URL or event ID in the popup.

Reload the unpacked extension after these changes to apply the module script and local
backend host permission. Start the Python backend in local mode on port 8080. The
popup calls the backend directly; the Vite website does not need to be running for
this button. **Refresh privacy issues** reloads changed fixtures/provider data.
Its bundled visualization remains a separate static build; it has no privacy backend.
Click **Process finding** to resolve, safely stop or submit, persist, and display a result.
Reloading retains the result. Opening a portal never marks it submitted or completed.

Place one normalized finding per JSON file in `fixtures/`. Use a new `event_id` when
changing an already processed finding. Optional names/email are validated when present;
state is required. A mechanism's required fields are checked separately. Sample users
are fictional; no fixture PII is sent to any external destination by the shipped flows.
Malformed input returns a validation error and no submission. Unknown reasons are
valid input but become `UNSUPPORTED`. No future GET endpoint is implemented.

`PRIVACY_FIXTURE_DIR` overrides the fixture directory. `PRIVACY_DB_PATH` overrides the
SQLite file (default `fly-analytics/data/privacy.sqlite3`, ignored by Git). `PORT`
defaults to 8080; if changed, update the Vite proxy. Local dev uses port 5173 explicitly.

## Provider boundary

`contract.py` contains immutable typed `PrivacyFinding`, `Company`, `Reason`, and `User`
records and strict validation via `PrivacyFinding.parse(raw)`. Providers expose
`getPrivacyFinding(event_id)` and `listPrivacyFindings()`; listing serves the local UI.
The local implementation reads JSON files. A future provider transforms its own
source schema and returns validated normalized records through this interface.
Inject it through `create_server(..., provider=...)`. Resolution, adapters, persistence,
and UI are independent of the source; never accept submission destinations from input.

Internal application routes (not the future data source):

- `GET /api/privacy/findings`: redacted resolution previews; no persistence or submission.
- `POST /api/privacy/run`, JSON `{ "event_id": "mock-microsoft-ads-001" }`: provider → engine → store → result.
- `GET /api/privacy/results`: stored metadata and evidence, without raw user fields.

## Supported coverage and reviewed mechanisms

Only CA rules and exact configured Microsoft identities are enabled in this MVP.
The reason mapping covers advertising, sale/sharing, sensitive-data limitation, and
explicit deletion. Rights without a verified matching strategy stop as unsupported.
A CA address alone is not enough: strategies carry official company applicability
statements and supported actions. This is not a universal legal applicability checker.

Sources reviewed September 26, 2026:

- [Microsoft U.S. state notice](https://www.microsoft.com/en-us/privacy/usstateprivacynotice):
  acknowledges CCPA sharing for advertising, honors user-enabled GPC, links its
  third-party ad sharing control, and requires valid account login for deletion.
  It does not offer sale or sensitive-data limitation opt-outs. The combined
  `sale_or_sharing` reason here resolves solely to the supported sharing opt-out.
- [Microsoft ad settings guidance](https://support.microsoft.com/en-us/accounts-billing/security/personalized-ads-and-your-privacy):
  preferences use browser cookies or authenticated account settings. A backend POST
  would not establish the user's preference in their browser or account.
- [California DOJ CCPA guidance](https://www.oag.ca.gov/privacy/ccpa): rights, business
  applicability, and genuine user-enabled GPC. Server requests with a made-up
  `Sec-GPC` header do not constitute a user browser opt-out.
- [Official DROP guidance](https://privacy.ca.gov/drop/) and
  [how DROP works](https://privacy.ca.gov/drop/how-drop-works/): registered broker
  deletion requires residency verification and a consumer-managed request. The UI
  links to guidance only; no broker identity/registration is inferred, and this is
  never substituted for a targeted advertising request.

Advertising/sharing picks GPC guidance first and provides the official privacy-choice
portal as a manual alternative. Deletion picks the official dashboard. Both finish
`ACTION_REQUIRED`, with no submission timestamp or company confirmation. Unsupported
companies/states/reasons, stale verification, and unavailable rights stop without PII.

## Strategies and submission

`rules.json` centralizes reason mappings, state rights/effective dates, and verification
freshness. `strategies.json` contains exact names/domains, supported rights, jurisdictions,
method, verified destination, required fields, verification requirements, sources,
verification dates, and status. Verification expires after 180 days. Subdomains are
not automatically trusted. Adding a manual company primarily means adding and
independently verifying configuration, rather than changing controllers.

The resolver prefers universal/government → HTTP → portal → email mechanisms. It
never derives addresses or paths. No automatic external submission adapter is installed:
the reviewed MVP mechanisms need real user browser/account context. There is no SMTP
infrastructure or verified, safely automatable POST contract in this repository.

A future reviewed adapter is registered by strategy ID in `OptOutEngine(adapters=...)`
and implements `submit(strategy, privacy_right, minimum_fields, event_id)`. Automation
requires an explicit `safe_automation` strategy and no verification blockers. Adapters
must enforce the exact verified destination, protocol, authorization, timeouts,
redirect restrictions, and receipt contract; generic arbitrary URL posting is absent.
Portal, GPC, and government mechanisms always require user action in this version.
Tests use an in-memory adapter only; those receipts are never presented as live results.

Lifecycle: `READY` → `SUBMITTED`, `ACTION_REQUIRED`, `COMPLETED`, or `FAILED`;
unresolvable input → `UNSUPPORTED`. Submitted means receipt accepted, not completion.
`COMPLETED` requires explicit company completion evidence. A failed/uncertain response
is not retried automatically. There is no UI control that asserts company completion.

SQLite records event/company/reason/right/rule/method/destination, timestamps,
reference, and evidence. It stores a keyed input fingerprint for deduplication/conflict
detection rather than raw names/email. READY is committed before a side effect;
interrupted attempts become action-required on replay. A repeated event cannot resend.
Retain the database across restarts; removing it also removes deduplication history.
Future external adapters must use the event ID for remote idempotency when available.

## Local-only boundary

Because the existing app has no auth, privacy routes are disabled on the existing
public collector by default. `PRIVACY_LOCAL_MODE=1` binds the server to loopback, checks
Host/Origin, omits wildcard CORS on privacy routes, and only accepts JSON event IDs.
The extension declares a host permission only for `http://127.0.0.1:8080/*`. Its
read-only `GET /api/privacy/findings` request identifies its extension ID using
`X-HealthTrace-Extension`; the server permits Chrome extension origins on that single
redacted route and echoes their exact origin for CORS. Other privacy routes remain
unavailable to extension origins. This identifies the requesting local extension,
not an authenticated user; authenticated ownership remains required for hosted use.
The React dev server proxies those requests. `/collect` retains its existing collector
behavior. This is single-user development infrastructure, not a shared hosted service.
Authenticated ownership/access control and durable hosted storage are prerequisites
for exposing real user findings remotely. No deployment was performed.

## Verification

```sh
cd 'network trace/fly-analytics'
python3 -m unittest discover -s tests -v
```

```sh
cd frontend
npm run build
npm run lint
```

Tests exercise inserted fixtures through provider/engine/persistence and HTTP routes,
input errors, company mismatches, rights, unsupported states, stale sources, login and
other blockers, minimum-field submission via a test adapter, failure/uncertain outcomes,
completion evidence, deduplication, changed event conflicts, and local route protection.

## Connecting the future fetching service to the popup

1. Implement `PrivacyFindingProvider.getPrivacyFinding(event_id)` and
   `listPrivacyFindings()` using the fetching service's data. Transform and validate it
   with `PrivacyFinding.parse(raw)`; return findings belonging to the current user.
2. Inject that provider into `create_server(..., provider=...)`. The existing
   `/api/privacy/findings` route resolves each company's reason/state to a verified
   destination. The popup and dashboard use those same resolved records.
3. Keep company destinations in verified strategy configuration. Add a reviewed
   strategy when supporting a new company; never put a destination in the incoming
   finding or extension button handler.

No future external GET URL, active-tab attribution, or account model is invented.
The current popup explicitly selects a finding. A future page-specific provider can
return only the applicable finding, which the popup then selects automatically.
Moving the application backend requires updating `PRIVACY_FINDINGS_URL` in
`extension/privacy-findings.mjs` and the matching manifest host permission; the opt-out
resolver and UI logic stay unchanged. A remotely hosted backend also needs auth.

Popup integration checks (from the repository root):

```sh
node --test extension/tests/privacy-findings.test.mjs
```

These exercise selection, different companies/rights, provider destination changes,
missing/unsupported/unsafe findings, unavailable service, and refreshed data. They use
simulated backend responses and never open real company pages.
