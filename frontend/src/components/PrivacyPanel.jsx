import { useEffect, useState } from 'react';
import { LOCAL_API } from '../data/liveEvents';

const statusLabels = {
  READY: 'Ready to process',
  SUBMITTED: 'Request submitted — completion unconfirmed',
  ACTION_REQUIRED: 'Action required — no automatic submission',
  COMPLETED: 'Company confirmed completion',
  UNSUPPORTED: 'Unsupported — skipped',
  FAILED: 'Failed or uncertain — check before retrying',
};

async function request(path, options) {
  const response = await fetch(`${LOCAL_API}/api/privacy/${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Privacy service unavailable');
  return data;
}

export default function PrivacyPanel() {
  const [findings, setFindings] = useState([]);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const refresh = () => Promise.all([request('findings'), request('results')])
      .then(([input, saved]) => {
        if (active) { setFindings(input.findings); setResults(saved.results); setError(''); }
      })
      .catch((err) => { if (active) setError(`${err.message}. Start network trace/local_api.py.`); })
      .finally(() => { if (active) setLoading(false); });
    refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  async function run(eventId) {
    setBusy(eventId);
    setError('');
    try {
      const result = await request('run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId }),
      });
      setResults((current) => [result, ...current.filter((r) => r.event_id !== eventId)]);
    } catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  const rows = [...findings.map((finding) => results.find((r) => r.event_id === finding.event_id) || finding),
    ...results.filter((r) => !findings.some((f) => f.event_id === r.event_id))];

  return (
    <aside className="details-panel privacy-panel">
      <span className="panel-label">Local network findings</span>
      <h2>Privacy opt-out agent</h2>
      <p>These findings come from locally observed requests. Unsupported destinations have no verified opt-out mechanism; processing does not submit a request.</p>
      {loading && <p role="status">Loading privacy findings…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && rows.length === 0 && <p>No sensitive local findings yet.</p>}
      <div aria-live="polite">
        {rows.map((row) => {
          const saved = results.some((r) => r.event_id === row.event_id);
          return <section className="detail-section privacy-result" key={row.event_id}>
            <h3>{row.company}</h3>
            <p>{row.reason_label}</p>
            <p><strong>{statusLabels[row.status]}</strong></p>
            <p>{row.message}</p>
            <dl>
              <dt>Event</dt><dd>{row.event_id}</dd>
              <dt>Right</dt><dd>{row.privacy_right || 'Unmapped'}</dd>
              <dt>Rule</dt><dd>{row.jurisdiction || 'Not established'}</dd>
              <dt>Method</dt><dd>{row.submission_method || 'None'}</dd>
              <dt>Processed</dt><dd>{saved ? (row.processed_at || row.evidence[0]?.at || "Not recorded") : "Not processed"}</dd>
              <dt>Submitted</dt><dd>{row.submitted_at || 'Not submitted'}</dd>
              {row.confirmation && <><dt>Reference</dt><dd>{row.confirmation}</dd></>}
            </dl>
            {!saved && <button className="privacy-button" disabled={busy !== null} onClick={() => run(row.event_id)}>
              {busy === row.event_id ? 'Processing…' : 'Process finding'}
            </button>}
            {row.destination && <p><a href={row.destination} target="_blank" rel="noopener noreferrer">Open official mechanism ↗</a></p>}
            {row.instructions && <p>{row.instructions}</p>}
            {row.evidence.length > 0 && <details>
              <summary>Resolution evidence</summary>
              {row.evidence.map((e, index) => <div key={index}>
                <p>{e.status || "Company evidence"} · {e.at}</p>
                {e.completion_evidence && <p>{e.completion_evidence}</p>}
                {e.source && <p><a href={e.source} target="_blank" rel="noopener noreferrer">Official company source</a> · verified {e.last_verified}</p>}
                {e.rule_source && <p><a href={e.rule_source} target="_blank" rel="noopener noreferrer">Rule source</a></p>}
                {e.applicability && <p>{e.applicability}</p>}
                {e.message && <p>{e.message}</p>}
              </div>)}
            </details>}
          </section>;
        })}
      </div>
      <section className="detail-section">
        <h3>California data-broker deletion</h3>
        <p><a href="https://privacy.ca.gov/drop/" target="_blank" rel="noopener noreferrer">Official DROP guidance ↗</a> covers registered data brokers and requires California residency verification. It is not a substitute for an advertising opt-out and is not submitted by this app.</p>
      </section>
    </aside>
  );
}
