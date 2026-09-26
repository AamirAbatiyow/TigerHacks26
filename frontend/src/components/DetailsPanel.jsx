export default function DetailsPanel({
  selectedNode,
  mode,
}) {
  if (!selectedNode) {
    return (
      <aside className="details-panel empty-panel">
        <div className="empty-state">
          <span className="panel-label">
            Network inspector
          </span>

          <h2>
            Select a service
          </h2>

          <p>
            Click a node, connection,
            or timeline event to inspect
            its data flow.
          </p>

          <span className="keyboard-hint">
            Esc clears selection
          </span>
        </div>
      </aside>
    );
  }

  if (mode === "normal") {
    return (
      <aside className="details-panel">
        <div className="panel-header">
          <div>
            <span className="panel-label">
              What happened
            </span>

            <h2>
              {selectedNode.name}
            </h2>
          </div>

          {selectedNode.sensitive && (
            <span className="sensitive-badge">
              Sensitive
            </span>
          )}
        </div>

        <div className="category-row">
          <span
            className="category-dot"
            style={{
              background:
                selectedNode.color,
            }}
          />

          {selectedNode.category}
        </div>

        <section className="detail-section">
          <h3>Summary</h3>

          <p className="human-summary">
            {selectedNode.message}
          </p>
        </section>

        <section className="detail-section">
          <h3>
            Information observed
          </h3>

          <div className="field-list">
            {selectedNode.fields.map(
              (field) => (
                <div
                  className="field human-field"
                  key={field}
                >
                  {field
                    .replaceAll(
                      "_",
                      " "
                    )}
                </div>
              )
            )}
          </div>
        </section>

        <section className="detail-section">
          <h3>Destination</h3>

          <div className="destination-block">
            <strong>
              {selectedNode.domain}
            </strong>

            <span>
              {selectedNode.category}
            </span>
          </div>
        </section>
      </aside>
    );
  }

  return (
    <aside className="details-panel">
      <div className="panel-header">
        <div>
          <span className="panel-label">
            Technical inspector
          </span>

          <h2>
            {selectedNode.name}
          </h2>
        </div>

        {selectedNode.sensitive && (
          <span className="sensitive-badge">
            Sensitive
          </span>
        )}
      </div>

      <div className="category-row">
        <span
          className="category-dot"
          style={{
            background:
              selectedNode.color,
          }}
        />

        {selectedNode.category}
      </div>

      <section className="detail-section">
        <h3>Request</h3>

        <div className="request-grid">
          <span>Method</span>
          <strong>
            {selectedNode.method}
          </strong>

          <span>Domain</span>
          <strong>
            {selectedNode.domain}
          </strong>

          <span>Endpoint</span>
          <strong>
            {selectedNode.endpoint}
          </strong>

          <span>Protocol</span>
          <strong>HTTPS</strong>
        </div>
      </section>

      <section className="detail-section">
        <h3>
          Observed payload
        </h3>

        <div className="payload-block">
          {selectedNode.fields.map(
            (field, index) => (
              <div
                className="payload-row"
                key={field}
              >
                <span>{field}</span>

                <strong>
                  {index === 0
                    ? "observed"
                    : "present"}
                </strong>
              </div>
            )
          )}
        </div>
      </section>

      <section className="detail-section">
        <h3>
          Classification
        </h3>

        <div className="request-grid">
          <span>Type</span>
          <strong>
            {selectedNode.category}
          </strong>

          <span>Sensitive</span>
          <strong>
            {selectedNode.sensitive
              ? "Yes"
              : "No"}
          </strong>
        </div>
      </section>
    </aside>
  );
}