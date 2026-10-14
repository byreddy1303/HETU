const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');

const BACKEND_PORT = 8765;
let mainWindow = null;
let backendProcess = null;

function isDev() {
  return !app.isPackaged && process.env.NODE_ENV !== 'production';
}

function getPythonPath() {
  if (isDev()) {
    const venvPython = path.join(__dirname, '../backends/python/.venv/bin/python');
    if (fs.existsSync(venvPython)) return venvPython;
  }
  // Packaged app path
  const packagedPython = path.join(process.resourcesPath, 'python/bin/python');
  if (fs.existsSync(packagedPython)) return packagedPython;
  return 'python3';
}

function startBackend() {
  return new Promise((resolve) => {
    const pythonPath = getPythonPath();
    const backendDir = path.join(__dirname, '../backends/python');
    const userData = app.getPath('userData');
    const dbPath = path.join(userData, 'hetu.db');
    const imageDir = path.join(userData, 'images');

    if (!fs.existsSync(imageDir)) {
      fs.mkdirSync(imageDir, { recursive: true });
    }

    console.log(`[HETU Desktop] Starting backend with ${pythonPath}`);
    console.log(`[HETU Desktop] Database location: ${dbPath}`);

    const env = {
      ...process.env,
      PYTHONPATH: backendDir,
      ENVIRONMENT: 'local',
      DATABASE_URL: `sqlite+aiosqlite:///${dbPath}`,
      CORS_ORIGINS: `http://localhost:5173,http://127.0.0.1:${BACKEND_PORT},http://localhost:${BACKEND_PORT}`,
      TRUSTED_HOSTS: `localhost,127.0.0.1,127.0.0.1:${BACKEND_PORT}`,
      API_URL: `http://127.0.0.1:${BACKEND_PORT}`,
    };

    backendProcess = spawn(
      pythonPath,
      ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)],
      { cwd: backendDir, env, stdio: ['ignore', 'pipe', 'pipe'] }
    );

    backendProcess.stdout.on('data', (data) => {
      console.log(`[Backend] ${data.toString().trim()}`);
    });

    backendProcess.stderr.on('data', (data) => {
      console.error(`[Backend ERR] ${data.toString().trim()}`);
    });

    backendProcess.on('exit', (code, signal) => {
      console.log(`[HETU Desktop] Backend exited with code ${code}, signal ${signal}`);
    });

    // Poll until backend is ready
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/health/live`, (res) => {
        if (res.statusCode === 200) {
          clearInterval(interval);
          console.log('[HETU Desktop] Backend is healthy and ready!');
          resolve();
        }
      });
      req.on('error', () => {
        if (attempts > 30) {
          clearInterval(interval);
          console.warn('[HETU Desktop] Backend startup timeout, opening window anyway.');
          resolve();
        }
      });
    }, 250);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#090a0f',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const devUrl = 'http://localhost:5173';
  if (isDev() && process.env.VITE_DEV_SERVER !== 'false') {
    mainWindow.loadURL(devUrl).catch(() => {
      // Fallback if dev server is not ready yet
      setTimeout(() => mainWindow.loadURL(devUrl), 1000);
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  ipcMain.handle('get-app-version', () => app.getVersion());

  await startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendProcess) {
    console.log('[HETU Desktop] Terminating backend process...');
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
});
