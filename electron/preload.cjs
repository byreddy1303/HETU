const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  apiUrl: process.argv.find((value) => value.startsWith('--hetu-api-url='))?.slice('--hetu-api-url='.length),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getDailyBrief: () => ipcRenderer.invoke('daily-brief:get'),
  saveDailyBrief: (patch) => ipcRenderer.invoke('daily-brief:save', patch),
  previewDailyBrief: () => ipcRenderer.invoke('daily-brief:preview'),
  onBriefNavigate: (listener) => {
    const handler = (_event, route) => {
      if (typeof route === 'string' && /^\/(today|planner|concept-review)(\?|$)/.test(route)) listener(route);
    };
    ipcRenderer.on('daily-brief:navigate', handler);
    return () => ipcRenderer.removeListener('daily-brief:navigate', handler);
  }
});
