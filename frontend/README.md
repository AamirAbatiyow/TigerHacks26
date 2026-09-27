# HealthTrace frontend

Run `npm install`, then `npm run dev -- --host 127.0.0.1` from this directory. Open http://127.0.0.1:5173/.

Simple view connects the source icon to a linear list of destinations. Technical view shows those destinations in an interactive 3D network. Select a destination to inspect its fields. Switching views preserves playback time.

Pause freezes transfer positions. Drag the timeline to rewind or seek; select an event to replay its transfer. Go live returns to current session time. Transfers travel for 3.5 seconds. The sample session generates a transfer every eight seconds and is labeled Demo session.

## Incoming session data

Pass `sessionData` to `<App />`, or dispatch a replacement snapshot in the page:

```js
window.dispatchEvent(new CustomEvent("healthtrace:session", {
  detail: {
    source: { name: "Patient portal" },
    destinations: [{
      id: "lab",
      name: "City Lab",
      domain: "lab.example",
      category: "API",
      fields: { test_type: "blood panel", patient_id: "demo-42" }
    }],
    events: [{ id: "transfer-1", destinationId: "lab", at: 0, title: "Lab request" }]
  }
}));
```

Destinations generate rows and bubbles automatically; no coordinates are required. Fields accept a name/value object, an array of `{ name, value }` objects, or field names. For multiple requests, supply a destination's `requests` array with `id`, `name`, `method`, `endpoint`, `timestamp`, and `fields`; an event can reference its `requestId`. Event `at` values are seconds from session start. Events with unknown destination IDs are omitted.

Each dispatched snapshot replaces the session and resets playback to its latest event, preserving the selected view. This frontend input interface does not itself capture traffic or connect to a backend. Without supplied data, the app uses the sample session.

## Checks

- `npm test`: normalization and deterministic pause/seek/replay tests.
- `npm run lint`: React and JavaScript checks.
- `npm run build`: production frontend bundle in `dist`.

The separate `npm run build:extension` command updates the extension bundle; it is not needed to run the local frontend.
