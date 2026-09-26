import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createReceiver } from '../server/receiver.mjs'
const origin = 'http://localhost:5173'
const event = { schema_version: '1.0', event_name: 'offer_confirmed', event_id: 'fictional-test-id', occurred_at: new Date().toISOString(), privacy: { optional_analytics_enabled: true }, person: { full_name: 'Avery Example' }, health: { concern: 'Fictional anxiety' } }
test('receiver accepts real cross-origin JSON without retaining or echoing health data', async t => {
  const logs = []
  const server = createReceiver({ log: line => logs.push(line) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}`
  const preflight = await fetch(`${base}/v1/events`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin)
  const post = (body, source = origin, type = 'application/json') => fetch(`${base}/v1/events`, { method: 'POST', headers: { Origin: source, 'Content-Type': type }, body })
  const accepted = await post(JSON.stringify(event)); assert.equal(accepted.status, 204); assert.equal(await accepted.text(), '')
  assert.equal((await post(JSON.stringify(event), 'http://unexpected.test')).status, 403)
  assert.equal((await post('not json')).status, 400)
  assert.equal((await post('{}')).status, 400)
  assert.equal((await post(JSON.stringify(event), origin, 'text/plain')).status, 415)
  assert.equal((await post('x'.repeat(33000))).status, 413)
  const health = await (await fetch(`${base}/health`)).json()
  assert.equal(health.accepted_events, 1)
  assert.equal(JSON.stringify(health).includes('Avery'), false)
  assert.equal(logs.length, 1); assert.equal(logs[0].includes('anxiety'), false); assert.equal(logs[0].includes('Avery'), false)
})
