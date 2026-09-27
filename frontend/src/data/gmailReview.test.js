import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { draftPayload, sendPayload } from "./gmailReview.js";

test("draft and send payloads stay limited to the approved email", () => {
  const draft = draftPayload({
    eventId: "evt-1",
    to: "privacy@example.test",
    state: "CA",
    includeIdentity: { email: true },
    identity: { email: "avery@example.test" },
  });
  assert.deepEqual(Object.keys(draft).sort(), ["event_id", "identity", "include_identity", "state", "to"]);
  assert.equal(draft.approved, undefined);
  assert.equal("findings" in draft, false);

  const review = {
    to: "privacy@example.test",
    subject: "Privacy request",
    body: "Please delete my personal information.\n",
    recipientSource: "user",
    eventId: "evt-1",
  };
  assert.equal(sendPayload(review).approved, true);
  assert.throws(() => sendPayload({ ...review, body: "  " }), /Review To, Subject/);
});

test("the privacy panel sends only from the explicit Send with Gmail action", () => {
  const source = fs.readFileSync(new URL("../components/PrivacyPanel.jsx", import.meta.url), "utf8");
  const sendAt = source.indexOf("/api/gmail/send");
  assert.ok(sendAt > 0);
  assert.equal(source.split("/api/gmail/send").length - 1, 1);
  assert.equal(source.slice(0, sendAt).includes("useEffect"), true);
  assert.equal(source.slice(0, sendAt).includes("gmail/send"), false);
  assert.match(source, /Send with Gmail/);
  assert.match(source, /sendPayload\(review\)/);
});
