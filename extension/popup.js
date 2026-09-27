import {DEFAULT_EMAILJS_CONFIG, buildOptOutEmail, discoverCurrentSite, sendWithEmailJS} from './email-opt-out.mjs';

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
const dialog = document.getElementById('optOutDialog');
const recipient = document.getElementById('recipientEmail');
const subject = document.getElementById('emailSubject');
const body = document.getElementById('emailBody');
const sendButton = document.getElementById('sendEmail');
const sendStatus = document.getElementById('sendStatus');
const contactStatus = document.getElementById('contactStatus');
const siteLabel = document.getElementById('currentWebsite');
const configFields = {
  serviceId: document.getElementById('emailjsService'),
  templateId: document.getElementById('emailjsTemplate'),
  publicKey: document.getElementById('emailjsPublicKey'),
};
let lookupVersion = 0;
let recipientEdited = false;
let sending = false;

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !dialog.open) window.close();
});
recipient.addEventListener('input', () => { recipientEdited = true; });
document.getElementById('cancelEmail').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { lookupVersion += 1; document.body.classList.remove('review-open'); });

async function loadConfig() {
  const saved = await globalThis.chrome?.storage?.local?.get('emailjsConfig');
  const config = {...DEFAULT_EMAILJS_CONFIG, ...saved?.emailjsConfig};
  if (config.templateId === 'service_x5hzo67') config.templateId = DEFAULT_EMAILJS_CONFIG.templateId;
  for (const [key, field] of Object.entries(configFields)) field.value = config[key] || '';
  document.getElementById('emailjsSetup').open = !config.serviceId || !config.templateId || !config.publicKey;
}

document.getElementById('privacyOptOut').addEventListener('click', async () => {
  const version = ++lookupVersion;
  recipientEdited = false;
  recipient.value = '';
  sendStatus.textContent = '';
  sendButton.disabled = false;
  sendButton.textContent = 'Send email';
  contactStatus.textContent = 'Looking for a privacy contact…';
  let activeTab;
  try { [activeTab] = await globalThis.chrome?.tabs?.query({active: true, currentWindow: true}) || []; }
  catch { /* Manual entry still works without tab access. */ }
  let host = '';
  try { host = new URL(activeTab?.url).hostname; } catch { /* Manual review still works. */ }
  siteLabel.textContent = host ? `Current website: ${host}` : 'Current website unavailable';
  const draft = buildOptOutEmail(host);
  subject.value = draft.subject;
  body.value = draft.body;
  await loadConfig().catch(() => { document.getElementById('emailjsSetup').open = true; });
  document.body.classList.add('review-open');
  dialog.showModal();
  const {contacts} = await discoverCurrentSite();
  if (version !== lookupVersion || !dialog.open) return;
  if (contacts.length && !recipientEdited) recipient.value = contacts[0].email;
  contactStatus.textContent = contacts.length
    ? `Found on ${contacts[0].source_url}. Check the address before sending.`
    : 'No contact found. Enter the recipient email yourself.';
});

sendButton.addEventListener('click', async () => {
  if (sending) return;
  if (!recipient.reportValidity() || !subject.reportValidity() || !body.reportValidity()) return;
  const config = Object.fromEntries(Object.entries(configFields).map(([key, field]) => [key, field.value.trim()]));
  if (Object.values(config).some((value) => !value)) {
    document.getElementById('emailjsSetup').open = true;
    sendStatus.textContent = 'Enter your EmailJS service ID, template ID, and public key.';
    return;
  }
  sending = true;
  sendButton.disabled = true;
  sendStatus.textContent = 'Sending…';
  try {
    try { await globalThis.chrome?.storage?.local?.set({emailjsConfig: config}); }
    catch { /* Saving preferences must not block an approved email. */ }
    await sendWithEmailJS(config, {to: recipient.value.trim(), subject: subject.value.trim(), body: body.value.trim()});
    sendButton.textContent = 'Sent ✓';
    sendStatus.textContent = 'Email sent.';
    document.getElementById('privacyStatus').textContent = 'Opt-out email sent.';
  } catch (error) {
    sendButton.disabled = false;
    sendStatus.textContent = error.message || 'Email could not be sent.';
  } finally { sending = false; }
});

Promise.resolve(globalThis.chrome?.tabs?.query({active: true, currentWindow: true})).then(([tab] = []) => {
  try { siteLabel.textContent = `Current website: ${new URL(tab.url).hostname}`; }
  catch { siteLabel.textContent = 'Current website unavailable'; }
}).catch(() => { siteLabel.textContent = 'Current website unavailable'; });

async function refreshCount() {
  try {
    const response = await fetch('http://127.0.0.1:8765/events', { cache: 'no-store' });
    if (!response.ok) throw new Error('Unavailable');
    const { events } = await response.json();
    document.getElementById('packetCount').textContent = String(events.length);
  } catch {
    document.getElementById('packetCount').textContent = 'Unavailable';
  }
}
refreshCount();
