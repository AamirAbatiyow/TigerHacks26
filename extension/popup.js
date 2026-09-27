import { loadPrivacyFindings, createPrivacyDraft, discoverPageContacts } from './privacy-findings.mjs';
import { privacyIssueCount } from './sensitive-count.mjs';

document.getElementById('closePopup').addEventListener('click', () => window.close());
document.getElementById('fileForMe').addEventListener('click', () => {
  if (globalThis.chrome?.runtime?.getURL) {
    chrome.tabs.create({ url: chrome.runtime.getURL('filing/index.html') });
  } else {
    window.open(new URL('filing/index.html', window.location.href).href, '_blank', 'noopener');
  }
});
document.getElementById('viewDetails').addEventListener('click', () => {
  if (globalThis.chrome?.runtime?.getURL) {
    chrome.tabs.create({ url: chrome.runtime.getURL('visualization/index.html') });
  } else {
    window.open('http://127.0.0.1:5174/', '_blank', 'noopener');
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.close();
});

const optOutButton = document.getElementById('privacyOptOut');
const optOutLabel = document.getElementById('privacyOptOutLabel');
const findingSelect = document.getElementById('privacyFinding');
const findingReason = document.getElementById('privacyReason');
const findingStatus = document.getElementById('privacyStatus');
let findings = [];
let requestVersion = 0;

function renderFinding(finding) {
  optOutButton.disabled = !finding;
  optOutLabel.textContent = 'Take Privacy Action';
  optOutButton.setAttribute('aria-label', finding ? `Take Privacy Action: ${finding.company}` : 'Select a privacy finding');
  findingReason.textContent = finding ? `${finding.company}: ${finding.reason_label}` : 'Choose a privacy finding.';
  findingStatus.textContent = finding ? 'Review a request locally. Nothing is sent until you approve it.' : 'Select a finding to continue.';
}

async function refreshFindings() {
  const version = ++requestVersion;
  const selectedId = findingSelect.value;
  optOutButton.disabled = true;
  findingStatus.textContent = 'Loading privacy findings…';
  try {
    const nextFindings = await loadPrivacyFindings();
    if (version !== requestVersion) return;
    findings = nextFindings;
    findingSelect.replaceChildren(new Option('Choose a privacy issue', ''));
    for (const finding of findings) {
      findingSelect.add(new Option(`${finding.company} — ${finding.reason_label}`, finding.event_id));
    }
    // Never silently switch to a different issue when a selected finding disappears.
    findingSelect.value = findings.some((f) => f.event_id === selectedId) ? selectedId
      : !selectedId && findings.length === 1 ? findings[0].event_id : '';
    findingSelect.disabled = findings.length === 0;
    renderFinding(findings.find((f) => f.event_id === findingSelect.value));
    if (!findings.length) findingStatus.textContent = 'No privacy findings are available.';
  } catch {
    if (version !== requestVersion) return;
    findings = [];
    findingSelect.replaceChildren(new Option('Findings unavailable', ''));
    findingSelect.disabled = true;
    renderFinding(null);
    findingStatus.textContent = 'Privacy service unavailable. Start the local privacy backend and refresh.';
  }
}

findingSelect.addEventListener('change', () => {
  requestVersion += 1;
  renderFinding(findings.find((f) => f.event_id === findingSelect.value));
});
document.getElementById('refreshPrivacyFindings').addEventListener('click', refreshFindings);

optOutButton.addEventListener('click', async () => {
  const version = ++requestVersion;
  const eventId = findingSelect.value;
  optOutButton.disabled = true;
  try {
    // Re-resolve on click: provider changes and expired strategies must take effect.
    const current = (await loadPrivacyFindings()).find((f) => f.event_id === eventId);
    if (version !== requestVersion || findingSelect.value !== eventId) return;
    renderFinding(current);
    if (!current) { findingStatus.textContent = 'This finding is no longer available. Refresh the issues.'; return; }
    const contacts = await discoverPageContacts();
    if (version !== requestVersion) return;
    const draft = await createPrivacyDraft({event_id: eventId, contacts});
    if (version !== requestVersion) return;
    const query = `?privacy&action=${encodeURIComponent(draft.draft_id)}`;
    if (globalThis.chrome?.runtime?.getURL) {
      await chrome.tabs.create({url: chrome.runtime.getURL(`visualization/index.html${query}`)});
    } else {
      window.open(`http://127.0.0.1:5174/${query}`, '_blank', 'noopener');
    }
  } catch {
    if (version !== requestVersion) return;
    renderFinding(null);
    findingStatus.textContent = 'Could not prepare the local review. Start the local API and refresh.';
  }
});

refreshFindings();

async function refreshCount() {
  try {
    const response = await fetch('http://127.0.0.1:8765/events', { cache: 'no-store' });
    if (!response.ok) throw new Error('Unavailable');
    const { events } = await response.json();
    const records = Array.isArray(events) ? events : [];
    document.getElementById('packetCount').textContent = String(privacyIssueCount(records));
  } catch {
    document.getElementById('packetCount').textContent = 'Unavailable';
  }
}
refreshCount();
