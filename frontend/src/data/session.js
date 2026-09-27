export const FLIGHT_SECONDS = 3.5;
const colors = { Analytics: "#8b5cf6", Advertising: "#ec4899", API: "#2dd4bf", "First party": "#22d3ee", Unknown: "#fbbf24" };

function fieldsFrom(value = []) {
  if (!value || typeof value !== "object") return [];
  const entries = Array.isArray(value) ? value : Object.entries(value).map(([name, fieldValue]) => ({ name, value: fieldValue }));
  return entries.filter((field) => field != null).map((field, index) => typeof field === "string"
    ? { name: field, value: "Observed" }
    : { name: String(field.name ?? `field_${index + 1}`), value: typeof field.value === "object" ? JSON.stringify(field.value) : String(field.value ?? "Observed") });
}

// Both visualizations consume this model. Incoming destinations need no layout coordinates.
export function normalizeSession(input = {}) {
  const destinations = Array.isArray(input.destinations) ? input.destinations : [];
  const nodes = destinations.map((destination, index) => {
    const id = String(destination.id ?? `destination-${index}`);
    const category = destination.category || "Unknown";
    const angle = (index / Math.max(destinations.length, 1)) * Math.PI * 2 + Math.PI / 4;
    const requests = (destination.requests?.length ? destination.requests : [{ fields: destination.fields }]).map((request, requestIndex) => ({
      ...request,
      id: String(request.id ?? `${id}-request-${requestIndex}`),
      name: request.name || "Data sent",
      method: request.method || "—",
      endpoint: request.endpoint || "—",
      timestamp: request.timestamp || "—",
      message: request.message || destination.message || "These fields were included in the request.",
      sensitive: Boolean(request.sensitive ?? destination.sensitive),
      fields: fieldsFrom(request.fields),
    }));
    return {
      ...destination, id, category, requests,
      name: destination.name || destination.domain || id,
      domain: destination.domain || "Destination not provided",
      message: destination.message || "Select a request to see the fields sent to this destination.",
      color: destination.color || colors[category] || colors.Unknown,
      position: destination.position || [Math.cos(angle) * 2.9, Math.sin(angle) * 2.3, Math.sin(angle * 2) * .5],
      fields: [...new Map(requests.flatMap((request) => request.fields).map((field) => [field.name, field])).values()],
    };
  });
  const ids = new Set(nodes.map((node) => node.id));
  const events = (Array.isArray(input.events) ? input.events : []).map((event, index) => {
    const nodeId = String(event.destinationId ?? event.nodeId ?? "");
    const node = nodes.find((item) => item.id === nodeId);
    return { ...event, id: String(event.id ?? `event-${index}`), nodeId, at: Math.max(0, Number(event.at) || 0), requestId: event.requestId || node?.requests[0]?.id, title: event.title || "Data sent", sensitive: Boolean(event.sensitive ?? node?.sensitive) };
  }).filter((event) => ids.has(event.nodeId)).sort((a, b) => a.at - b.at);
  return { source: { name: input.source?.name || "MyHealth App" }, nodes, events };
}

export function eventAtTime(events, time) {
  return events.findLast((event) => event.at <= time) || null;
}

export function flightProgress(event, time) {
  if (!event || time < event.at || time > event.at + FLIGHT_SECONDS) return null;
  return Math.min(1, (time - event.at) / FLIGHT_SECONDS);
}

export function advancePlayback(state, delta) {
  const liveTime = state.liveTime + delta;
  if (state.status === "paused") return { ...state, liveTime };
  const cursor = state.status === "live" ? liveTime : Math.min(state.cursor + delta, liveTime);
  return { liveTime, cursor, status: cursor >= liveTime ? "live" : "playing" };
}

export function formatTime(time) {
  const seconds = Math.max(0, Math.floor(time));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
