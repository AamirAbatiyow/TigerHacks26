// One local action API for the popup and the shared review screen.
export const LOCAL_API = 'http://127.0.0.1:8765';
export const PRIVACY_FINDINGS_URL = `${LOCAL_API}/api/privacy/findings`;

export async function privacyRequest(path, payload, fetcher = fetch) {
  const response = await fetcher(`${LOCAL_API}${path}`, {
    cache: 'no-store',
    ...(payload === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Local privacy service unavailable');
  return data;
}

export async function loadPrivacyFindings(fetcher = fetch) {
  const data = await privacyRequest('/api/privacy/findings', undefined, fetcher);
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

export function createPrivacyDraft(payload, fetcher = fetch) {
  return privacyRequest('/api/privacy/actions/draft', payload, fetcher);
}

// Runs only on the page where the user invoked the extension. No crawling or form values.
export function pageContacts() {
  const source = new URL(location.href);
  source.search = ''; source.hash = '';
  if (!['https:', 'http:'].includes(source.protocol)) return [];
  const contacts = [];
  for (const link of document.querySelectorAll('a[href^="mailto:"]')) {
    const context = `${link.textContent} ${link.parentElement?.textContent || ''} ${document.title}`;
    if (!/privacy|contact|data protection/i.test(context)) continue;
    try {
      const email = decodeURIComponent(link.getAttribute('href').slice(7).split('?')[0]);
      if (/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email) && !contacts.some((c) => c.email === email)) {
        contacts.push({email, source_url: source.href});
      }
    } catch { /* Malformed mailto links are not recipients. */ }
    if (contacts.length === 10) break;
  }
  return contacts;
}

export async function discoverPageContacts(browser = globalThis.chrome) {
  try {
    if (!browser?.scripting) return [];
    const [tab] = await browser.tabs.query({active: true, currentWindow: true});
    if (!tab?.id) return [];
    const [result] = await browser.scripting.executeScript({target: {tabId: tab.id}, func: pageContacts});
    return Array.isArray(result?.result) ? result.result : [];
  } catch { return []; } // Restricted pages still get a manual-recipient review.
}
