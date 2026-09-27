import ServiceSymbol from "./ServiceSymbol";

export default function SimpleFlow({ source, nodes, selectedNodeId, activeEvent, progress, onSelect }) {
  const destination = nodes.find((node) => node.id === activeEvent?.nodeId);
  return <section className="simple-view" aria-label="Simple data flow">
    <div className="simple-heading"><h2>Where your data goes</h2><p>Choose a destination to see the information it receives.</p></div>
    <div className="simple-flow">
      <div className="simple-source"><div className="source-icon"><img src="./healthtrace-mark.svg" alt="PatientPrivy" /></div><div className="source-transfer" aria-hidden="true">{progress !== null && <i className="transfer-dot" style={{ left: `${progress * 100}%` }} />}</div><h3>{source.name}</h3><p>Your data starts here</p></div>
      <div className="flow-bridge" aria-hidden="true"><span className="bridge-arrow">→</span></div>
      <div className="simple-destinations" aria-label="Data destinations">
        {nodes.length === 0 && <p className="empty-destinations">No destinations have been received yet.</p>}
        {nodes.map((node) => <button key={node.id} className={`destination-row ${selectedNodeId === node.id ? "selected" : ""} ${progress !== null && activeEvent?.nodeId === node.id ? "receiving" : ""}`} style={{ "--destination-color": node.color }} onClick={() => onSelect(node)} aria-pressed={selectedNodeId === node.id}>
          <span className="destination-symbol"><ServiceSymbol category={node.category} /></span><span className="destination-copy"><strong>{node.name}</strong><small>{node.fields.length ? node.fields.slice(0, 2).map((field) => field.name.replaceAll("_", " ")).join(", ") : "No fields supplied"}{node.fields.length > 2 ? ` +${node.fields.length - 2}` : ""}</small></span><span className="destination-count">{node.fields.length} {node.fields.length === 1 ? "privacy issue" : "privacy issues"}</span><span aria-hidden="true">›</span>
        </button>)}
      </div>
    </div>
    <p className="simple-current">{progress !== null && destination ? `${activeEvent.title} → ${destination.name}` : "Use the timeline to follow a transfer, pause it, or go back in time."}</p>
  </section>;
}
