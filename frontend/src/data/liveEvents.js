import { privacyIssues } from "../../../extension/privacy-issues.mjs";
import { privacyIssueCount, sensitiveFieldCount, simpleObservations } from "../../../extension/sensitive-count.mjs";

export const LOCAL_API = "http://127.0.0.1:8765";
export { privacyIssueCount, privacyIssues, sensitiveFieldCount, simpleObservations };

function rawFields(findings) {
  return findings.map((finding) => {
    const method = finding.detection_method ? `, ${finding.detection_method} ${Math.round((finding.confidence || 0) * 100)}%` : "";
    return { name: `${finding.field} (${finding.severity}${method})`, value: JSON.stringify(finding.value) };
  });
}

function when(event) {
  const parsed = Date.parse(event.timestamp || "");
  return Number.isNaN(parsed) ? null : parsed;
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
    const issues = privacyIssues(findings);
    const sensitive = (simple ? issues : findings).length > 0;
    const message = sensitive
      ? simple
        ? `${issues.length} privacy issues observed by ${event.source}.`
        : `${findings.length} sensitive fields observed by ${event.source}.`
      : event.body == null
        ? `Metadata observed by ${event.source}; payload unavailable.`
        : simple
          ? `No privacy issues detected by ${event.source}.`
          : `No sensitive fields detected by ${event.source}.`;
    const id = String(event.event_id || `${host}-${index}`);
    const request = {
      id,
      name: `${event.method || "?"} ${event.path || ""}`.trim(),
      method: event.method || "—",
      endpoint: event.path || "—",
      timestamp: event.timestamp || "—",
      source: event.source || "unknown",
      body: event.body,
      bodyType: event.body_type,
      bodySize: event.body_size,
      contentType: event.content_type,
      findings,
      privacyIssues: issues,
      sensitive,
      message,
      fields: simple ? issues.map((issue) => ({ name: issue.title, value: issue.summary })) : rawFields(findings),
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
