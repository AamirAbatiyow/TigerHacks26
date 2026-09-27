import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSession, advancePlayback, flightProgress, eventAtTime } from "./session.js";
import { privacyIssues } from "../../../extension/privacy-issues.mjs";
import { privacyIssueCount, privacyIssues as sharedIssues, sensitiveFieldCount, simpleObservations, toSession } from "./liveEvents.js";

// One ScriptWell submission as the local API stores it (shape of real captures, synthetic values).
const at = (seconds) => new Date(Date.UTC(2026, 8, 27, 0, 0, seconds)).toISOString();
const finding = { field: "payment.card_number", value: "4242424242424242", category: "financial", severity: "HIGH", detection_method: "rule", confidence: 0.97 };
const submission = [
  { event_id: "page", source: "mitm", host: "scriptwell.fly.dev", method: "GET", path: "/", timestamp: at(0), body: null, findings: [] },
  { event_id: "script", source: "browser_extension", host: "scriptwell.fly.dev", method: "GET", path: "/assets/index-abc.js", timestamp: at(0), body: null, findings: [] },
  { event_id: "style", source: "mitm", host: "scriptwell.fly.dev", method: "GET", path: "/assets/index-abc.css?v=1", timestamp: at(0), body: null, findings: [] },
  { event_id: "icon", source: "mitm", host: "scriptwell.fly.dev", method: "GET", path: "/favicon.ico", timestamp: at(1), body: null, findings: [] },
  { event_id: "preflight-ext", source: "browser_extension", host: "fly-analytics.fly.dev", method: "OPTIONS", path: "/collect", timestamp: at(20), body: null, findings: [] },
  { event_id: "preflight-mitm", source: "mitm", host: "fly-analytics.fly.dev", method: "OPTIONS", path: "/collect", timestamp: at(20), body: null, findings: [] },
  { event_id: "post-ext", source: "browser_extension", host: "fly-analytics.fly.dev", method: "POST", path: "/collect", timestamp: at(20), body: null, findings: [] },
  { event_id: "post-mitm", source: "mitm", host: "fly-analytics.fly.dev", method: "POST", path: "/collect", timestamp: at(21), body: { payment: { card_number: "4242424242424242" } }, findings: [finding] },
];
const ids = (observations) => observations.map((event) => event.event_id);

test("simple view keeps the sensitive POST and hides preflights, assets, page loads, and its metadata twin", () => {
  assert.deepEqual(ids(simpleObservations(submission)), ["post-mitm"]);
  const session = toSession(submission, { simple: true });
  assert.deepEqual(session.destinations.map((d) => d.id), ["fly-analytics.fly.dev"]);
  assert.deepEqual(session.events.map((e) => e.id), ["post-mitm"]);
  assert.equal(session.events[0].at, 21, "timing stays anchored to the full recording");
  assert.equal(session.destinations[0].requests[0].fields.length, 1);
});

test("technical view still exposes every stored observation from every source", () => {
  const session = toSession(submission);
  assert.deepEqual(session.events.map((e) => e.id), ids(submission));
  assert.deepEqual(session.destinations.map((d) => d.id), ["scriptwell.fly.dev", "fly-analytics.fly.dev"]);
  const captured = session.destinations[1].requests.find((request) => request.id === "post-mitm");
  assert.deepEqual(captured.body, { payment: { card_number: "4242424242424242" } });
  assert.equal(captured.findings[0].value, "4242424242424242");
  assert.equal(captured.findings[0].category, "financial");
  assert.equal(captured.source, "mitm");
  assert.deepEqual(toSession(submission, { simple: false }), session);
});

test("metadata-only records stay visible when no collector saw the same request", () => {
  const extensionOnly = submission.filter((event) => event.source === "browser_extension");
  assert.deepEqual(ids(simpleObservations(extensionOnly)), ["post-ext"]);
  const later = { ...submission[6], event_id: "post-ext-later", timestamp: at(59) };
  assert.deepEqual(ids(simpleObservations([...submission, later])), ["post-mitm", "post-ext-later"]);
});

