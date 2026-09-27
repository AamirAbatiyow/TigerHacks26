function displayValue(value) {
  if (value === undefined) return "undefined";
  const encoded = JSON.stringify(value, null, 2);
  return encoded === undefined ? String(value) : encoded;
}

export default function PayloadEvidence({ observation, showUnavailable = false }) {
  const findings = Array.isArray(observation?.findings) ? observation.findings : [];
  const payload = observation?.body;
  const hasPayload = payload !== null && payload !== undefined;

  if (!observation && !showUnavailable) return null;

  return <section className="detail-section payload-evidence" aria-label="Local payload evidence">
    <div className="evidence-heading">
      <h3>Local payload evidence</h3>
      <span>Never added to the privacy email</span>
    </div>

    <details className="evidence-disclosure" open={findings.length > 0}>
      <summary>Sensitive data identified <strong>{findings.length}</strong></summary>
      {findings.length === 0
        ? <p>No sensitive values were identified in this captured payload.</p>
        : <div className="sensitive-evidence-list">{findings.map((finding, index) =>
          <article className="sensitive-evidence" key={`${finding.field || "field"}-${index}`}>
            <div className="sensitive-evidence-title">
              <code>{finding.field || "Unknown field"}</code>
              <span>{finding.category || "uncategorized"}</span>
              {finding.severity && <span>{finding.severity}</span>}
            </div>
            <pre>{displayValue(finding.value)}</pre>
            <p>{finding.reason || "Matched by the local classifier."}</p>
            {(finding.detection_method || Number.isFinite(finding.confidence)) &&
              <small>{finding.detection_method || "classifier"}{Number.isFinite(finding.confidence) ? ` · ${Math.round(finding.confidence * 100)}% confidence` : ""}</small>}
          </article>)}</div>}
    </details>

    <details className="evidence-disclosure">
      <summary>Complete captured payload</summary>
      {hasPayload ? <>
        <dl className="payload-metadata">
          <div><dt>Collector</dt><dd>{observation.source || "unknown"}</dd></div>
          <div><dt>Format</dt><dd>{observation.bodyType || observation.body_type || typeof payload}</dd></div>
          {(observation.bodySize ?? observation.body_size) != null && <div><dt>Captured size</dt><dd>{observation.bodySize ?? observation.body_size} bytes</dd></div>}
        </dl>
        <pre className="raw-payload">{displayValue(payload)}</pre>
      </> : <p>Payload unavailable. Browser-extension observations contain request metadata only; open the matching mitmproxy or tshark capture to inspect its body.</p>}
    </details>
  </section>;
}
