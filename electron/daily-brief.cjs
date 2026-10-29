const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const LABEL = 'com.hetu.daily-brief';

function indiaClock(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`
  };
}
function readConfig(dataDir) {
  const defaults = {
    enabled: true,
    time: '09:00',
    timezone: 'Asia/Kolkata',
    autoLaunch: true,
    last_shown_on: null,
    last_error: null
  };
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'daily-brief.json'), 'utf8'));
    return { ...defaults, ...saved, timezone: 'Asia/Kolkata' };
  } catch (error) {
    if (error.code === 'ENOENT') return defaults;
    throw new Error('Daily brief settings could not be read. Your study records are unaffected.');
  }
}
function writeConfig(dataDir, value) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const target = path.join(dataDir, 'daily-brief.json');
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
    fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
function due(config, now = new Date()) {
  const local = indiaClock(now);
  return Boolean(
    config.enabled && local.time >= config.time && config.last_shown_on !== local.date
  );
}
function briefText(brief) {
  const plan = brief.planner;
  const repeats = brief.reattempts;
  const concepts = brief.concepts;
  return [
    `Today's plan · ${plan.count} unfinished ${plan.count === 1 ? 'block' : 'blocks'}`,
    ...(plan.items.length
      ? plan.items.map(
          (item) =>
            `• ${item.title}${Number.isFinite(item.minutes) ? ` (${item.minutes} min)` : ''}`
        )
      : ['No Planner blocks saved for today.']),
    '',
    `${repeats.complete ? '' : 'At least '}${repeats.count} due reattempts`,
    ...repeats.items.map((item) => `• ${item.label}`),
    '',
    `${concepts.complete ? '' : 'At least '}${concepts.count} concepts to revise`,
    ...concepts.items.map((item) => `• ${item.label}`),
    '',
    'Open Do now for the current queue. Counts describe saved work, not completed learning.'
  ].join('\n');
}
function fetchBrief(port) {
  return new Promise((resolve, reject) => {
    const request = http.get(`http://127.0.0.1:${port}/v1/daily-brief`, (response) => {
      let body = '';
      response.on('data', (chunk) => {
        body += chunk;
        if (body.length > 65536) request.destroy(new Error('The daily brief is too large.'));
      });
      response.on('error', reject);
      response.on('end', () => {
        try {
          if (response.statusCode !== 200)
            throw new Error('The local agenda could not load. Try Preview again.');
          const value = JSON.parse(body);
          if (!value.date || !value.planner || !value.reattempts || !value.concepts)
            throw new Error('The local agenda is incomplete.');
          resolve(value);
        } catch (error) {
          reject(error);
        }
      });
    });
    request.setTimeout(5000, () => request.destroy(new Error('The local agenda check timed out.')));
    request.on('error', reject);
  });
}
function xml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
async function configureLaunchAgent({
  enabled,
  dataDir,
  pythonPath,
  backendDir,
  executable,
  platform = process.platform,
  homedir = os.homedir(),
  uid = os.userInfo().uid,
  execute = run
}) {
  if (platform !== 'darwin') return { supported: false, installed: false };
  const folder = path.join(homedir, 'Library', 'LaunchAgents');
  const file = path.join(folder, `${LABEL}.plist`);
  const service = `gui/${uid}/${LABEL}`;
  if (!enabled) {
    await execute('launchctl', ['bootout', service], { timeout: 5000 }).catch(() => {});
    fs.rmSync(file, { force: true });
    return { supported: true, installed: false };
  }
  const args = [
    pythonPath,
    path.join(backendDir, 'scripts', 'daily_brief_launcher.py'),
    '--app',
    executable,
    '--data-dir',
    dataDir
  ];
  const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${LABEL}</string><key>ProgramArguments</key><array>${args.map((v) => `<string>${xml(v)}</string>`).join('')}</array><key>StartInterval</key><integer>60</integer><key>RunAtLoad</key><false/><key>ProcessType</key><string>Background</string></dict></plist>\n`;
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === plist) {
    try {
      await execute('launchctl', ['print', service], { timeout: 5000 });
      return { supported: true, installed: true };
    } catch {
      /* Re-register an unloaded owned job. */
    }
  }
  fs.writeFileSync(file, plist, { mode: 0o600 });
  await execute('launchctl', ['bootout', service], { timeout: 5000 }).catch(() => {});
  try {
    await execute('launchctl', ['bootstrap', `gui/${uid}`, file], { timeout: 5000 });
  } catch {
    throw new Error(
      'macOS could not enable the daily launch. The brief will still appear while HETU is open.'
    );
  }
  return { supported: true, installed: true };
}
function createDailyBrief({
  dataDir,
  port,
  show,
  navigate,
  launchOptions,
  allowAutoLaunch = true,
  autoDeliver = true,
  now = () => new Date(),
  load = () => fetchBrief(port)
}) {
  let presenting = false;
  let timer;
  let launchStatus = {
    supported: process.platform === 'darwin' && allowAutoLaunch,
    installed: false
  };
  async function configure() {
    const config = readConfig(dataDir);
    writeConfig(dataDir, config);
    if (!allowAutoLaunch) return;
    try {
      launchStatus = await configureLaunchAgent({
        ...launchOptions,
        dataDir,
        enabled: config.enabled && config.autoLaunch
      });
      if (config.last_error) writeConfig(dataDir, { ...readConfig(dataDir), last_error: null });
    } catch (error) {
      writeConfig(dataDir, { ...readConfig(dataDir), last_error: error.message });
    }
  }
  async function tick(preview = false) {
    const config = readConfig(dataDir);
    if (presenting || (!preview && !due(config, now()))) return { shown: false };
    const deliveryDate = indiaClock(now()).date;
    presenting = true;
    try {
      const brief = await load();
      if (brief.held_for_exam) return { shown: false, held: true };
      const result = await show({
        type: 'info',
        title: 'HETU · Today’s study brief',
        message: `Your study brief · ${brief.date}`,
        detail: briefText(brief),
        buttons: ['Open Do now', 'Open Planner', 'Open revisions', 'Close'],
        defaultId: 0,
        cancelId: 3,
        noLink: true
      });
      // Keep any preference edits made while the popup was visible.
      writeConfig(dataDir, {
        ...readConfig(dataDir),
        ...(!preview ? { last_shown_on: deliveryDate } : {}),
        last_error: null
      });
      const routes = [
        '/today',
        `/planner?date=${encodeURIComponent(brief.date)}`,
        '/concept-review'
      ];
      if (routes[result.response]) await navigate(routes[result.response]);
      return { shown: true };
    } catch (error) {
      writeConfig(dataDir, { ...readConfig(dataDir), last_error: error.message });
      throw error;
    } finally {
      presenting = false;
    }
  }
  return {
    status: () => ({
      ...readConfig(dataDir),
      autoLaunchSupported: launchStatus.supported,
      autoLaunchInstalled: launchStatus.installed
    }),
    async save(patch) {
      if (
        typeof patch?.enabled !== 'boolean' ||
        typeof patch?.autoLaunch !== 'boolean' ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(patch?.time)
      )
        throw new Error('Choose a valid daily brief time and switches.');
      writeConfig(dataDir, {
        ...readConfig(dataDir),
        enabled: patch.enabled,
        autoLaunch: patch.autoLaunch,
        time: patch.time
      });
      await configure();
      return this.status();
    },
    tick,
    async start() {
      await configure();
      if (!autoDeliver) return;
      timer = setInterval(() => {
        void tick().catch(() => {});
      }, 30000);
      timer.unref();
      void tick().catch(() => {});
    },
    stop() {
      clearInterval(timer);
    }
  };
}
module.exports = {
  indiaClock,
  due,
  briefText,
  readConfig,
  writeConfig,
  configureLaunchAgent,
  createDailyBrief
};
