const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { buildBriefView } = require('./daily-brief-view.cjs');

async function render(t, preview = false) {
  const folder = path.join(__dirname, 'daily-brief');
  const dom = new JSDOM(fs.readFileSync(path.join(folder, 'index.html'), 'utf8'), { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const actions = [];
  let ready = false;
  const view = buildBriefView({
    date: '2026-11-17',
    planner: { count: 1, items: [{ title: '<img src=x onerror="alert(1)">', minutes: 30 }] },
    reattempts: { count: 5, complete: false, items: [{ label: 'Graphs' }] },
    concepts: { count: 0, complete: true, items: [] }
  }, { preview });
  dom.window.dailyBrief = {
    get: async () => view,
    ready: () => { ready = true; },
    act: (action) => actions.push(action)
  };
  dom.window.eval(fs.readFileSync(path.join(folder, 'renderer.js'), 'utf8'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ready, true);
  return { document: dom.window.document, window: dom.window, actions };
}

test('the brief renders saved text safely and routes each action without altering learning records', async (t) => {
  const { document, window, actions } = await render(t);
  assert.equal(document.querySelectorAll('img[onerror]').length, 0);
  assert.equal(document.querySelectorAll('img').length, 1); // Only the packaged brand asset.
  assert.match(document.getElementById('focus-title').textContent, /<img/);
  assert.equal(document.getElementById('partial').hidden, false);
  assert.equal(document.activeElement.id, 'primary');
  document.getElementById('primary').click();
  document.querySelector('[data-action="today"]').click();
  document.querySelector('[data-action="concepts"]').click();
  document.getElementById('snooze').click();
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.deepEqual(actions, ['planner', 'today', 'concepts', 'snooze', 'dismiss']);
});

test('preview is clearly labelled and has no snooze control', async (t) => {
  const { document } = await render(t, true);
  assert.equal(document.getElementById('snooze').hidden, true);
  assert.equal(document.getElementById('schedule').textContent, 'PREVIEW');
  assert.equal(document.getElementById('dismiss').textContent, 'Close preview');
  assert.match(document.getElementById('footer-note').textContent, /unchanged/);
});
