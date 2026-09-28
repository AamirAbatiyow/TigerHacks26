export const SCRIPTWELL_COLOR = "#ef4444";
const SCRIPTWELL_ORIGINS = new Set(["https://scriptwell.fly.dev", "http://localhost:5173", "http://127.0.0.1:5173"]);

function parseUrl(value) {
  try { return typeof value === "string" ? new URL(value) : null; }
  catch { return null; }
}

// Demo emphasis only: this never changes findings, severity, or privacy issues.
export function isScriptWellEvent(event = {}) {
  if ([event.initiator, event.origin].some((origin) => SCRIPTWELL_ORIGINS.has(parseUrl(origin)?.origin))) return true;
  const destination = parseUrl(`http://${event.host || ""}`);
  const host = destination?.hostname.replace(/\.$/, "");
  if (host === "scriptwell.fly.dev") return true;
  const port = destination?.port || String(event.destination_port || "");
  if (["localhost", "127.0.0.1"].includes(host) && port === "5173") return true;
  return host === "fly-analytics.fly.dev" && String(event.method).toUpperCase() === "POST"
    && String(event.path || "").split(/[?#]/)[0] === "/collect";
}
