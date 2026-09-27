import test from 'node:test';
import assert from 'node:assert/strict';
import { autofill } from '../filing/autofill.mjs';

test('autofill scrolls before each answer, pauses visibly, and starts fresh every time', async () => {
  const actions = [];
  const selectors = [
    '[name="question-1"][value="Yes"]',
    '[name="question-2"][value="Yes"]',
    '[name="question-3"][value="No"]',
    '[name="question-4"][value="Yes"]',
    '#signature', '#name', '#date',
  ];
  const inputs = selectors.map((selector, index) => ({
    type: index < 4 ? 'radio' : index === 6 ? 'date' : 'text',
    value: index < 4 ? index === 2 ? 'No' : 'Yes' : 'Old value',
    checked: true,
    classList: { add() {}, remove() {} },
    closest() { return null; },
    focus() { actions.push(`focus:${selector}`); },
    click() { this.checked = true; actions.push(`click:${selector}`); },
    dispatchEvent(event) { actions.push(`${event.type}:${selector}`); },
    blur() {},
  }));
  const panel = { scrollTop: 100, querySelectorAll: () => inputs };
  const status = {};
  const success = { focus() { actions.push('success:focus'); } };
  const submit = {
    classList: { add() {} },
    addEventListener(_, listener) { this.listener = listener; },
    focus() { actions.push('submit:focus'); },
    click() { actions.push('submit:click'); this.listener(); },
  };
  const document = {
    querySelector: (selector) => selector === '.document-panel' ? panel : inputs[selectors.indexOf(selector)],
    getElementById: (id) => ({ filingProgress: status, submitFiling: submit, filingSuccess: success })[id],
  };
  const wait = async (duration) => { actions.push(`wait:${duration}`); };
  const scroll = async (_, target) => { actions.push(`scroll:${target === submit ? 'submit' : selectors[inputs.indexOf(target)]}`); };

  for (let run = 0; run < 2; run += 1) {
    actions.length = 0;
    await autofill(document, wait, scroll);
    assert.deepEqual(inputs.slice(0, 4).map((input) => input.checked), [true, true, true, true]);
    assert.deepEqual(inputs.slice(4).map((input) => input.value), ['Adem Erdogan', 'Adem Erdogan', '2026-09-27']);
    assert.equal(panel.hidden, false);
    assert.equal(status.hidden, false);
    assert.equal(success.hidden, true);
    assert.deepEqual(actions.slice(-2), ['scroll:submit', 'submit:focus']);
    assert.equal(actions.includes('submit:click'), false);
    assert.equal(actions.filter((action) => action === 'wait:700').length, 7);
    selectors.forEach((selector) => {
      const position = actions.indexOf(`scroll:${selector}`);
      assert.ok(position >= 0);
      assert.equal(actions[position + 1], 'wait:350');
      assert.equal(actions[position + 2], `focus:${selector}`);
    });
    assert.ok(actions.indexOf(`click:${selectors[0]}`) < actions.indexOf(`scroll:${selectors[1]}`));
    assert.ok(actions.indexOf(`click:${selectors[1]}`) < actions.indexOf(`scroll:${selectors[2]}`));
    submit.click();
    assert.equal(panel.hidden, true);
    assert.equal(status.hidden, true);
    assert.equal(success.hidden, false);
  }

  // A manual submission also shows the confirmation and stops pending autofill.
  actions.length = 0;
  await autofill(document, async () => { submit.click(); }, scroll);
  assert.deepEqual(actions, ['submit:click', 'success:focus']);
  assert.equal(panel.hidden, true);
  assert.equal(status.hidden, true);
  assert.equal(success.hidden, false);
});
