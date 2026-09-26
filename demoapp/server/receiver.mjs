import http from 'node:http'
import { pathToFileURL } from 'node:url'
import { loadEnvFile } from 'node:process'

// Load optional local configuration without requiring a file to exist.
try { loadEnvFile('.env') } catch (error) { if (error.code !== 'ENOENT') throw error }
export function createReceiver({ allowedOrigin = 'http://localhost:5173', log = console.info } = {}) {
  let acceptedEvents = 0
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Vary', 'Origin')
    if (req.headers.origin === allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    }
    const reply = (status, message) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(message)) }
    if (req.method === 'GET' && req.url === '/health') return reply(200, { service: 'Fictional analytics receiver', accepted_events: acceptedEvents })
    if (req.url !== '/v1/events') return reply(404, { error: 'Not found' })
    if (req.headers.origin !== allowedOrigin) return reply(403, { error: 'Origin not allowed' })
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
    if (req.method !== 'POST') return reply(405, { error: 'POST required' })
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') return reply(415, { error: 'JSON required' })
    try {
      let body = ''
      for await (const chunk of req) {
        body += chunk.toString()
        if (Buffer.byteLength(body) > 32768) { reply(413, { error: 'Body too large' }); return }
      }
      const event = JSON.parse(body)
      if (event?.schema_version !== '1.0' || event?.event_name !== 'offer_confirmed' || typeof event?.event_id !== 'string' || typeof event?.occurred_at !== 'string' || !Number.isFinite(Date.parse(event.occurred_at)) || event?.privacy?.optional_analytics_enabled !== true || typeof event?.person?.full_name !== 'string' || typeof event?.health?.concern !== 'string') return reply(400, { error: 'Invalid event envelope' })
      acceptedEvents++
      // Count only; never log, store, or echo submitted values or identifiers.
      log(`Accepted offer event #${acceptedEvents} at ${new Date().toISOString()}; payload discarded`)
      res.writeHead(204); res.end()
    } catch { if (!res.headersSent) reply(400, { error: 'Invalid JSON request' }) }
  })
  server.requestTimeout = 10000
  server.headersTimeout = 10000
  return server
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.ANALYTICS_PORT || 4318)
  const host = process.env.ANALYTICS_HOST || 'localhost'
  const origin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173'
  const server = createReceiver({ allowedOrigin: origin })
  server.on('error', error => { console.error(`Receiver failed: ${error.message}`); process.exit(1) })
  server.listen(port, host, () => console.info(`Fictional analytics: http://${host}:${port}/v1/events | Allowed origin: ${origin}`))
}
