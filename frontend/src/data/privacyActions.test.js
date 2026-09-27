import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mailtoUrl, reviewedEmail, sendWithGmail, gmailLabel, MAILTO_STATUS} from './privacyActions.js';
const review = {draft_id:'draft-1', to:'privacy+request@example.test', subject:'Delete: A & B? café', body:'Please delete.\nA&B + 50% # done ✓', recipient_source:'user', approved:true};

test('mailto encodes the complete reviewed message independently of Gmail', () => {
  const url = mailtoUrl(review);
  const [address, query] = url.slice(7).split('?');
  assert.equal(decodeURIComponent(address), review.to);
  const params = new URLSearchParams(query);
  assert.equal(params.get('subject'), review.subject);
  assert.equal(params.get('body'), review.body);
  assert.equal(params.size, 2);
  assert.equal(MAILTO_STATUS, 'Draft opened in your email app');
  assert.notEqual(MAILTO_STATUS, 'Sent');
});

test('no sending or mailto without explicit review, and discoveries require confirmation', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return {ok:true,json:async()=>({})}; };
  assert.throws(() => sendWithGmail({...review,approved:false},fetcher), /approve/);
  assert.throws(() => mailtoUrl({...review,approved:false}), /approve/);
  assert.throws(() => reviewedEmail({...review,recipient_source:'discovered'}), /Confirm/);
  assert.equal(calls, 0);
  assert.equal(reviewedEmail({...review,recipient_source:'discovered',recipient_confirmed:true}).approved,true);
  for (const to of ['one@example.test,two@example.test', 'x@example.test\r\nBcc:evil@example.test']) {
    assert.throws(() => mailtoUrl({...review,to}), /recipient/);
  }
});

test('Gmail failure leaves the mailto draft usable; only approved email is posted', async () => {
  let posted;
  await assert.rejects(sendWithGmail(review, async (url, options) => {
    posted = {url,payload:JSON.parse(options.body)};
    return {ok:false,json:async()=>({error:'Gmail revoked'})};
  }), /revoked/);
  assert.match(posted.url, /127\.0\.0\.1:8765\/api\/privacy\/actions\/send$/);
  assert.deepEqual(Object.keys(posted.payload).sort(), ['approved','body','draft_id','recipient_confirmed','recipient_source','subject','to']);
  assert.ok(mailtoUrl(review).startsWith('mailto:'));
  assert.equal(gmailLabel({connected:false}), 'Gmail not connected');
  assert.equal(gmailLabel({connected:true,email:'me@gmail.com'}),'Connected as me@gmail.com');
});

test('extension uses EmailJS while the existing dashboard draft code stays separate', () => {
  const popup = fs.readFileSync(new URL('../../../extension/popup.js',import.meta.url),'utf8');
  const panel = fs.readFileSync(new URL('../components/PrivacyPanel.jsx',import.meta.url),'utf8');
  assert.match(popup,/sendWithEmailJS\(/);
  assert.doesNotMatch(popup,/createPrivacyDraft\(|sendWithGmail\(/);
  assert.match(popup,/visualization\/index.html/);
  assert.match(panel,/createPrivacyDraft\(/);
  assert.match(panel,/loadDraft\(id\)/);
  assert.match(panel,/onClick=\{send\}/);
  assert.match(panel,/status: 'mailto_opened'/);
  assert.match(popup,/fileForMe/);
  assert.match(popup,/privacyIssueCount\(/);
  assert.doesNotMatch(panel,/api\/privacy\/run|api\/gmail\/draft/);
});
