const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dailyBrief', {
  get: () => ipcRenderer.invoke('brief-window:get'),
  ready: () => ipcRenderer.send('brief-window:ready'),
  act: (action) => ipcRenderer.send('brief-window:action', action)
});
