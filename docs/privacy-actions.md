# One privacy action, reviewed locally

The extension popup and frontend both use **Take Privacy Action**. The popup creates a local draft, then opens the same React review screen inside `extension/visualization/`; the dashboard opens that review directly. Gmail is optional. No action automatically sends mail.

## Previous flow and consolidation

The popup previously opened a verified portal or disabled the action as unsupported, while `PrivacyPanel` had separate process, recipient, identity, draft, and Gmail controls. A separate `extension/filing/` page filled hardcoded answers and simulated submission. Those filing assets and their test are removed. The dynamic Opt out / Limit sensitive data label and the extra File for me button are replaced by one action. The old frontend `gmailReview` helper and Gmail-specific draft/send endpoints are removed. The existing verified strategy resolver and result-store endpoints remain for compatibility; the new UI does not use Process finding.

## Local API

- `GET /api/privacy/findings`: real finding summaries, used by both UIs. A legacy UNSUPPORTED resolution does not prevent drafting a general request.
- `POST /api/privacy/actions/draft`: accepts `event_id`, optional `state`, optional explicit `to`, and optional discovered `contacts`. Resolves organization, recipient evidence, verified legal strategy or general fallback, categories, subject, and editable body. Returns `draft_id`.
- `GET /api/privacy/actions/draft?id=…`: opens the popup-created draft in the shared review screen.
- `POST /api/privacy/actions/send`: accepts `draft_id`, `approved: true`, reviewed `to`, `subject`, `body`, `recipient_source`, and `recipient_confirmed`. Sends through the existing local Gmail service only. Rejects captured-observation fields and unapproved messages.
- `GET /api/gmail/status`, `POST /api/gmail/connect`, `POST /api/gmail/disconnect`: the single connection state shared by all surfaces. OAuth remains entirely in Python.

Drafts live in local process memory for 30 minutes, with a 100-draft cap. They are not stored on Fly or written into the observation log. A draft can be sent once: repeated identical successful sends return the existing receipt; a changed or uncertain attempted send cannot silently retry. After an uncertain outcome, check Gmail Sent before creating another draft or using the fallback. Restarting the local API expires drafts and these temporary receipts.

## Recipient and legal evidence

1. Prefer a unique, fresh contact in the existing verified strategy registry. A verified mailbox can support a general request even when no verified legal right applies. It never establishes a statutory entitlement by itself. An observed bare domain is mapped to an organization only through an exact, unambiguous registry entry.
2. When the user clicks the popup action, `activeTab` + `scripting` inspects privacy/contact `mailto:` links on that page. It reads no form fields and does not crawl or fetch additional pages. Only email candidates and a source URL go to localhost; query strings/fragments are removed. Browser-protected pages fall back to manual entry.
3. The local API accepts discovery sources only from the observed destination or initiating app's origin. If the contact is for the initiating app, the review names that app separately from the observed third party. This does not create a verified legal identity or strategy. The source page is displayed and the recipient must be confirmed. Multiple candidates require selection.
4. If none is available, the review opens with an empty recipient. The user supplies an address. Editing an address labels it manually entered. No `privacy@…` address is guessed.

Discovery is unverified page content, not a trusted registry. It is never silently used. The shared review shows company/app, observed destination, recipient/provenance, request type, editable subject/body, and detected category names. Raw captured health/payment values and contact details from the user payload are not copied into the email. Users can add identification details to the editable message themselves.

Verified strategies retain their official instructions and links. Email does not claim to complete a portal or GPC workflow. Without a matching strategy, the default is explicitly a **General privacy / deletion request**, with firm language reserving rights and no litigation threat. Numeric deadlines are included only when an applicable verified strategy and an effective existing jurisdiction rule supply the number and source. The shipped rules contain no numeric deadline.

## Gmail and mailto

**Connect Gmail**, **Connected as …**, **Disconnect**, and **Send with Gmail** all use the same local service. The existing Desktop OAuth flow, send-only Gmail scope (plus account identification scopes), local token path, and disconnect behavior are retained. Revoked authorization is reflected in shared connection status. No OAuth logic or token is placed in JavaScript.

Both delivery choices require the user to check approval for the displayed recipient and message. Editing clears approval. A discovered contact additionally needs recipient confirmation. **Send with Gmail** makes the explicit approved send call and displays `gmail_sent` only after a Gmail message receipt. Account connection, opening a finding, and creating a draft send nothing.

**Open in Email App** is a normal `mailto:` link built entirely in the UI from the reviewed recipient, subject, and full body. Every value is URL-encoded, including plus signs, newlines, Unicode, and reserved characters. It does not call Gmail or a send endpoint. Its status is **Draft opened in your email app** (`mailto_opened`), never sent. Opening the link is a browser handoff; successful launch and final delivery depend on the user's configured mail handler. Gmail missing, disconnected, revoked, or failing does not disable this fallback. No generated text is truncated; mail-client URL-size limits may still apply to unusually long edited messages.

## Files

- `extension/popup.{html,js,css}`, `privacy-findings.mjs`, `manifest.json`: consolidated action, local shared client, and user-invoked contact discovery.
- `frontend/src/components/PrivacyPanel.jsx`, `data/privacyActions.js`, `App.jsx`, `views.css`: one review experience, explicit approval, shared account status, Gmail send, mailto fallback; minor space adjustment for editable text.
- `network trace/privacy_email.py`, `local_api.py`: the draft/action model, provenance validation, temporary drafts, guarded delivery.
- `network trace/fly-analytics/privacy/engine.py`: verified mailto strategies participate in the existing resolver instead of a separate email legal path.
- `network trace/gmail_service.py`: preserve OAuth; safely surface revoked/uncertain delivery status.
- Tests under `extension/tests`, `frontend/src/data`, and `network trace/tests`; regenerated extension dashboard assets.

The classifier, collectors, observation schema, ScriptWell app, and Fly receiver are unchanged.

## Run and verify

From the repository root:

```sh
python3 -m pip install -r 'network trace/requirements-gmail.txt' # optional for Gmail
npm run build:extension --prefix frontend
python3 'network trace/local_api.py'
# In another terminal for the standalone dashboard:
npm run dev --prefix frontend
```

Reload the unpacked `extension/` in Chrome so the added activeTab/scripting permissions and rebuilt dashboard take effect. Select a real finding and click **Take Privacy Action**. For discovery, invoke the popup while the observed app's privacy/contact page is open. The standalone dashboard is `http://127.0.0.1:5174/?privacy`.

For Gmail's Desktop client setup and ignored token paths, see [the integrated guide](integrated-demo.md#gmail-opt-out-local-only). Gmail is optional; the email-app path needs no Google configuration.

Validation covers general/verified requests, verified/discovered/manual recipients, source matching, discovered confirmation, no guessed contacts/deadlines, no implicit sends, deduplication, revoked/disconnected accounts, exact mailto encoding, and the shared extension/dashboard API. Tests use fake mail transport; no live email was sent. Browser QA verified a real local finding opens a general draft and the complete mailto link enables after approval while Gmail remains disconnected.

Final checks: **118 tests pass** (79 local pipeline/API/Gmail, 13 original privacy-engine, 14 frontend, 9 extension, 3 demoapp). Frontend lint, standalone build, extension dashboard build, demoapp build, extension JavaScript syntax checks, and `git diff --check` pass. Vite still reports the existing large 3D bundle warning.

Manual verification still required: Chrome's user-invoked page scan after reloading the extension; the user's Google consent/callback/token refresh and sending one deliberately approved test email; the OS default email client opening the complete draft. These are not claimed as completed by the automated tests.

Implementation references: [Gmail messages.send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send) and [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).
