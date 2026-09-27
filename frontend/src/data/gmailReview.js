/** Pure request builders. Neither function contacts Gmail. */

export function draftPayload({ eventId, to, state, includeIdentity, identity }) {
  const payload = {
    event_id: eventId,
    include_identity: includeIdentity || {},
    identity: identity || {},
  };
  if (to) payload.to = to;
  if (state) payload.state = state;
  return payload;
}

export function sendPayload(review) {
  if (!review || !String(review.to || "").trim() || !String(review.subject || "").trim() || !String(review.body || "").trim()) {
    throw new Error("Review To, Subject, and the full message before sending.");
  }
  return {
    approved: true,
    to: review.to,
    subject: review.subject,
    body: review.body,
    recipient_source: review.recipientSource,
    event_id: review.eventId,
  };
}