test("sensitive findings are never hidden, whatever the method or path", () => {
  const sensitiveGet = { ...submission[0], event_id: "get-with-findings", findings: [finding] };
  const bodyPost = { ...submission[7], event_id: "body-no-findings", findings: [] };
  assert.deepEqual(ids(simpleObservations([sensitiveGet, bodyPost])), ["get-with-findings", "body-no-findings"]);
});

function findings(count) {
  return Array.from({ length: count }, (_, index) => ({
    field: `field_${index}`, value: "synthetic", category: "identity", severity: "HIGH",
  }));
}
function post(id, source, offsetMs, count, body) {
  return {
    event_id: id, source, host: "fly-analytics.fly.dev", method: "POST", path: "/collect",
    timestamp: new Date(Date.UTC(2026, 8, 27, 0, 0, 20, offsetMs)).toISOString(),
    body: body === undefined ? (count ? { synthetic: true } : null) : body,
    findings: findings(count),
  };
}
function displayed(observations) {
  const session = normalizeSession(toSession(observations, { simple: true }));
  const request = session.nodes[0]?.requests[0];
  return {
    eventId: request?.id ?? null,
    source: request?.message ?? null,
    count: request?.privacyIssues?.length ?? 0,
    shown: session.events.map((event) => event.id),
  };
}

test("simple view follows the richer POST after a metadata event arrives first", () => {
  const extension = post("post-ext", "browser_extension", 0, 0);
  const mitm = post("post-mitm", "mitm", 20, 26);
  const first = displayed([extension]);
  assert.equal(first.eventId, "post-ext");
  assert.equal(first.count, 0);
  assert.match(first.source, /browser_extension/);
  for (const observations of [[extension, mitm], [mitm, extension]]) {
    const next = displayed(observations);
    assert.deepEqual(next.shown, ["post-mitm"]);
    assert.equal(next.eventId, "post-mitm");
    assert.equal(next.count, 26);
    assert.equal(sensitiveFieldCount(observations), 26);
    assert.equal(next.count, mitm.findings.length);
  }
  const technical = toSession([extension, mitm]);
  assert.deepEqual(technical.events.map((event) => event.id), ["post-ext", "post-mitm"]);
});

test("a thinner collector capture does not keep the sensitive-field count", () => {
  const tshark = post("post-tshark", "tshark", 0, 4);
  const mitm = post("post-mitm", "mitm", 20, 12);
  for (const observations of [[tshark, mitm], [mitm, tshark]]) {
    const next = displayed(observations);
    assert.deepEqual(next.shown, ["post-mitm"]);
    assert.equal(next.count, 12);
    assert.equal(sensitiveFieldCount(observations), 12);
  }
  assert.equal(toSession([tshark, mitm]).events.length, 2);
});

