# HealthTrace frontend

This is the single dashboard source for both the standalone UI and the polished MV3 extension. It reads real observations and privacy findings from `http://127.0.0.1:8765`; there is no mock playback or fallback.

From the repository root:

```sh
npm ci --prefix frontend
npm run dev --prefix frontend
```

Open `http://127.0.0.1:5174`. Start `python3 'network trace/local_api.py'` in another terminal. The demo health app uses port 5173.

```sh
npm run lint --prefix frontend
npm run build --prefix frontend
npm run build:extension --prefix frontend
```

The last command generates `extension/visualization/` from this source. Reload the canonical unpacked `extension/` in Chrome after building. The popup's **View detailed report** opens that bundle; both views use the same local API.

See [the full demo guide](../docs/integrated-demo.md) for collectors, browser proxy/CA setup, and verification.
