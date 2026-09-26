export default function DetailsPanel({ selectedNode }) {
  if (!selectedNode) {
    return (
      <aside className="details-panel empty-panel">
        <div>
          <span className="panel-label">Network inspector</span>
          <h2>Select a connection</h2>
          <p>
            Click a service in the network to inspect the observed data flow.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="details-panel">
      <span className="panel-label">Selected destination</span>

      <h2>{selectedNode.name}</h2>

      <div className="category-row">
        <span
          className="category-dot"
          style={{ background: selectedNode.color }}
        />
        {selectedNode.category}
      </div>

      <section className="detail-section">
        <h3>Observed data</h3>

        <div className="field-list">
          {selectedNode.fields.map((field) => (
            <div className="field" key={field}>
              {field}
            </div>
          ))}
        </div>
      </section>

      <section className="detail-section">
        <h3>Request</h3>

        <div className="request-grid">
          <span>Method</span>
          <strong>{selectedNode.method}</strong>

          <span>Endpoint</span>
          <strong>{selectedNode.endpoint}</strong>

          <span>Status</span>
          <strong>Observed</strong>
        </div>
      </section>

      <section className="detail-section">
        <h3>Summary</h3>

        <p>
          This service received information during the current browsing
          session.
        </p>
      </section>
    </aside>
  );
}