function scriptwellFindings() {
  return [
    ["source.support_email", "identity", "HIGH", "scriptwellcontact@gmail.com"],
    ["person.full_name", "identity", "HIGH", "Avery Example"],
    ["person.email", "identity", "HIGH", "avery@example.test"],
    ["person.zip_code", "location", "HIGH", "65201"],
    ["health.weight_lb", "biometrics", "HIGH", "165"],
    ["health.concern", "diagnoses", "HIGH", "Anxiety"],
    ["health.symptoms", "symptoms", "MEDIUM", "Restlessness and difficulty sleeping"],
    ["health.duration", "symptoms", "MEDIUM", "1_to_6_months"],
    ["health.current_medications", "medications", "HIGH", "Daily multivitamin"],
    ["health.medication_allergies", "medications", "HIGH", "Penicillin"],
    ["prescription.medication", "medications", "HIGH", "Sertraline"],
    ["prescription.strength", "medications", "LOW", "50 mg"],
    ["prescription.quantity", "medications", "HIGH", "30 tablets"],
    ["payment.cardholder_name", "financial", "HIGH", "Jamie Demo"],
    ["payment.card_number", "financial", "HIGH", "4242424242424242"],
    ["payment.expiration", "financial", "MEDIUM", "12/34"],
    ["payment.cvc", "financial", "HIGH", "123"],
    ["payment.billing_zip", "location", "HIGH", "64093"],
    ["offer.pharmacy_id", "appointments", "MEDIUM", "meadow"],
    ["offer.pharmacy_name", "appointments", "LOW", "Meadow Pharmacy"],
    ["offer.support_email", "identity", "HIGH", "scriptwellcontact@gmail.com"],
    ["interaction.pharmacy_preference", "appointments", "MEDIUM", "lowest_price"],
    ["interaction.language", "device_identifiers", "LOW", "en-US"],
    ["interaction.viewport_width", "device_identifiers", "LOW", "1728"],
    ["privacy.contact_email", "identity", "HIGH", "scriptwellcontact@gmail.com"],
    ["privacy.privacy_email", "identity", "HIGH", "scriptwellcontact@gmail.com"],
  ].map(([field, category, severity, value]) => ({ field, category, severity, value, detection_method: "rule", confidence: 0.91 }));
}

test("ScriptWell findings become privacy issues while the technical view keeps every raw finding", () => {
  assert.equal(sharedIssues, privacyIssues);
  const raw = scriptwellFindings();
  const issues = privacyIssues(raw);
  assert.equal(raw.length, 26);
  assert.deepEqual(issues.map((issue) => issue.id), [
    "full_name", "email", "zip", "weight", "concern", "symptoms", "medications", "allergies", "prescription", "payment_card", "billing_zip", "pharmacy",
  ]);
  assert.equal(issues.find((issue) => issue.id === "email").summary, "avery@example.test");
  assert.equal(issues.find((issue) => issue.id === "symptoms").fields.join(","), "health.symptoms,health.duration");
  assert.equal(issues.find((issue) => issue.id === "symptoms").summary, "Restlessness and difficulty sleeping · 1 to 6 months");
  assert.equal(issues.find((issue) => issue.id === "prescription").severity, "HIGH");
  assert.equal(issues.find((issue) => issue.id === "prescription").fields.length, 3);
  const payment = issues.find((issue) => issue.id === "payment_card");
  assert.deepEqual(payment.fields, ["payment.cardholder_name", "payment.card_number", "payment.expiration", "payment.cvc"]);
  assert.equal(payment.summary, "Jamie Demo · •••• 4242 · 12/34 · •••");
  assert.doesNotMatch(payment.summary, /4242424242424242|\b123\b/);
  const pharmacy = issues.find((issue) => issue.id === "pharmacy");
  assert.deepEqual(pharmacy.metadata, ["offer.pharmacy_id"]);
  assert.equal(pharmacy.summary, "Meadow Pharmacy · lowest price");
  assert.equal(privacyIssues([{ field: "offer.pharmacy_id", category: "appointments", severity: "MEDIUM", value: "meadow" }]).length, 0);
  for (const field of ["source.support_email", "offer.support_email", "privacy.contact_email", "privacy.privacy_email", "interaction.language", "interaction.viewport_width"]) {
    assert.equal(issues.some((issue) => issue.fields.includes(field) || issue.metadata.includes(field)), false);
  }
  const separate = privacyIssues([
    { field: "person.email", category: "identity", severity: "HIGH", value: "a@b.test" },
    { field: "account.username", category: "identity", severity: "LOW", value: "avery" },
    { field: "health.concern", category: "diagnoses", severity: "HIGH", value: "Anxiety" },
  ]);
  assert.deepEqual(separate.map((issue) => issue.fields[0]), ["person.email", "health.concern", "account.username"]);
  const event = { event_id: "post-mitm", source: "mitm", host: "fly-analytics.fly.dev", method: "POST", path: "/collect", timestamp: at(21), body: { full: true }, findings: raw };
  const extension = { ...event, event_id: "post-ext", source: "browser_extension", timestamp: at(20), body: null, findings: [] };
  const simple = toSession([extension, event], { simple: true });
  const shown = simple.destinations[0].requests[0];
  assert.equal(shown.findings.length, 26);
  assert.equal(shown.privacyIssues.length, 12);
  assert.equal(shown.fields.length, 12);
  assert.match(shown.message, /^12 privacy issues/);
  const technical = toSession([extension, event]);
  const captured = technical.destinations[0].requests.find((request) => request.id === "post-mitm");
  assert.equal(captured.findings.length, 26);
  assert.equal(captured.fields.length, 26);
  assert.equal(captured.findings.find((finding) => finding.field === "payment.card_number").value, "4242424242424242");
  assert.match(captured.message, /^26 sensitive fields/);
  for (const observations of [[extension, event], [event, extension]]) {
    assert.equal(privacyIssueCount(observations), 12);
    assert.equal(sensitiveFieldCount(observations), 12);
  }
});

