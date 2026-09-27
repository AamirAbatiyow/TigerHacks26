import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { buildView } from '../../frontend/src/data/liveEvents.js';

test('MV3 observer posts metadata locally and excludes its own event API', async () => {
  let observer;
  let listenerCount = 0;
  let observedUrls;
  const calls = [];
  vm.runInNewContext(fs.readFileSync(new URL('../background.js', import.meta.url), 'utf8'), {
    URL, Date, chrome: { webRequest: { onBeforeSendHeaders: { addListener: (fn, filter) => { observer = fn; listenerCount += 1; observedUrls = filter.urls; } } } },
    fetch: async (url, options) => { calls.push({url, event: JSON.parse(options.body)}); },
  });
  assert.equal(listenerCount, 1);
  const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url)));
  assert.deepEqual(Array.from(observedUrls), manifest.host_permissions.filter((url) => !url.includes(':8765/')));
  observer({ url: 'http://[::1]:8765/events', method: 'POST' });
  observer({ url: 'http://127.0.0.1:8765/events', method: 'POST' });
  observer({ url: 'http://localhost:8765/events', method: 'POST' });
  assert.equal(calls.length, 0);
  observer({ url: 'https://fly-analytics.fly.dev/collect', method: 'POST', tabId: 3,
    initiator: 'http://localhost:5173', type: 'xmlhttprequest', requestHeaders: [{name:'Content-Type',value:'application/json'}] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:8765/events');
  assert.equal(calls[0].event.body, null);
  assert.equal(calls[0].event.tab_id, 3);
  assert.equal(calls[0].event.third_party, true);
  observer({ url: 'https://fly-analytics.fly.dev/collect', method: 'POST', tabId: 4,
    initiator: 'https://scriptwell.fly.dev', type: 'xmlhttprequest', requestHeaders: [] });
  assert.equal(calls[1].url, 'http://127.0.0.1:8765/events');
  assert.equal(calls[1].event.initiator, 'https://scriptwell.fly.dev');
  assert.equal(calls[1].event.third_party, true);
  assert.ok(observedUrls.includes('https://scriptwell.fly.dev/*'));
  assert.ok(!observedUrls.some((url) => url.includes('*.')), 'no wildcard hosts');
});

test('dashboard preserves canonical fields and never fabricates empty events', () => {
  assert.deepEqual(buildView([]), {nodes: [], events: []});
  const event = {event_id:'real-1', host:'fly-analytics.fly.dev', timestamp:'2026-01-01T00:00:00Z', source:'mitm', method:'POST', path:'/collect', body:{email:'demo@example.test'}, findings:[{field:'email',value:'demo@example.test',category:'identity',severity:'HIGH'}]};
  const {nodes, events} = buildView([event]);
  assert.equal(events[0].timestamp, event.timestamp);
  assert.deepEqual(nodes[0].requests[0].findings, event.findings);
  assert.equal(nodes[0].requests[0].fields[0].value, '"demo@example.test"');
});


test('canonical MV3 package contains its worker, popup, and generated dashboard assets', () => {
  const root = new URL('../../', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL('extension/manifest.json', root)));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.background, {service_worker: 'background.js'});
  assert.ok(manifest.permissions.includes('webRequest'));
  assert.ok(manifest.host_permissions.includes('http://127.0.0.1:8765/*'));
  assert.ok(!manifest.host_permissions.includes('<all_urls>'));
  for (const path of [manifest.background.service_worker, manifest.action.default_popup, ...Object.values(manifest.icons)]) {
    assert.ok(fs.existsSync(new URL(`extension/${path}`, root)), path);
  }
  const html = fs.readFileSync(new URL('extension/visualization/index.html', root), 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)];
  assert.ok(assets.length >= 2, 'built dashboard JS and CSS must exist');
  for (const [, path] of assets) assert.ok(fs.existsSync(new URL(path, new URL('extension/visualization/', root))), path);
  for (const path of ['network trace/extension', 'extensions', 'demo app']) {
    assert.ok(!fs.existsSync(new URL(path, root)), `duplicate/deprecated directory: ${path}`);
  }
});
