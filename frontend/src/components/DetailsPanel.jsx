import ServiceSymbol from "./ServiceSymbol";
import PayloadEvidence from "./PayloadEvidence";

export default function DetailsPanel({ selectedNode: node, selectedRequest: request, mode, onSelectRequest }) {
  if (!node) return <aside className="details-panel empty-panel"><div><h2>Choose a destination</h2><p>Select a destination in either view to see the fields it receives.</p></div></aside>;
  const fields = request?.fields || node.fields || [];
  const issueView = mode !== "technical";
  return <aside className="details-panel data-inspector" style={{ "--service-color": node.color }}>
    <div className="inspector-heading"><div className="inspector-symbol"><ServiceSymbol category={node.category} /></div><div><h2>{node.name}</h2><p>{node.category}</p></div></div>
    <p className="inspector-domain">{node.domain}</p>
    {request && <button className="all-fields" onClick={() => onSelectRequest(null)}>← All fields for this destination</button>}
    <section className="detail-section"><h3>{request ? request.name.replaceAll("_", " ") : "Information received"}</h3><p>{request?.message || node.message}</p></section>
    {(mode !== "technical" || !request) && <section className="detail-section"><h3>{issueView ? "Privacy issues" : "Data fields"} <span className="field-total">{fields.length}</span></h3>
      {fields.length === 0 ? <p>No field values were supplied for this destination.</p> : <dl className="field-list">{fields.map((field) => <div key={field.name}><dt>{field.name.replaceAll("_", " ")}</dt><dd>{field.value}</dd></div>)}</dl>}
    </section>}
    {mode === "technical" && request && <section className="detail-section"><h3>Request details</h3><dl className="field-list"><div><dt>Method</dt><dd>{request.method}</dd></div><div><dt>Endpoint</dt><dd>{request.endpoint}</dd></div><div><dt>Recorded timestamp</dt><dd>{request.timestamp}</dd></div></dl></section>}
    {mode === "technical" && request && <PayloadEvidence observation={request} showUnavailable />}
    {!request && <section className="detail-section request-list"><h3>Requests</h3>{node.requests.map((item) => <button key={item.id} onClick={() => onSelectRequest(item)}><span>{item.name.replaceAll("_", " ")}</span><small>{item.fields.length} {issueView ? (item.fields.length === 1 ? "privacy issue" : "privacy issues") : `fields / ${item.method} ${item.endpoint}`}</small><span className="request-chevron" aria-hidden="true">›</span></button>)}</section>}
    {(request?.sensitive ?? node.sensitive) && <p className="sensitive-note">Contains sensitive information</p>}
  </aside>;
}
