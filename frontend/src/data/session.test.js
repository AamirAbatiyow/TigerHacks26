import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSession, advancePlayback, flightProgress, eventAtTime } from "./session.js";
import { simpleObservations, toSession } from "./liveEvents.js";

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
