# HealthTrace extension

`extension/` is the canonical Manifest V3 extension. It retains the teammate popup and the dashboard generated from `frontend/`. There is one background request listener and no JavaScript classifier.

From the repository root:

```sh
npm ci --prefix frontend
npm run build:extension --prefix frontend
python3 'network trace/local_api.py'
```

In Chrome, open `chrome://extensions`, enable Developer mode, and load this directory unpacked. Remove any previously installed **Local Request Observer** to prevent duplicate observations. Reload HealthTrace after changing the manifest, worker, or dashboard bundle.

The worker observes only demo/Fly requests and POSTs metadata only to `http://127.0.0.1:8765/events`. It excludes its own local API traffic. Request bodies and findings come from the shared Python collectors/classifier. The popup reads local counts and privacy previews. The report uses the same local event/ privacy API without a separate backend or runtime mock data.

```sh
node --test extension/tests/*.test.mjs
node --check extension/background.js
node --check extension/popup.js
node --check extension/privacy-findings.mjs
```

See [the integrated guide](../docs/integrated-demo.md) for the full demo and proxy setup. Loading the extension does not configure the browser proxy or install a CA.
