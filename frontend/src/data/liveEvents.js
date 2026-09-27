export const LOCAL_API = "http://127.0.0.1:8765";

function when(event) {
  const parsed = Date.parse(event.timestamp || "");
  return Number.isNaN(parsed) ? null : parsed;
}

// The session views consume destinations and timed events, not the raw observation envelope.
export function toSession(observations) {
  const stamps = observations.map(when).filter((stamp) => stamp !== null);
  const start = stamps.length ? Math.min(...stamps) : 0;
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
