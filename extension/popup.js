import { loadPrivacyFindings, officialDestination, actionLabel } from './privacy-findings.mjs';

const openMapButton =
  document.getElementById(
    "openMap"
  );

const viewDetailsButton =
  document.getElementById(
    "viewDetails"
  );

function openVisualization() {
  const visualizationUrl =
    chrome.runtime.getURL(
      "visualization/index.html"
    );

  chrome.tabs.create({
    url: visualizationUrl,
  });
}

openMapButton.addEventListener(
  "click",
  openVisualization
);

viewDetailsButton.addEventListener(
  "click",
  openVisualization
);

const optOutButton = document.getElementById('privacyOptOut');
const optOutLabel = document.getElementById('privacyOptOutLabel');
const findingSelect = document.getElementById('privacyFinding');
const findingReason = document.getElementById('privacyReason');
const findingStatus = document.getElementById('privacyStatus');
let findings = [];
let requestVersion = 0;

function renderFinding(finding) {
  optOutButton.disabled = !officialDestination(finding);
  optOutLabel.textContent = actionLabel(finding);
  optOutButton.setAttribute('aria-label', finding ? `${actionLabel(finding)}: ${finding.company}` : 'Select a privacy finding');
  optOutButton.title = finding ? `Open the verified mechanism for ${finding.company}` : 'Select a privacy finding';
  findingReason.textContent = finding ? `${finding.company}: ${finding.reason_label}` : 'Choose the issue reported by the finding provider.';
  findingStatus.textContent = !finding ? 'Select a finding to continue.'
    : officialDestination(finding) ? 'Opens the official mechanism. No request is submitted by this button.'
    : finding.message || 'No supported verified mechanism is available for this issue.';
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
    // Re-resolve on click: fixture/provider changes and expired strategies must take effect.
    const current = (await loadPrivacyFindings()).find((f) => f.event_id === eventId);
    if (version !== requestVersion || findingSelect.value !== eventId) return;
    renderFinding(current);
    const destination = officialDestination(current);
    if (destination) await chrome.tabs.create({ url: destination });
    else if (!current) findingStatus.textContent = 'This finding is no longer available. Refresh the issues.';
  } catch {
    if (version !== requestVersion) return;
    renderFinding(null);
    findingStatus.textContent = 'Cannot verify the current mechanism. Refresh and try again.';
  }
});

refreshFindings();
