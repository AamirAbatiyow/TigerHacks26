import { useEffect, useState } from 'react';
import { LOCAL_API } from '../data/liveEvents';
import { draftPayload, sendPayload } from '../data/gmailReview';

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

async function gmailRequest(path, options) {
  const response = await fetch(`${LOCAL_API}/api/gmail/${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Gmail is unavailable');
  return data;
}

export default function PrivacyPanel() {
  const [findings, setFindings] = useState([]);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gmail, setGmail] = useState({ connected: false, status: 'disconnected', email: null });
  const [recipients, setRecipients] = useState({});
  const [jurisdiction, setJurisdiction] = useState('');
  const [useName, setUseName] = useState(false);
  const [useEmail, setUseEmail] = useState(false);
  const [holderName, setHolderName] = useState('');
  const [holderEmail, setHolderEmail] = useState('');
  const [review, setReview] = useState(null);
  const [sent, setSent] = useState('');

  useEffect(() => {
    let active = true;
    const refresh = () => Promise.all([request('findings'), request('results'), gmailRequest('status')])
      .then(([input, saved, account]) => {
        if (active) {
          setFindings(input.findings);
          setResults(saved.results);
          setGmail(account);
          setError((current) => current.includes('local_api.py') ? '' : current);
        }
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

  async function connectGmail() {
    setBusy('connect');
    setError('');
    try {
      const result = await gmailRequest('connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      setGmail(result);
    } catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  async function disconnectGmail() {
    setBusy('disconnect');
    setError('');
    try { setGmail(await gmailRequest('disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  async function openReview(eventId) {
    setBusy(eventId);
    setError('');
    setSent('');
    const includeIdentity = {};
    const identity = {};
    if (useName && holderName.trim()) { includeIdentity.first_name = true; identity.first_name = holderName.trim(); }
    if (useEmail && holderEmail.trim()) { includeIdentity.email = true; identity.email = holderEmail.trim(); }
    try {
      const draft = await gmailRequest('draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftPayload({
          eventId,
          to: (recipients[eventId] || '').trim(),
          state: jurisdiction.trim().toUpperCase(),
          includeIdentity,
          identity,
        })),
      });
      if (!draft.to) {
        setError(draft.error || 'No verified privacy email for this destination.');
        return;
      }
      setReview({
        eventId,
        to: draft.to,
        subject: draft.subject,
        body: draft.body,
        recipientSource: draft.recipient_source,
      });
    } catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  async function sendApproved() {
    setBusy('send');
    setError('');
    try {
      const result = await fetch(`${LOCAL_API}/api/gmail/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sendPayload(review)),
      });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error || 'Gmail is unavailable');
      setReview(null);
      setSent(`Request sent from ${data.email || gmail.email}`);
    } catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  const rows = [...findings.map((finding) => results.find((r) => r.event_id === finding.event_id) || finding),
    ...results.filter((r) => !findings.some((f) => f.event_id === r.event_id))];
  const gmailLabel = gmail.status === 'pending'
    ? 'Waiting for Google…'
    : gmail.connected && gmail.email
      ? `Connected as ${gmail.email}`
      : gmail.connected
        ? 'Connected'
        : 'Gmail not connected';

  return (
    <aside className="details-panel privacy-panel">
      <span className="panel-label">Local network findings</span>
      <h2>Privacy Opt-Out</h2>
      <p>These findings come from locally observed requests. Unsupported destinations have no verified opt-out mechanism; processing does not submit a request. Gmail sends only a message you review. It does not guess a privacy address.</p>
      <section className="detail-section gmail-account">
        <h3>Gmail</h3>
        <p role="status">{gmailLabel}</p>
        {gmail.connected
          ? <button type="button" className="privacy-button" disabled={busy !== null} onClick={disconnectGmail}>Disconnect Gmail</button>
          : <button type="button" className="privacy-button" disabled={busy !== null || gmail.status === 'pending'} onClick={connectGmail}>{gmail.status === 'pending' ? 'Waiting for Google…' : 'Connect Gmail'}</button>}
        <label>State abbreviation <input value={jurisdiction} maxLength={2} onChange={(event) => setJurisdiction(event.target.value)} placeholder="Only for a verified deadline" /></label>
        <label><input type="checkbox" checked={useName} onChange={(event) => setUseName(event.target.checked)} /> Include the name I type</label>
        {useName && <input value={holderName} onChange={(event) => setHolderName(event.target.value)} placeholder="Name" />}
        <label><input type="checkbox" checked={useEmail} onChange={(event) => setUseEmail(event.target.checked)} /> Include the email I type</label>
        {useEmail && <input value={holderEmail} onChange={(event) => setHolderEmail(event.target.value)} placeholder="you@example.test" />}
      </section>
      {sent && <p role="status">{sent}</p>}
      {loading && <p role="status">Loading privacy findings…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && rows.length === 0 && <p>No sensitive local findings yet.</p>}
      {review && <section className="gmail-review" role="dialog" aria-modal="true" aria-labelledby="gmail-review-title">
        <h3 id="gmail-review-title">Review email</h3>
        <label>To <input value={review.to} onChange={(event) => setReview({ ...review, to: event.target.value, recipientSource: 'user' })} /></label>
        <label>Subject <input value={review.subject} onChange={(event) => setReview({ ...review, subject: event.target.value })} /></label>
        <label>Message <textarea rows={12} value={review.body} onChange={(event) => setReview({ ...review, body: event.target.value })} /></label>
        <div className="gmail-actions">
          <button type="button" className="privacy-button" disabled={busy !== null || !gmail.connected} onClick={sendApproved}>Send with Gmail</button>
          <button type="button" className="privacy-button" disabled={busy !== null} onClick={() => setReview(null)}>Cancel</button>
        </div>
        {!gmail.connected && <p>Connect Gmail before sending. Nothing is sent when this review opens.</p>}
      </section>}
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
            {!saved && <button type="button" className="privacy-button" disabled={busy !== null} onClick={() => run(row.event_id)}>
              {busy === row.event_id ? 'Processing…' : 'Process finding'}
            </button>}
            <label>Recipient you supply <input value={recipients[row.event_id] || ''} onChange={(event) => setRecipients({ ...recipients, [row.event_id]: event.target.value })} placeholder="Leave blank unless you know the privacy contact" /></label>
            <button type="button" className="privacy-button" disabled={busy !== null} onClick={() => openReview(row.event_id)}>Review email</button>
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