test("an empty event log renders an empty session in both views", () => {
  for (const simple of [true, false]) assert.deepEqual(toSession([], { simple }), { source: { name: "ScriptWell" }, destinations: [], events: [] });
});

test("live observations become a ScriptWell session grouped by host", () => {
  const session = toSession([
    { event_id: "a", host: "fly-analytics.fly.dev", method: "POST", path: "/collect", timestamp: "2026-09-27T00:00:00.000Z", source: "mitm", third_party: true, findings: [{ field: "person.email", severity: "high", detection_method: "rule", confidence: 0.9, value: "a@b.test" }] },
    { event_id: "b", host: "fly-analytics.fly.dev", method: "OPTIONS", path: "/collect", timestamp: "2026-09-27T00:00:02.000Z", source: "browser_extension", body: null, findings: [] },
  ]);
  assert.equal(session.source.name, "ScriptWell");
  assert.equal(session.destinations.length, 1);
  assert.equal(session.destinations[0].requests.length, 2);
  assert.equal(session.events[1].at, 2);
  assert.match(session.destinations[0].requests[0].fields[0].name, /person\.email \(high, rule 90%\)/);
});

test("an incoming destination creates its own node, fields, and event link", () => {
  const session = normalizeSession({ destinations: [{ id: "new-recipient", name: "New recipient", fields: { symptom: "headache", consent: false } }], events: [{ destinationId: "new-recipient", at: 10 }, { destinationId: "missing", at: 2 }] });
  assert.equal(session.nodes.length, 1);
  assert.equal(session.nodes[0].fields[1].value, "false");
  assert.equal(session.nodes[0].position.length, 3);
  assert.equal(session.events.length, 1);
  assert.equal(session.events[0].requestId, session.nodes[0].requests[0].id);
});

test("pause freezes the cursor and dot while the live recording continues", () => {
  const event = { at: 8 };
  const before = { liveTime: 20, cursor: 9, status: "paused" };
  const after = advancePlayback(before, 4);
  assert.equal(after.cursor, 9);
  assert.equal(after.liveTime, 24);
  assert.equal(flightProgress(event, after.cursor), flightProgress(event, before.cursor));
});

test("seeking backward restores an earlier event and the exact transfer position", () => {
  const events = [{ id: "first", at: 0 }, { id: "second", at: 8 }];
  assert.equal(eventAtTime(events, 9).id, "second");
  assert.equal(eventAtTime(events, 1.75).id, "first");
  assert.equal(flightProgress(events[0], 1.75), .5);
  assert.equal(flightProgress(events[0], 5), null);
});

test("replay advances at normal speed and live mode follows the recording edge", () => {
  assert.deepEqual(advancePlayback({ liveTime: 20, cursor: 2, status: "playing" }, 1), { liveTime: 21, cursor: 3, status: "playing" });
  assert.deepEqual(advancePlayback({ liveTime: 20, cursor: 20, status: "live" }, 1), { liveTime: 21, cursor: 21, status: "live" });
});
