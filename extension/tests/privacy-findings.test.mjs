import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadPrivacyFindings, officialDestination, actionLabel } from '../privacy-findings.mjs';

const ads = {
  event_id: 'ads', company: 'Company A', reason_label: 'Advertising issue',
  privacy_right: 'targeted_advertising_opt_out', status: 'READY',
  strategy_id: 'company-a-ads', jurisdiction: 'California',
  destination: 'https://example.com/official-ads',
};
const deletion = {
  ...ads, event_id: 'delete', company: 'Company B', reason_label: 'Deletion issue',
  privacy_right: 'deletion', strategy_id: 'company-b-deletion',
  destination: 'https://example.org/official-deletion',
};

function popup(initial) {
  const nodes = new Map();
  const opened = [];
  let data = initial;
  for (const id of ['openMap', 'viewDetails', 'privacyOptOut', 'privacyOptOutLabel', 'privacyFinding',
    'privacyReason', 'privacyStatus', 'refreshPrivacyFindings']) {
    nodes.set(id, {
      value: '', listeners: {}, disabled: false, textContent: '',
      addEventListener(event, callback) { this.listeners[event] = callback; },
      setAttribute(name, value) { this[name] = value; },
      replaceChildren() { this.value = ''; }, add() {},
    });
  }
  const source = fs.readFileSync(new URL('../popup.js', import.meta.url), 'utf8').replace(/^import[^\n]+\n/, '');
  vm.runInNewContext(source, {
    loadPrivacyFindings: async () => { if (data instanceof Error) throw data; return typeof data === 'function' ? data() : data; },
    officialDestination, actionLabel,
    Option: class { constructor(label, value) { this.label = label; this.value = value; } },
    document: { getElementById: (id) => nodes.get(id) },
    chrome: { runtime: { getURL: (path) => path }, tabs: { create: ({ url }) => opened.push(url) } },
  });
  return { nodes, opened, setData: (next) => { data = next; } };
}
const flush = () => new Promise(setImmediate);

test('loader uses application provider API, validates response, and identifies extension', async () => {
  let request;
  const rows = await loadPrivacyFindings(async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ findings: [ads] }) };
  }, 'a'.repeat(32));
  assert.equal(rows[0].event_id, ads.event_id);
  assert.match(request.url, /\/api\/privacy\/findings$/);
  assert.equal(request.options.headers['X-HealthTrace-Extension'], 'a'.repeat(32));
  await assert.rejects(loadPrivacyFindings(async () => ({ ok: false })), /unavailable/);
  await assert.rejects(loadPrivacyFindings(async () => ({ ok: true, json: async () => ({ findings: [ads, ads] }) })), /Invalid/);
});

test('multiple issues require selection; button follows selected company/right', async () => {
  const { nodes, opened } = popup([ads, deletion]);
  await flush();
  assert.equal(nodes.get('privacyOptOut').disabled, true);
  nodes.get('privacyFinding').value = 'delete';
  nodes.get('privacyFinding').listeners.change();
  assert.equal(nodes.get('privacyOptOutLabel').textContent, 'Request deletion');
  assert.match(nodes.get('privacyReason').textContent, /Company B/);
  await nodes.get('privacyOptOut').listeners.click();
  assert.deepEqual(opened, [deletion.destination]);
  nodes.get('privacyFinding').value = 'ads';
  nodes.get('privacyFinding').listeners.change();
  assert.equal(nodes.get('privacyOptOutLabel').textContent, 'Opt out');
  await nodes.get('privacyOptOut').listeners.click();
  assert.equal(opened[1], ads.destination);
});

test('fresh provider destination wins over cached popup destination', async () => {
  const ui = popup([ads]);
  await flush();
  assert.equal(ui.nodes.get('privacyOptOut').disabled, false);
  ui.setData([{ ...ads, destination: 'https://example.com/updated-choice' }]);
  await ui.nodes.get('privacyOptOut').listeners.click();
  assert.deepEqual(ui.opened, ['https://example.com/updated-choice']);
});

test('removed, unsupported, stale, unsafe, and unavailable findings never open a fallback', async () => {
  for (const next of [[], [{ ...ads, status: 'UNSUPPORTED', destination: null }],
    [{ ...ads, destination: 'javascript:alert(1)' }], new Error('offline')]) {
    const ui = popup([ads]);
    await flush();
    ui.setData(next);
    await ui.nodes.get('privacyOptOut').listeners.click();
    assert.equal(ui.nodes.get('privacyOptOut').disabled, true);
    assert.deepEqual(ui.opened, []);
  }
});

test('empty response disables button; refresh adopts a new sole finding', async () => {
  const ui = popup([]);
  await flush();
  assert.equal(ui.nodes.get('privacyOptOut').disabled, true);
  ui.setData([deletion]);
  await ui.nodes.get('refreshPrivacyFindings').listeners.click();
  assert.equal(ui.nodes.get('privacyOptOutLabel').textContent, 'Request deletion');
  await ui.nodes.get('privacyOptOut').listeners.click();
  assert.deepEqual(ui.opened, [deletion.destination]);
});

test('changing selected issue cancels an in-flight click for the old issue', async () => {
  const ui = popup([ads, deletion]);
  await flush();
  ui.nodes.get('privacyFinding').value = 'ads';
  ui.nodes.get('privacyFinding').listeners.change();
  let resolve;
  ui.setData(() => new Promise((done) => { resolve = done; }));
  const click = ui.nodes.get('privacyOptOut').listeners.click();
  ui.nodes.get('privacyFinding').value = 'delete';
  ui.nodes.get('privacyFinding').listeners.change();
  resolve([ads, deletion]);
  await click;
  assert.deepEqual(ui.opened, []);
  assert.equal(ui.nodes.get('privacyOptOutLabel').textContent, 'Request deletion');
});
