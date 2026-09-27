# Privacy opt-out feature

The dashboard and polished extension consume real local observations through the
shared API on `127.0.0.1:8765`. Start from the repository root:

```sh
python3 'network trace/local_api.py'
npm run dev --prefix frontend
```

Run those in separate terminals. Open `http://127.0.0.1:5174/?privacy=1`.
The bundled extension dashboard uses the same API. **Refresh privacy issues** reloads
current findings in the popup; its action re-resolves the selected finding before
opening a verified official mechanism. Unsupported or unavailable findings disable it.
**Process finding** records an engine result locally; opening a portal never marks a
request submitted or completed.

## Provider boundary

`network trace/live_privacy.py` adapts real classified observations to `PrivacyFinding`.
Only destination and category metadata are copied, never raw payload values. Residency
and company identity are not guessed. Unknown residency is represented by null;
unsupported destinations such as the Fly demo receiver cannot trigger a submission.
`ResultStore` persists results in `network trace/privacy.sqlite3` (ignored by Git).

The existing contract, resolver, strategy registry, and result store are shared:

- GET `/api/privacy/findings`: redacted resolution previews.
- POST `/api/privacy/run` with a real `event_id`: provider → engine → store.
- GET `/api/privacy/results`: stored metadata and evidence, without raw user fields.

The JSON fixture provider remains for regression tests and explicit isolated testing
via `PRIVACY_LOCAL_MODE=1 python3 'network trace/fly-analytics/server.py'` on port 8080.
Neither the dashboard nor extension uses that fixture server in the integrated demo.
`PRIVACY_FIXTURE_DIR`, `PRIVACY_DB_PATH`, and `PORT` configure only that test mode.
Remotely deployed privacy endpoints remain disabled.

See [the integrated guide](../../../docs/integrated-demo.md) for the complete setup.

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

The integrated API binds to `127.0.0.1:8765`, validates the loopback Host, and permits
only the port 5174 dashboard origins and Chrome extension origins through CORS.
The popup and bundled/standalone dashboards call it directly; no Vite proxy is needed.
The popup includes `X-PatientPrivy-Extension` on its finding read. This is single-user
local infrastructure, not authenticated remote access.

The extension's observation POST goes only to the local `/events` endpoint. Its Fly
host permissions enable request observation, not remote telemetry submission. Neither
raw observations nor findings are forwarded to Fly. The remote receiver accepts only
the synthetic demo application payload and leaves privacy routes disabled. The
standalone fixture server retains its separate, narrower origin checks for tests.

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

## Adding another finding provider

1. Implement `PrivacyFindingProvider.getPrivacyFinding(event_id)` and
   `listPrivacyFindings()` using the new source's data. Transform and validate it
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
`extension/privacy-findings.mjs` and the matching manifest host permission plus the dashboard API base; the opt-out
resolver and UI logic stay unchanged. A remotely hosted backend also needs auth.

Popup integration checks (from the repository root):

```sh
node --test extension/tests/privacy-findings.test.mjs
```

These exercise selection, different companies/rights, provider destination changes,
missing/unsupported/unsafe findings, unavailable service, and refreshed data. They use
simulated backend responses and never open real company pages.
