const pause = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

// Center each step inside the document's own scroll area at a deliberate pace.
export function scrollToField(panel, target) {
  const start = panel.scrollTop;
  const panelBounds = panel.getBoundingClientRect();
  const targetBounds = target.getBoundingClientRect();
  const destination = Math.max(0, Math.min(
    panel.scrollHeight - panel.clientHeight,
    start + targetBounds.top - panelBounds.top - panel.clientTop
      - (panel.clientHeight - targetBounds.height) / 2,
  ));
  return new Promise((resolve) => {
    let started;
    function frame(now) {
      started ??= now;
      const progress = Math.min((now - started) / 550, 1);
      const eased = progress * progress * (3 - 2 * progress);
      panel.scrollTop = start + (destination - start) * eased;
      if (progress < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

export async function autofill(document, wait = pause, scroll = scrollToField) {
  const panel = document.querySelector('.document-panel');
  const status = document.getElementById('filingProgress');
  const submitButton = document.getElementById('submitFiling');
  const success = document.getElementById('filingSuccess');
  let submitted = false;
  panel.hidden = false;
  status.hidden = false;
  success.hidden = true;
  submitButton.addEventListener('click', () => {
    if (submitted) return;
    submitted = true;
    panel.hidden = true;
    status.hidden = true;
    success.hidden = false;
    success.focus({ preventScroll: true });
  });
  const steps = [
    { selector: '[name="question-1"][value="Yes"]', label: 'Question 1', answer: 'Yes' },
    { selector: '[name="question-2"][value="Yes"]', label: 'Question 2', answer: 'Yes' },
    { selector: '[name="question-3"][value="No"]', label: 'Question 3', answer: 'No' },
    { selector: '[name="question-4"][value="Yes"]', label: 'Question 4', answer: 'Yes' },
    { selector: '#signature', label: 'Signature', answer: 'Avery Example' },
    { selector: '#name', label: 'Name', answer: 'Avery Example' },
    { selector: '#date', label: 'Date', answer: '2026-09-27' },
  ];

  // Start fresh on every page opening, including browser-restored field values.
  for (const input of panel.querySelectorAll('input')) {
    if (input.type === 'radio') input.checked = false;
    else input.value = '';
  }
  panel.scrollTop = 0;
  await wait(600);
  if (submitted) return;

  for (const step of steps) {
    const input = document.querySelector(step.selector);
    const target = input.closest('.question') || input;
    status.textContent = `Moving to ${step.label.toLowerCase()}…`;
    await scroll(panel, target);
    if (submitted) return;
    target.classList.add('autofill-active');
    status.textContent = `Filling ${step.label.toLowerCase()}…`;
    await wait(350);
    if (submitted) return;
    input.focus({ preventScroll: true });
    if (input.type === 'radio') {
      input.click();
    } else if (input.type === 'date') {
      input.value = step.answer;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      for (const character of step.answer) {
        input.value += character;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await wait(55);
        if (submitted) return;
      }
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    status.textContent = `${step.label}: ${input.type === 'date' ? '09/27/2026' : step.answer}`;
    await wait(700);
    if (submitted) return;
    target.classList.remove('autofill-active');
    input.blur();
  }
  status.textContent = 'Answers filled in. Moving to Submit…';
  await scroll(panel, submitButton);
  if (submitted) return;
  submitButton.classList.add('autofill-active');
  submitButton.focus({ preventScroll: true });
  status.textContent = 'Answers filled in. Review your answers and click Submit when ready.';
}

if (typeof document !== 'undefined') autofill(document);
