# HealthTrace frontend

This is the single dashboard source for both the standalone UI and the polished MV3 extension. It reads real observations and privacy findings from `http://127.0.0.1:8765`; there is no mock playback or fallback.

From the repository root:

```sh
npm ci --prefix frontend
npm run dev --prefix frontend
```

Open `http://127.0.0.1:5174`. Start `python3 'network trace/local_api.py'` in another terminal, or run `./start_demo.sh`. The demo health app uses port 5173.

Simple view connects the ScriptWell source to a linear list of destinations. Technical view shows those destinations in an interactive 3D network. Select a destination to inspect its fields. Switching views preserves playback time.

Pause freezes transfer positions. Drag the timeline to rewind or seek; select an event to replay its transfer. Go live returns to current session time. Transfers travel for 3.5 seconds. Events come from the local API, polled every two seconds, and the header shows the connection state.

```sh
npm test --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
npm run build:extension --prefix frontend
```

`npm test` covers session normalization and deterministic pause/seek/replay. The last command generates `extension/visualization/` from this source. Reload the canonical unpacked `extension/` in Chrome after building. The popup's **View detailed report** opens that bundle; both views use the same local API.

The page also accepts a replacement snapshot, which resets playback to that snapshot's latest event and keeps the selected view. This is a display interface, not a capture path:

```js
window.dispatchEvent(new CustomEvent("healthtrace:session", {
  detail: {
    source: { name: "ScriptWell" },
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

Destinations generate rows and bubbles automatically; no coordinates are required. Fields accept a name/value object, an array of `{ name, value }` objects, or field names. Without a dispatched snapshot, the dashboard shows the live local observations.

See [the full demo guide](../docs/integrated-demo.md) for collectors, the launcher, and verification.
