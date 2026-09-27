import { useEffect, useRef, useState } from 'react';
import { createPrivacyDraft, loadPrivacyFindings, loadDraft, gmailStatus, connectGmail, disconnectGmail,
  reviewedEmail, mailtoUrl, sendWithGmail, MAILTO_STATUS, gmailLabel } from '../data/privacyActions';
import PayloadEvidence from './PayloadEvidence';

export default function PrivacyPanel({ observations = [] }) {
  const [findings, setFindings] = useState([]);
  const [review, setReview] = useState(null);
  const [gmail, setGmail] = useState({connected: false});
  const [error, setError] = useState('');
  const [accountError, setAccountError] = useState('');
  const [delivery, setDelivery] = useState(null);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState('');
  const [loading, setLoading] = useState(true);
  const sending = useRef(false);
  const opened = useRef(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      // Gmail failure never blocks findings, draft review, or the email-app fallback.
      const [input, account] = await Promise.allSettled([loadPrivacyFindings(), gmailStatus()]);
      if (!active) return;
      if (input.status === 'fulfilled') setFindings(input.value);
      else setError(input.reason.message);
      if (account.status === 'fulfilled') {
        setGmail(account.value); setAccountError(account.value.error || '');
      } else { setGmail({connected: false}); setAccountError('Gmail unavailable. Open in Email App still works.'); }
      setLoading(false);
    };
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('action');
    if (!id || opened.current) return;
    // A popup-created draft is already local; mounting this screen never sends mail.
    loadDraft(id).then((draft) => { opened.current = true; setReview(draft); }).catch((err) => setError(err.message));
  }, []);

  async function takeAction(eventId) {
    setBusy(true); setError(''); setDelivery(null);
    try { setReview(await createPrivacyDraft({event_id: eventId, ...(state ? {state: state.toUpperCase()} : {})})); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function accountAction(connect) {
    setBusy(true); setAccountError('');
    try { setGmail(await (connect ? connectGmail() : disconnectGmail())); }
    catch (err) { setAccountError(err.message); }
    finally { setBusy(false); }
  }

  function edit(patch) {
    setReview((current) => ({...current, ...patch, approved: false}));
    setDelivery(null);
  }

  async function send() {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError('');
    try {
      const result = await sendWithGmail(review);
      setDelivery({status: 'gmail_sent', message: `Sent with Gmail from ${result.email || gmail.email}. Request completion is not confirmed.`});
      setReview((current) => ({...current, approved: false, attempted: true}));
    } catch (err) {
      setError(`${err.message} Open in Email App remains available. If the outcome is uncertain, check Gmail Sent before sending another copy.`);
      setReview((current) => ({...current, attempted: true}));
    } finally { sending.current = false; setBusy(false); }
  }

  let href = '';
  try { if (review) { reviewedEmail(review); href = mailtoUrl(review); } } catch { /* Show editable fields until ready. */ }
  const sourceLabels = {verified: 'Verified strategy contact', discovered: 'Discovered on the observed page — not verified', user: 'Manually entered by you', demo: 'ScriptWell demo contact'};
  const reviewObservation = review ? observations.find((event) => event.event_id === review.event_id) : null;

  return <aside className="details-panel privacy-panel">
    <span className="panel-label">Local network findings</span>
    <h2>Privacy actions</h2>
    <p>Choose a finding, review a request, then decide how to send it. Drafts stay local until you approve delivery.</p>
    <section className="detail-section gmail-account">
      <h3>Gmail</h3><p role="status">{gmailLabel(gmail)}</p>
      <button type="button" className="privacy-button" disabled={busy || gmail.status === 'pending'} onClick={() => accountAction(!gmail.connected)}>{gmail.connected ? 'Disconnect' : 'Connect Gmail'}</button>
      {accountError && <p role="alert">{accountError}</p>}
      <p>You can always use your normal email app without connecting Gmail.</p>
    </section>
    {error && <p role="alert">{error}</p>}
    {delivery && <p role="status" data-delivery-status={delivery.status}>{delivery.message}</p>}
    {review ? <section className="gmail-review" aria-labelledby="privacy-review-title">
      <h3 id="privacy-review-title">Review privacy request</h3>
      <p><strong>Company / app:</strong> {review.organization}</p>
      <p><strong>Observed destination:</strong> {review.observed_destination}</p>
      <p><strong>Request type:</strong> {review.request_type}</p>
      <p>{review.legal_basis === 'verified' ? 'Verified legal strategy available' : 'General request — no verified statutory action'}</p>
      <p>{review.instructions}</p>
      {review.legal_source && <a href={review.legal_source} target="_blank" rel="noopener noreferrer">Verified strategy source</a>}
      {review.official_destination && <p><a href={review.official_destination} target="_blank" rel="noopener noreferrer">Open official mechanism</a> — email does not complete this process.</p>}
      <p><strong>Detected categories:</strong> {review.category_summary || review.categories.join(', ') || 'None listed'}. Raw captured values are not included in the generated email.</p>
      <PayloadEvidence observation={reviewObservation} showUnavailable />
      {review.recipient_candidates.length > 1 && <label>Discovered contacts<select defaultValue="" onChange={(e) => {
        const candidate = review.recipient_candidates[Number(e.target.value)];
        edit({to: candidate.email, recipient_source: 'discovered', recipient_evidence: candidate.source_url, recipient_confirmed: false});
      }}><option value="" disabled>Select a contact to review</option>{review.recipient_candidates.map((c, i) => <option key={i} value={i}>{c.email} — {c.source_url}</option>)}</select></label>}
      <label>Recipient email<input type="email" maxLength={254} value={review.to || ''} onChange={(e) => edit({to: e.target.value, recipient_source: 'user', recipient_confirmed: false, recipient_evidence: null})} placeholder="Enter the organization's contact email" /></label>
      <p>{sourceLabels[review.recipient_source] || 'No contact was found. Enter a recipient; no address was guessed.'}</p>
      {review.recipient_evidence && <p>Source: <a href={review.recipient_evidence} target="_blank" rel="noopener noreferrer">{review.recipient_evidence}</a></p>}
      {review.recipient_source === 'discovered' && <label><input type="checkbox" checked={Boolean(review.recipient_confirmed)} onChange={(e) => edit({recipient_confirmed: e.target.checked})} /> I confirm this discovered contact is the intended recipient.</label>}
      <label>Subject<input maxLength={200} value={review.subject} onChange={(e) => edit({subject: e.target.value})} /></label>
      <label>Message<textarea rows={12} maxLength={8000} value={review.body} onChange={(e) => edit({body: e.target.value})} /></label>
      <label><input type="checkbox" checked={Boolean(review.approved)} onChange={(e) => setReview({...review, approved: e.target.checked})} /> I reviewed and approve this recipient and message.</label>
      <div className="gmail-actions">
        <button type="button" className="privacy-button" disabled={busy || !gmail.connected || !href || review.attempted} onClick={send}>Send with Gmail</button>
        <a className="privacy-button" href={href || undefined} aria-disabled={!href || busy} onClick={(event) => {
          if (!href || busy) { event.preventDefault(); return; }
          setDelivery({status: 'mailto_opened', message: MAILTO_STATUS});
        }}>Open in Email App</a>
        <button type="button" className="privacy-button" disabled={busy} onClick={() => { setReview(null); setDelivery(null); setError(''); }}>Cancel</button>
      </div>
      <p>Opening an email app does not mean the request was sent. Your mail client handles the final send.</p>
    </section> : <>
      <label>State (optional, for verified rules)<input maxLength={2} value={state} onChange={(e) => setState(e.target.value)} placeholder="e.g. CA; leave blank if unknown" /></label>
      {loading && <p role="status">Loading findings…</p>}
      {!loading && !findings.length && <p>No sensitive local findings yet.</p>}
      {findings.map((finding) => <section className="detail-section" key={finding.event_id}>
        <h3>{finding.company}</h3><p>{finding.reason_label}</p>
        <button type="button" className="privacy-button" disabled={busy} onClick={() => takeAction(finding.event_id)}>Take Privacy Action</button>
      </section>)}
    </>}
  </aside>;
}
