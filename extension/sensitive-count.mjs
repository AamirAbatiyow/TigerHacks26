import { privacyIssues } from "./privacy-issues.mjs";

// Simple-view presentation only. The event store and the technical view keep every observation.
const STATIC_ASSET = /(?:^|\/)favicon\.ico$|\.(?:m?js|css|map|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|otf)$/i;
const BODY_COLLECTORS = new Set(["mitm", "tshark"]);
// Extension observations are stamped before the request is sent; collectors stamp after the response.
export const SAME_REQUEST_MS = 10000;

function when(event) {
  const parsed = Date.parse(event.timestamp || "");
  return Number.isNaN(parsed) ? null : parsed;
}

function hasFindings(event) {
  return Array.isArray(event.findings) && event.findings.length > 0;
}

function requestKey(event) {
  return `${String(event.method || "").toUpperCase()} ${String(event.host || "").toLowerCase()} ${event.path || ""}`;
}

// More findings win. A stored body beats metadata. mitm/tshark beat the extension on a tie of those.
function richness(event) {
  const findings = Array.isArray(event.findings) ? event.findings.length : 0;
  return findings * 100 + (event.body != null ? 10 : 0) + (BODY_COLLECTORS.has(event.source) ? 1 : 0);
}

function poorerTwin(event, peers) {
  const stamp = when(event);
  const score = richness(event);
  return peers.some((other) => {
    if (other === event) return false;
    const otherStamp = when(other);
    const close = stamp === null || otherStamp === null || Math.abs(otherStamp - stamp) <= SAME_REQUEST_MS;
    return close && richness(other) > score;
  });
}

// Hide a metadata or thinner capture of the same method+host+path when a richer
// body-bearing mitm/tshark observation is already inside the dedup window.
// Arrival order does not matter. OPTIONS, page loads, and static assets stay hidden.
export function simpleObservations(observations) {
  const groups = new Map();
  for (const event of observations) {
    const key = requestKey(event);
    groups.set(key, [...(groups.get(key) || []), event]);
  }
  return observations.filter((event) => {
    if (poorerTwin(event, groups.get(requestKey(event)) || [])) return false;
    if (hasFindings(event)) return true;
    const method = String(event.method || "").toUpperCase();
    const path = String(event.path || "").split("?")[0];
    if (method === "OPTIONS" || method === "HEAD" || method === "GET" || STATIC_ASSET.test(path)) return false;
    return true;
  });
}

// User-facing privacy issues on the observations the simple view shows. Raw findings stay on the event.
export function privacyIssueCount(observations) {
  return simpleObservations(observations).reduce(
    (total, event) => total + privacyIssues(event.findings).length,
    0,
  );
}

export const sensitiveFieldCount = privacyIssueCount;
