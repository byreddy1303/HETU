const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  indiaClock,
  due,
  createDailyBrief,
  readConfig,
  writeConfig,
  configureLaunchAgent
} = require('./daily-brief.cjs');
function temporary(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'hetu-brief-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  return folder;
}
const payload = {
  date: '2026-10-29',
  planner: { count: 1, items: [{ title: 'Study graphs', minutes: 20 }] },
  reattempts: { count: 2, complete: true, items: [{ label: 'Memory Management' }] },
  concepts: { count: 1, complete: false, items: [{ label: 'Regular Languages' }] },
  held_for_exam: false
};
test('daily clock uses India time regardless of machine timezone and catches a missed time', () => {
  assert.deepEqual(indiaClock(new Date('2026-10-29T03:30:00Z')), {
    date: '2026-10-29',
    time: '09:00'
  });
  const config = { enabled: true, time: '09:00', last_shown_on: null };
  assert.equal(due(config, new Date('2026-10-29T03:29:00Z')), false);
  assert.equal(due(config, new Date('2026-10-29T03:30:00Z')), true);
  assert.equal(
    due({ ...config, last_shown_on: '2026-10-29' }, new Date('2026-10-29T12:00:00Z')),
    false
  );
  assert.equal(
    due({ ...config, last_shown_on: '2026-10-28' }, new Date('2026-10-29T12:00:00Z')),
    true
  );
});
test('daily delivery is once per day, preview is repeatable, and exam holds do not consume it', async (t) => {
  const dataDir = temporary(t);
  let held = true;
  let shown = 0;
  const routes = [];
  const brief = createDailyBrief({
    dataDir,
    allowAutoLaunch: false,
    now: () => new Date('2026-10-29T03:30:00Z'),
    load: async () => ({ ...payload, held_for_exam: held }),
    show: async (options) => {
      shown++;
      assert.deepEqual(options.brief, payload);
      assert.equal(options.time, '09:00');
      return { action: 'today' };
    },
    navigate: async (route) => routes.push(route)
  });
  assert.deepEqual(await brief.tick(), { shown: false, held: true });
  assert.equal(readConfig(dataDir).last_shown_on, null);
  held = false;
  await brief.tick();
  await brief.tick();
  assert.equal(shown, 1);
  assert.deepEqual(routes, ['/today']);
  await brief.tick(true);
  assert.equal(shown, 2);
  await brief.save({ enabled: false, time: '09:00', autoLaunch: false });
  assert.equal(brief.status().enabled, false);
  await assert.rejects(brief.save({ enabled: true, time: '99:00', autoLaunch: true }), /valid/);
});
test('failed agenda loads remain retryable and record an error instead of a zero brief', async (t) => {
  const dataDir = temporary(t);
  const brief = createDailyBrief({
    dataDir,
    allowAutoLaunch: false,
    now: () => new Date('2026-10-29T04:00:00Z'),
    load: async () => {
      throw new Error('Unavailable');
    },
    show: async () => assert.fail('No popup for failed data'),
    navigate: async () => {}
  });
  await assert.rejects(brief.tick(), /Unavailable/);
  assert.equal(brief.status().last_error, 'Unavailable');
  assert.equal(brief.status().last_shown_on, null);
});
test('snooze persists across restarts, reloads the agenda, and preview does not consume it', async (t) => {
  const dataDir = temporary(t);
  let clock = new Date('2026-11-17T03:30:00Z');
  let loads = 0;
  let action = 'snooze';
  const routes = [];
  const options = {
    dataDir, allowAutoLaunch: false, now: () => clock,
    load: async () => { loads++; return payload; },
    show: async () => ({ action }),
    navigate: async (route) => routes.push(route)
  };
  const first = createDailyBrief(options);
  assert.deepEqual(await first.tick(), { shown: true, snoozed: true });
  assert.equal(first.status().last_shown_on, null);
  const persisted = readConfig(dataDir).snoozed_until;
  assert.equal(persisted, '2026-11-17T03:45:00.000Z');
  const reopened = createDailyBrief(options);
  clock = new Date('2026-11-17T03:44:59Z');
  assert.deepEqual(await reopened.tick(), { shown: false });
  action = 'dismiss';
  await reopened.tick(true);
  assert.equal(reopened.status().snoozed_until, persisted);
  assert.equal(reopened.status().last_shown_on, null);
  clock = new Date('2026-11-17T03:45:00Z');
  action = 'concepts';
  await reopened.tick();
  assert.equal(loads, 3);
  assert.deepEqual(routes, ['/concept-review']);
  assert.equal(reopened.status().last_shown_on, '2026-11-17');
  assert.equal(reopened.status().snoozed_until, null);
  assert.deepEqual(await reopened.tick(), { shown: false });
});

test('stale snooze does not suppress a new day and preference saves clear it', async (t) => {
  const dataDir = temporary(t);
  const config = { ...readConfig(dataDir), snoozed_on: '2026-11-16', snoozed_until: '2026-11-18T03:45:00Z' };
  writeConfig(dataDir, config);
  assert.equal(due(config, new Date('2026-11-17T03:30:00Z')), true);
  assert.equal(due({ ...config, snoozed_on: '2026-11-17', snoozed_until: 'invalid' }, new Date('2026-11-17T03:30:00Z')), true);
  const brief = createDailyBrief({ dataDir, allowAutoLaunch: false });
  await brief.save({ enabled: false, autoLaunch: false, time: '10:00' });
  assert.equal(brief.status().snoozed_until, null);
});

test('one open brief suppresses duplicates and a failed navigation remains retryable', async (t) => {
  const dataDir = temporary(t);
  let finish;
  const brief = createDailyBrief({
    dataDir, allowAutoLaunch: false, now: () => new Date('2026-11-17T03:30:00Z'),
    load: async () => payload,
    show: () => new Promise((resolve) => { finish = resolve; }),
    navigate: async () => { throw new Error('Window unavailable'); }
  });
  const pending = brief.tick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await brief.tick(true), { shown: false });
  finish({ action: 'planner' });
  await assert.rejects(pending, /Window unavailable/);
  assert.equal(brief.status().last_shown_on, null);
});
test('macOS launch job runs a local clock helper with explicit paths and can be removed', async (t) => {
  const folder = temporary(t),
    calls = [];
  const options = {
    enabled: true,
    dataDir: path.join(folder, 'data & files'),
    pythonPath: '/bundle/python',
    backendDir: '/bundle/backend',
    executable: '/Apps/HETU.app/Contents/MacOS/HETU',
    platform: 'darwin',
    homedir: folder,
    uid: 501,
    execute: async (command, args) => {
      calls.push([command, args]);
      return { stdout: '' };
    }
  };
  assert.deepEqual(await configureLaunchAgent(options), { supported: true, installed: true });
  const file = path.join(folder, 'Library', 'LaunchAgents', 'com.hetu.daily-brief.plist');
  const xml = fs.readFileSync(file, 'utf8');
  assert.match(xml, /StartInterval<\/key><integer>60/);
  assert.match(xml, /daily_brief_launcher.py/);
  assert.match(xml, /data &amp; files/);
  assert.match(xml, /RunAtLoad<\/key><false/);
  assert(calls.some(([, args]) => args[0] === 'bootstrap'));
  await configureLaunchAgent({ ...options, enabled: false });
  assert.equal(fs.existsSync(file), false);
});
