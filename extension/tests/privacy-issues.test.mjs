import test from 'node:test';
import assert from 'node:assert/strict';
import { privacyIssues } from '../privacy-issues.mjs';
import { privacyIssueCount } from '../sensitive-count.mjs';

const scriptwell = [
  ['source.support_email', 'scriptwellcontact@gmail.com'],
  ['person.full_name', 'Avery Example'],
  ['person.email', 'avery@example.test'],
  ['person.zip_code', '65201'],
  ['health.weight_lb', '165'],
  ['health.concern', 'Anxiety'],
  ['health.symptoms', 'Restlessness and difficulty sleeping'],
  ['health.duration', '1_to_6_months'],
  ['health.current_medications', 'Daily multivitamin'],
  ['health.medication_allergies', 'Penicillin'],
  ['prescription.medication', 'Sertraline'],
  ['prescription.strength', '50 mg'],
  ['prescription.quantity', '30 tablets'],
  ['payment.cardholder_name', 'Jamie Demo'],
  ['payment.card_number', '4242424242424242'],
  ['payment.expiration', '12/34'],
  ['payment.cvc', '123'],
  ['payment.billing_zip', '64093'],
  ['offer.pharmacy_id', 'meadow'],
  ['offer.pharmacy_name', 'Meadow Pharmacy'],
  ['offer.support_email', 'scriptwellcontact@gmail.com'],
  ['interaction.pharmacy_preference', 'lowest_price'],
  ['interaction.language', 'en-US'],
  ['interaction.viewport_width', '1728'],
  ['privacy.contact_email', 'scriptwellcontact@gmail.com'],
  ['privacy.privacy_email', 'scriptwellcontact@gmail.com'],
].map(([field, value]) => ({ field, value, category: 'identity', severity: 'HIGH' }));

test('extension aggregation matches the ScriptWell privacy issues', () => {
  const issues = privacyIssues(scriptwell);
  assert.equal(scriptwell.length, 26);
  assert.equal(issues.length, 12);
  assert.equal(issues.find((issue) => issue.id === 'email').summary, 'avery@example.test');
  assert.deepEqual(issues.find((issue) => issue.id === 'prescription').fields, ['prescription.medication', 'prescription.strength', 'prescription.quantity']);
  assert.deepEqual(issues.find((issue) => issue.id === 'symptoms').fields, ['health.symptoms', 'health.duration']);
  assert.equal(issues.find((issue) => issue.id === 'payment_card').summary, 'Jamie Demo · •••• 4242 · 12/34 · •••');
  assert.equal(issues.some((issue) => /support_email|contact_email|privacy_email|language|viewport/.test(issue.fields.join(' '))), false);
  const extension = { event_id: 'post-ext', source: 'browser_extension', method: 'POST', host: 'fly-analytics.fly.dev', path: '/collect', timestamp: '2026-09-27T00:00:20.000Z', body: null, findings: [] };
  const mitm = { event_id: 'post-mitm', source: 'mitm', method: 'POST', host: 'fly-analytics.fly.dev', path: '/collect', timestamp: '2026-09-27T00:00:20.020Z', body: { full: true }, findings: scriptwell };
  assert.equal(privacyIssueCount([extension, mitm]), 12);
  assert.equal(privacyIssueCount([mitm, extension]), 12);
});
