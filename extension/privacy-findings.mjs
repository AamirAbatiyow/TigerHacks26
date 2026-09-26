// This is the application's local backend, not a company opt-out destination.
// A future fetching service plugs into PrivacyFindingProvider on that backend.
export const PRIVACY_FINDINGS_URL = 'http://127.0.0.1:8080/api/privacy/findings';

export async function loadPrivacyFindings(fetcher = fetch, extensionId = globalThis.chrome?.runtime?.id) {
  const response = await fetcher(PRIVACY_FINDINGS_URL, { cache: 'no-store', headers: extensionId ? { 'X-HealthTrace-Extension': extensionId } : {} });
  if (!response.ok) throw new Error('Privacy finding service unavailable');
  const data = await response.json();
  if (!Array.isArray(data.findings)) throw new Error('Invalid privacy finding response');
  const ids = new Set();
  for (const finding of data.findings) {
    if (typeof finding.event_id !== 'string' || !finding.event_id || ids.has(finding.event_id)
        || typeof finding.company !== 'string' || typeof finding.reason_label !== 'string') {
      throw new Error('Invalid privacy finding response');
    }
    ids.add(finding.event_id);
  }
  return data.findings;
}

export function officialDestination(finding) {
  if (!finding || !['READY', 'ACTION_REQUIRED'].includes(finding.status)
      || !finding.privacy_right || !finding.strategy_id || !finding.jurisdiction) return null;
  try {
    const url = new URL(finding.destination);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    // Preserve exactly the same destination used by the dashboard link.
    return finding.destination;
  } catch { return null; }
}

export function actionLabel(finding) {
  if (finding?.privacy_right === 'deletion') return 'Request deletion';
  if (finding?.privacy_right === 'limit_sensitive_data') return 'Limit sensitive data';
  return 'Opt out';
}
