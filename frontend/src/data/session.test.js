import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSession, advancePlayback, flightProgress, eventAtTime } from "./session.js";

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
