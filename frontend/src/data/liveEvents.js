export const LOCAL_API = "http://127.0.0.1:8765";

function when(event) {
  const parsed = Date.parse(event.timestamp || "");
  return Number.isNaN(parsed) ? null : parsed;
}

const STATIC_ASSET = /(?:^|\/)favicon\.ico$|\.(?:m?js|css|map|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|otf)$/i;
const BODY_COLLECTORS = new Set(["mitm", "tshark"]);
// Extension observations are stamped before sending, collector observations after the response.
const SAME_REQUEST_MS = 10000;

function hasFindings(event) {
  return Array.isArray(event.findings) && event.findings.length > 0;
}

function requestKey(event) {
  return `${String(event.method || "").toUpperCase()} ${String(event.host || "").toLowerCase()} ${event.path || ""}`;
}

// Presentation filter for the simple view only; the store and technical view keep every observation.
// Other sources are never merged: an empty metadata record is hidden only when a collector saw the
// same request with its body.
export function simpleObservations(observations) {
  const richer = new Map();
  for (const event of observations) {
    if (!BODY_COLLECTORS.has(event.source) || (event.body == null && !hasFindings(event))) continue;
    const key = requestKey(event);
    richer.set(key, [...(richer.get(key) || []), when(event)]);
  }
  return observations.filter((event) => {
    if (hasFindings(event)) return true;
    const method = String(event.method || "").toUpperCase();
    const path = String(event.path || "").split("?")[0];
    if (method === "OPTIONS" || method === "HEAD" || method === "GET" || STATIC_ASSET.test(path)) return false;
    if (event.body != null) return true;
    const stamp = when(event);
    return !(richer.get(requestKey(event)) || []).some((other) =>
      stamp === null || other === null || Math.abs(other - stamp) <= SAME_REQUEST_MS);
  });
}

// The session views consume destinations and timed events, not the raw observation envelope.
// simple: show only meaningful disclosures; timing stays anchored to the full recording.
export function toSession(allObservations, { simple = false } = {}) {
  const stamps = allObservations.map(when).filter((stamp) => stamp !== null);
  const start = stamps.length ? Math.min(...stamps) : 0;
  const observations = simple ? simpleObservations(allObservations) : allObservations;
  const groups = new Map();
  const events = observations.map((event, index) => {
    const host = event.host || "unknown";
    const findings = Array.isArray(event.findings) ? event.findings : [];
    const sensitive = findings.length > 0;
    const message = sensitive
      ? `${findings.length} sensitive fields observed by ${event.source}.`
      : event.body == null
        ? `Metadata observed by ${event.source}; payload unavailable.`
        : `No sensitive fields detected by ${event.source}.`;
    const id = String(event.event_id || `${host}-${index}`);
    const request = {
      id,
      name: `${event.method || "?"} ${event.path || ""}`.trim(),
      method: event.method || "—",
      endpoint: event.path || "—",
      timestamp: event.timestamp || "—",
      findings,
      sensitive,
      message,
      fields: findings.map((finding) => {
        const method = finding.detection_method ? `, ${finding.detection_method} ${Math.round((finding.confidence || 0) * 100)}%` : "";
        return { name: `${finding.field} (${finding.severity}${method})`, value: JSON.stringify(finding.value) };
      }),
    };
    if (!groups.has(host)) {
      groups.set(host, {
        id: host,
        name: host,
        domain: host,
        category: event.third_party === false ? "First party" : "Unknown",
        sensitive: false,
        message: "Requests observed locally. Multiple collectors may observe the same request.",
        requests: [],
      });
    }
    const node = groups.get(host);
    node.requests.push(request);
    node.sensitive ||= sensitive;
    const stamp = when(event);
    return {
      id,
      destinationId: host,
      requestId: id,
      at: stamp === null ? index : Math.max(0, (stamp - start) / 1000),
      title: request.name,
      timestamp: event.timestamp,
      sensitive,
    };
  });
  return { source: { name: "ScriptWell" }, destinations: [...groups.values()], events };
}
