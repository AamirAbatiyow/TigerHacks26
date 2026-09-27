import { privacyRequest, createPrivacyDraft, loadPrivacyFindings } from '../../../extension/privacy-findings.mjs';
export { createPrivacyDraft, loadPrivacyFindings };
export const loadDraft = (id) => privacyRequest(`/api/privacy/actions/draft?id=${encodeURIComponent(id)}`);
export const gmailStatus = () => privacyRequest('/api/gmail/status');
export const connectGmail = () => privacyRequest('/api/gmail/connect', {});
export const disconnectGmail = () => privacyRequest('/api/gmail/disconnect', {});

export function reviewedEmail(review) {
  if (!review || !review.approved) throw new Error('Review and approve this recipient and message first.');
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(review.to?.trim() || '')
      || !review.subject?.trim() || /[\r\n]/.test(review.subject) || !review.body?.trim()
      || review.to.length > 254 || review.subject.length > 200 || review.body.length > 8000) {
    throw new Error('Enter one recipient email, a subject, and the complete message.');
  }
  if (review.recipient_source === 'discovered' && !review.recipient_confirmed) {
    throw new Error('Confirm the discovered email and its page source.');
  }
  return {approved: true, draft_id: review.draft_id, to: review.to.trim(), subject: review.subject.trim(), body: review.body,
    recipient_source: review.recipient_source || 'user', recipient_confirmed: Boolean(review.recipient_confirmed)};
}

export function mailtoUrl(review) {
  const {to, subject, body} = reviewedEmail(review);
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export const sendWithGmail = (review, fetcher) => privacyRequest('/api/privacy/actions/send', reviewedEmail(review), fetcher);
export const MAILTO_STATUS = 'Draft opened in your email app';

export function gmailLabel(account) {
  if (account.status === 'pending') return 'Waiting for Google…';
  return account.connected ? `Connected as ${account.email || 'your Google account'}` : 'Gmail not connected';
}
