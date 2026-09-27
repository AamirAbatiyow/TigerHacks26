// Extension observations remain strictly local.
// Never forward browser-observability data to Fly.io or any remote service.
// Demo filtering happens in the local API, so this only posts to loopback.
const LOCAL_EVENTS_URL = "http://127.0.0.1:8765/events";
// Exact ScriptWell origins (local and deployed) and the synthetic-data receiver.
// Each must also be listed in manifest.json host_permissions.
const SCRIPTWELL_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173", "https://scriptwell.fly.dev"];
const RECEIVER_ORIGINS = ["https://fly-analytics.fly.dev", "http://fly-analytics.fly.dev"];
const OBSERVED_URLS = [...RECEIVER_ORIGINS, ...SCRIPTWELL_ORIGINS].map((origin) => `${origin}/*`);

function isLocalEventApi(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^\[|\]$/g, "");
    return (host === "127.0.0.1" || host === "localhost" || host === "::1") && parsed.port === "8765";
  } catch (error) {
    return false;
  }
}

function headerValue(headers, name) {
  if (!headers) {
    return null;
  }
  const match = headers.find((header) => header.name.toLowerCase() === name);
  if (!match || !match.value) {
    return null;
  }
  return match.value;
}

function thirdParty(initiator, host) {
  if (!initiator) {
    return null;
  }
  try {
    return new URL(initiator).hostname !== host;
  } catch (error) {
    return null;
  }
}

function observe(details) {
  if (isLocalEventApi(details.url)) {
    return;
  }

  let parsed;
  try {
    parsed = new URL(details.url);
  } catch (error) {
    return;
  }

  const event = {
    timestamp: new Date().toISOString(),
    source: "browser_extension",
    scheme: parsed.protocol.replace(":", ""),
    method: details.method || null,
    host: parsed.hostname || null,
    path: `${parsed.pathname}${parsed.search}`,
    destination_ip: null,
    destination_port: parsed.port ? Number(parsed.port) : (parsed.protocol === "https:" ? 443 : 80),
    content_type: headerValue(details.requestHeaders, "content-type"),
    initiator: details.initiator || null,
    tab_id: details.tabId >= 0 ? details.tabId : null,
    third_party: thirdParty(details.initiator, parsed.hostname),
    request_type: details.type || null,
    body: null
  };

  // Privacy boundary: extension observations are sent only to localhost.
  // Never send extension observability data to Fly.io or any remote service.
  fetch(LOCAL_EVENTS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event)
  }).catch(() => {});
}

chrome.webRequest.onBeforeSendHeaders.addListener(
  observe,
  { urls: OBSERVED_URLS },
  ["requestHeaders"]
);
