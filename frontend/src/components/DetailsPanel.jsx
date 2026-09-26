export default function DetailsPanel({
  selectedNode,
  selectedRequest,
  mode,
}) {
  if (!selectedNode) {
    return (
      <aside className="details-panel empty-panel">
        <div>
          <span className="panel-label">
            Network inspector
          </span>

          <h2>
            Select a service
          </h2>

          <p>
            Click a destination in
            the network to inspect
            its requests.
          </p>
        </div>
      </aside>
    );
  }

  if (!selectedRequest) {
    return (
      <aside className="details-panel">
        <span className="panel-label">
          Service
        </span>

        <h2>
          {selectedNode.name}
        </h2>

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
            Requests observed
          </h3>

          <div className="service-request-count">
            <strong>
              {
                selectedNode
                  .requests
                  .length
              }
            </strong>

            <span>
              requests during this
              session
            </span>
          </div>
        </section>

        <section className="detail-section">
          <h3>Destination</h3>

          <p>
            {selectedNode.domain}
          </p>
        </section>

        <p className="sidebar-hint">
          Select a request bubble
          to inspect its contents.
        </p>
      </aside>
    );
  }

  if (mode === "normal") {
    return (
      <aside className="details-panel">
        <div className="panel-header">
          <div>
            <span className="panel-label">
              Data event
            </span>

            <h2>
              {
                selectedRequest.name
              }
            </h2>
          </div>

          {selectedRequest.sensitive && (
            <span className="sensitive-badge">
              Sensitive
            </span>
          )}
        </div>

        <p className="request-service">
          {selectedNode.name}
        </p>

        <section className="detail-section">
          <h3>
            What happened
          </h3>

          <p className="human-summary">
            {
              selectedRequest.message
            }
          </p>
        </section>

        <section className="detail-section">
          <h3>
            Information observed
          </h3>

          <div className="observed-fields">
            {selectedRequest.fields.map(
              (field) => (
                <div
                  className="observed-field"
                  key={
                    field.name
                  }
                >
                  <span>
                    {field.name.replaceAll(
                      "_",
                      " "
                    )}
                  </span>

                  <strong>
                    {field.value}
                  </strong>
                </div>
              )
            )}
          </div>
        </section>

        <section className="detail-section">
          <h3>
            Destination
          </h3>

          <p>
            {selectedNode.domain}
          </p>
        </section>
      </aside>
    );
  }

  return (
    <aside className="details-panel">
      <div className="panel-header">
        <div>
          <span className="panel-label">
            Request inspector
          </span>

          <h2>
            {selectedRequest.name}
          </h2>
        </div>

        {selectedRequest.sensitive && (
          <span className="sensitive-badge">
            Sensitive
          </span>
        )}
      </div>

      <section className="detail-section">
        <h3>Request</h3>

        <div className="request-grid">
          <span>Method</span>

          <strong>
            {
              selectedRequest.method
            }
          </strong>

          <span>Domain</span>

          <strong>
            {selectedNode.domain}
          </strong>

          <span>Endpoint</span>

          <strong>
            {
              selectedRequest.endpoint
            }
          </strong>

          <span>Timestamp</span>

          <strong>
            {
              selectedRequest.timestamp
            }
          </strong>
        </div>
      </section>

      <section className="detail-section">
        <h3>
          Payload fields
        </h3>

        <div className="payload-block">
          {selectedRequest.fields.map(
            (field) => (
              <div
                className="payload-row"
                key={
                  field.name
                }
              >
                <span>
                  {field.name}
                </span>

                <strong>
                  {field.value}
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
            {
              selectedRequest.category
            }
          </strong>

          <span>Sensitive</span>

          <strong>
            {selectedRequest.sensitive
              ? "Yes"
              : "No"}
          </strong>
        </div>
      </section>
    </aside>
  );
}