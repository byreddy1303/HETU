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
      assert.match(options.detail, /Study graphs/);
      assert.match(options.detail, /2 due reattempts/);
      assert.match(options.detail, /At least 1 concepts/);
      return { response: 0 };
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
