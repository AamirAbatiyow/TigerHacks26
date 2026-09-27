const EMAILJS_URL = 'https://api.emailjs.com/api/v1.0/email/send';
const FLY_CATEGORIES = 'appointments, biometrics, device_identifiers, diagnoses, financial, identity, location, medications, symptoms';
export const DEFAULT_EMAILJS_CONFIG = {
  serviceId: 'service_x5hzo67',
  templateId: 'template_8566ppw',
  publicKey: '1D_yH6dv76MIlT-w6',
};

export function buildOptOutEmail(host = 'fly-analytics.fly.dev') {
  const site = host || 'fly-analytics.fly.dev';
  const categories = site === 'fly-analytics.fly.dev'
    ? ` Categories observed: ${FLY_CATEGORIES}. This list names categories only. ` : ' ';
  return {
    subject: `Privacy request regarding ${site}`,
    body: `I am writing to ${site} (${site}).\n\nRequest: General privacy / deletion request.${categories}\nPlease delete my personal information and cease retaining or using it to the extent required by applicable law. Please confirm receipt and completion within any applicable statutory period. I reserve all rights and remedies available to me.`,
  };
}

// Runs only on the current tab. Checks its mailto links and at most four obvious
// same-origin pages; it returns email addresses, never page text or form values.
export async function findPageEmail() {
  const start = new URL(location.href);
  if (!['https:', 'http:'].includes(start.protocol)) return [];
  const pathHint = /privacy|contact|legal|support|data[-_ ]?(?:request|protection)/i;
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const results = [];
  const seen = new Set();
  const cleanUrl = (value) => {
    const url = new URL(value, start.href);
    if (url.origin !== start.origin) return null;
    url.search = ''; url.hash = '';
    return url.href;
  };
  const add = (email, source, context) => {
    const address = email.trim().toLowerCase();
    if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(address) || seen.has(address)) return;
    seen.add(address);
    const prefix = address.split('@')[0];
    const priority = {privacy: 6, dataprotect: 5, dpo: 5, legal: 4, support: 3, contact: 2, info: 1};
    const score = (priority[prefix] || 0) + (pathHint.test(context) ? 2 : 0);
    results.push({email: address, source_url: source, score});
  };
  const inspect = (doc, source) => {
    for (const link of doc.querySelectorAll('a[href^="mailto:"]')) {
      const context = `${link.textContent || ''} ${link.parentElement?.textContent || ''} ${source}`;
      if (!pathHint.test(context)) continue;
      try { add(decodeURIComponent(link.getAttribute('href').slice(7).split('?')[0]), source, context); }
      catch { /* Ignore malformed mailto links. */ }
    }
    const text = doc.body?.textContent || '';
    for (const match of text.matchAll(emailPattern)) {
      const context = text.slice(Math.max(0, match.index - 80), match.index + match[0].length + 80);
      if (pathHint.test(context)) add(match[0], source, context);
    }
  };
  inspect(document, cleanUrl(start.href));
  const pages = [...document.querySelectorAll('a[href]')]
    .filter((link) => pathHint.test(`${link.textContent || ''} ${link.getAttribute('href') || ''}`))
    .map((link) => { try { return cleanUrl(link.href); } catch { return null; } })
    .filter((url) => url && url !== cleanUrl(start.href));
  await Promise.all([...new Set(pages)].slice(0, 4).map(async (url) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(url, {credentials: 'omit', signal: controller.signal});
      if (!response.ok || !response.headers.get('content-type')?.includes('text/html') || new URL(response.url).origin !== start.origin) return;
      inspect(new DOMParser().parseFromString(await response.text(), 'text/html'), url);
    } catch { /* A blocked or unavailable page does not block manual entry. */ }
    finally { clearTimeout(timeout); }
  }));
  return results.sort((a, b) => b.score - a.score).map(({email, source_url}) => ({email, source_url}));
}

export async function discoverCurrentSite(browser = globalThis.chrome) {
  let host = '';
  try {
    const [tab] = await browser.tabs.query({active: true, currentWindow: true});
    if (tab?.url) host = new URL(tab.url).hostname;
    if (!tab?.id || !browser.scripting) return {host, contacts: []};
    const [result] = await browser.scripting.executeScript({target: {tabId: tab.id}, func: findPageEmail});
    return {host, contacts: Array.isArray(result?.result) ? result.result : []};
  } catch { return {host, contacts: []}; }
}

export async function sendWithEmailJS(config, email, fetcher = fetch) {
  const {serviceId, templateId, publicKey} = config;
  if (!serviceId || !templateId || !publicKey) throw new Error('Set up EmailJS before sending.');
  const response = await fetcher(EMAILJS_URL, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({service_id: serviceId, template_id: templateId, user_id: publicKey,
      template_params: {to_email: email.to, subject: email.subject, message: email.body}}),
  });
  if (!response.ok) throw new Error(`EmailJS could not send (${response.status}): ${(await response.text()).slice(0, 180) || 'Check your EmailJS setup.'}`);
}
