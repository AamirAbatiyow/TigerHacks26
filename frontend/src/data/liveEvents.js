export const LOCAL_API = 'http://127.0.0.1:8765';

// Presentation only: retain the canonical event and its server-classified findings.
export function buildView(observations) {
  const groups = new Map();
  const events = observations.map((event) => {
    const id = event.event_id;
    const host = event.host || 'unknown';
    const sensitive = event.findings.length > 0;
    const category = [...new Set(event.findings.map((f) => f.category))].join(', ') || 'Metadata';
    const message = sensitive ? `${event.findings.length} sensitive fields observed by ${event.source}.`
      : event.body == null ? `Metadata observed by ${event.source}; payload unavailable.` : `No sensitive fields detected by ${event.source}.`;
    const request = { ...event, id, name: `${event.method} ${event.path}`, endpoint: event.path,
      sensitive, category, message,
      fields: event.findings.map((f) => {
        const method = f.detection_method ? `, ${f.detection_method} ${Math.round(f.confidence * 100)}%` : '';
        return { name: `${f.field} (${f.severity}${method})`, value: JSON.stringify(f.value) };
      }) };
    if (!groups.has(host)) groups.set(host, { id: host, name: host, domain: host,
      category: event.third_party === false ? 'First party' : 'Unknown',
      color: event.third_party === false ? '#22D3EE' : '#FBBF24', sensitive: false,
      message: 'Requests observed locally. Multiple collectors may observe the same request.', requests: [] });
    const node = groups.get(host);
    node.requests.push(request);
    node.sensitive ||= sensitive;
    return { ...event, runtimeId: id, nodeId: host, requestId: id, title: request.name, detail: message, sensitive };
  });
  const nodes = [...groups.values()].map((node, index, all) => ({ ...node,
    position: [Math.cos(index * 2 * Math.PI / all.length) * 2.7, Math.sin(index * 2 * Math.PI / all.length) * 2.2, 0] }));
  return { nodes, events };
}
