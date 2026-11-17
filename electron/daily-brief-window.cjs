const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { buildBriefView } = require('./daily-brief-view.cjs');

function showDailyBrief({ brief, preview, time }) {
  const { BrowserWindow, ipcMain, screen } = require('electron');
  const view = buildBriefView(brief, { preview, time });
  const file = path.join(__dirname, 'daily-brief', 'index.html');
  const pageUrl = pathToFileURL(file).href;
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const win = new BrowserWindow({
    width: Math.min(640, area.width), height: Math.min(760, area.height),
    minWidth: Math.min(380, area.width), minHeight: Math.min(520, area.height),
    show: false, maximizable: false, fullscreenable: false,
    autoHideMenuBar: true, title: 'HETU · Your daily brief',
    backgroundColor: '#f7f8fc',
    webPreferences: {
      preload: path.join(__dirname, 'daily-brief-preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true
    }
  });
  const trusted = (event) => !win.isDestroyed() && event.sender === win.webContents &&
    event.senderFrame === win.webContents.mainFrame && event.senderFrame.url === pageUrl;
  const allowed = new Set(['today', 'planner', 'concepts', 'dismiss', ...(!preview ? ['snooze'] : [])]);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (result, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      ipcMain.removeHandler('brief-window:get');
      ipcMain.removeListener('brief-window:action', onAction);
      ipcMain.removeListener('brief-window:ready', onReady);
      if (!win.isDestroyed()) win.destroy();
      if (error) reject(error);
      else resolve(result);
    };
    const onAction = (event, action) => {
      if (trusted(event) && allowed.has(action)) finish({ action });
    };
    const onReady = (event) => {
      if (!trusted(event)) return;
      clearTimeout(timeout);
      win.show();
      win.focus();
    };
    const timeout = setTimeout(() => finish(null, new Error('The daily brief could not open. Try Preview again.')), 10000);
    ipcMain.handle('brief-window:get', (event) => {
      if (!trusted(event)) throw new Error('Daily brief access requires its local window.');
      return view;
    });
    ipcMain.on('brief-window:action', onAction);
    ipcMain.on('brief-window:ready', onReady);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.webContents.on('will-attach-webview', (event) => event.preventDefault());
    win.webContents.once('render-process-gone', () => finish(null, new Error('The daily brief closed unexpectedly. Try Preview again.')));
    win.once('closed', () => finish({ action: 'dismiss' }));
    void win.loadFile(file).catch((error) => finish(null, error));
  });
}

module.exports = { showDailyBrief };
