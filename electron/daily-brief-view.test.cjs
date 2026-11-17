const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBriefView } = require('./daily-brief-view.cjs');

const empty = () => ({
  date: '2026-11-17',
  planner: { count: 0, items: [] },
  reattempts: { count: 0, complete: true, items: [] },
  concepts: { count: 0, complete: true, items: [] }
});

test('a saved commitment leads; the full workload is not presented as a daily target', () => {
  const brief = empty();
  brief.planner = { count: 12, items: Array.from({ length: 8 }, (_, i) => ({ title: `Block ${i + 1}`, minutes: 20 })) };
  brief.reattempts = { count: 200, complete: false, items: [{ label: 'Graphs' }, { label: 'Graphs' }, { label: 'Trees' }] };
  const view = buildBriefView(brief);
  assert.equal(view.focus.action, 'planner');
  assert.equal(view.focus.title, 'Block 1');
  assert.equal(view.focus.meta, '20 min planned');
  assert.equal(view.stats[1].count, '200+');
  assert.equal(view.plan.length, 3);
  assert.equal(view.remainingBlocks, 9);
  assert.equal(view.reattemptTopics, 'Graphs · Trees');
  assert.equal(view.partial, true);
});

test('the starting action adapts to reattempts, recall, or an empty plan', () => {
  const brief = empty();
  assert.equal(buildBriefView(brief).focus.action, 'planner');
  brief.concepts.count = 2;
  assert.equal(buildBriefView(brief).focus.action, 'concepts');
  brief.reattempts.count = 1;
  assert.equal(buildBriefView(brief).focus.action, 'today');
});

test('partial zero counts never become a claim of no due work', () => {
  const brief = empty();
  brief.reattempts.complete = false;
  const view = buildBriefView(brief);
  assert.equal(view.stats[1].count, '0+');
  assert.equal(view.focus.action, 'today');
  assert.match(view.focus.title, /incomplete/);
  assert.doesNotMatch(view.focus.detail, /No blocks or due reviews/);
});

test('preview and time labels are explicit; missing duration is never fabricated', () => {
  const brief = empty();
  brief.planner = { count: 1, items: [{ title: 'Read graphs', minutes: -10 }] };
  const view = buildBriefView(brief, { preview: true, time: '13:05' });
  assert.equal(view.preview, true);
  assert.equal(view.schedule, '1:05 PM IST');
  assert.equal(view.date, 'Tuesday, 17 November');
  assert.equal(view.plan[0].minutes, '');
  assert.equal(view.focus.meta, 'From your saved plan');
});
