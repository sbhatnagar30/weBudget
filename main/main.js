const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const database = require('./database');
const { parseStatementText } = require('./statement-parser');

if (process.env.ELECTRON_RUN_AS_NODE) {
  delete process.env.ELECTRON_RUN_AS_NODE;
}

const logPath = path.join(app.getPath('userData'), 'weBudget-debug.log');
function debugLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  try {
    fs.appendFileSync(logPath, logMessage + '\n');
  } catch (e) {
    // Ignore log write errors
  }
}

let mainWindow;
let nextServer = null;
let nextPort = 3000;
let splashWindow = null;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

async function createStaticServer(port) {
  const nextDir = path.join(__dirname, '..', '.next');
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    let filePath = url.pathname;

    if (filePath === '/') {
      filePath = '/index.html';
    }

    const staticMatch = filePath.match(/^\/_next\/static\/(.+)$/);
    if (staticMatch) {
      const staticPath = path.join(nextDir, 'static', staticMatch[1]);
      serveFile(staticPath, res);
      return;
    }

    if (filePath === '/favicon.ico') {
      serveFile(path.join(__dirname, '..', 'app', 'favicon.ico'), res);
      return;
    }

    let htmlPath = path.join(nextDir, 'server', 'app', filePath);
    if (!htmlPath.endsWith('.html')) {
      htmlPath += '.html';
    }

    serveFile(htmlPath, res);
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      debugLog(`Static server ready on port ${port}`);
      resolve(server);
    });
  });
}

function serveFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

async function startNextServer() {
  debugLog('Starting static server...');
  if (nextServer) {
    debugLog('Static server already running');
    return nextServer;
  }

  nextPort = await findAvailablePort(3000);
  debugLog(`Starting static server on port ${nextPort}...`);
  nextServer = await createStaticServer(nextPort);
  return nextServer;
}

async function waitForNextServer() {
  debugLog(`Waiting for static server at http://localhost:${nextPort}...`);
  try {
    await waitForServer(`http://localhost:${nextPort}`);
    debugLog('Static server is ready');
    return nextPort;
  } catch (err) {
    debugLog(`Failed to wait for static server: ${err.message}`);
    throw err;
  }
}

  function createSplashWindow() {
    debugLog('Creating splash window...');
    splashWindow = new BrowserWindow({
      width: 400,
      height: 300,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const splashHtml = path.join(__dirname, '..', 'app', 'splash.html');
    splashWindow.loadFile(splashHtml);
    debugLog('Splash window created');
  }

function closeSplash() {
  debugLog('Closing splash window...');
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;
}

function waitForServer(url, maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const req = http.get(url, (res) => {
        if (res.statusCode === 200) {
          clearInterval(interval);
          resolve(true);
        }
      });
      req.on('error', () => {
        // Server not ready yet
      });
      req.setTimeout(2000, () => {
        req.destroy();
      });
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        reject(new Error(`Server at ${url} did not start within ${maxAttempts * 2} seconds`));
      }
    }, 2000);
  });
}

function createMainWindow(port) {
  debugLog('Creating main window...');
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const dev = !app.isPackaged;
  const url = dev ? 'http://localhost:3000' : `http://localhost:${port || nextPort}`;
  debugLog(`Mode: ${dev ? 'dev' : 'production'}, Loading URL: ${url}`);

  mainWindow.loadURL(url).catch((err) => {
    debugLog(`Failed to load URL: ${err.message}`);
    const errorPath = path.join(__dirname, '..', 'app', 'error.html');
    mainWindow.loadFile(errorPath);
  });

  if (dev) {
    debugLog('Opening DevTools in dev mode');
    mainWindow.webContents.openDevTools();
  } else {
    debugLog('DevTools disabled in production');
  }
  mainWindow.on('closed', () => {
    debugLog('Main window closed');
    mainWindow = null;
  });
  mainWindow.once('ready-to-show', () => {
    debugLog('Main window ready to show, closing splash');
    closeSplash();
  });
  mainWindow.on('did-fail-load', (event, errorCode, errorDescription) => {
    debugLog(`Failed to load: ${errorCode} - ${errorDescription}`);
    const errorPath = path.join(__dirname, '..', 'app', 'error.html');
    if (!mainWindow.isDestroyed()) {
      mainWindow.loadFile(errorPath);
    }
  });
  mainWindow.maximize();
}

async function findAvailablePort(startPort, maxAttempts = 10) {
  debugLog(`Finding available port starting from ${startPort}...`);
  return new Promise((resolve) => {
    const net = require('net');
    let port = startPort;
    let attempts = 0;

    const checkPort = (portToCheck) => {
      const server = net.createServer();
      server.once('error', () => {
        debugLog(`Port ${portToCheck} is in use, trying next...`);
        attempts++;
        if (attempts < maxAttempts) {
          checkPort(portToCheck + 1);
        } else {
          server.close();
          debugLog(`Max attempts reached, using port ${portToCheck}`);
          resolve(portToCheck);
        }
      });
      server.once('listening', () => {
        debugLog(`Port ${portToCheck} is available`);
        server.close();
        resolve(portToCheck);
      });
      server.listen(portToCheck, '127.0.0.1');
    };

    checkPort(port);
  });
}

async function registerIpcHandlers() {
  const db = database;

  ipcMain.handle('db:getCards', () => db.getCards());
  ipcMain.handle('db:getCard', (_, id) => db.getCard(id));
  ipcMain.handle('db:addCard', (_, card) => db.addCard(card));
  ipcMain.handle('db:updateCard', (_, id, updates) => db.updateCard(id, updates));
  ipcMain.handle('db:deleteCard', (_, id) => db.deleteCard(id));

  ipcMain.handle('db:getBankAccounts', () => db.getBankAccounts());
  ipcMain.handle('db:getBankAccount', (_, id) => db.getBankAccount(id));
  ipcMain.handle('db:addBankAccount', (_, account) => db.addBankAccount(account));
  ipcMain.handle('db:updateBankAccount', (_, id, updates) => db.updateBankAccount(id, updates));
  ipcMain.handle('db:deleteBankAccount', (_, id) => db.deleteBankAccount(id));

  ipcMain.handle('db:getTransactions', (_, filters) => db.getTransactions(filters));
  ipcMain.handle('db:getBankTransactions', (_, filters) => db.getBankTransactions(filters));
  ipcMain.handle('db:getTransactionsForStatement', (_, statementFile) => db.getTransactionsForStatement(statementFile));
  ipcMain.handle('db:getTransaction', (_, id) => db.getTransaction(id));
  ipcMain.handle('db:addTransaction', (_, tx) => db.addTransaction(tx));
  ipcMain.handle('db:addTransactionsBatch', (_, txs) => db.addTransactionsBatch(txs));
  ipcMain.handle('db:updateTransaction', (_, id, updates) => db.updateTransaction(id, updates));
  ipcMain.handle('db:deleteTransaction', (_, id) => db.deleteTransaction(id));

  ipcMain.handle('db:getInterestSnapshots', () => db.getInterestSnapshots());
  ipcMain.handle('db:addInterestSnapshot', (_, snapshot) => db.addInterestSnapshot(snapshot));

  ipcMain.handle('db:getStatementUploads', () => db.getStatementUploads());
  ipcMain.handle('db:getStatementUpload', (_, id) => db.getStatementUpload(id));
  ipcMain.handle('db:addStatementUpload', (_, upload) => db.addStatementUpload(upload));
  ipcMain.handle('db:deleteStatementUpload', (_, id) => db.deleteStatementUpload(id));

  ipcMain.handle('db:getMonthlySpendingByCategory', (_, filters) => db.getMonthlySpendingByCategory(filters));
  ipcMain.handle('db:getDailySpending', (_, filters) => db.getDailySpending(filters));
  ipcMain.handle('db:getCardMonthlySummary', (_, cardId, year) => db.getCardMonthlySummary(cardId, year));
  ipcMain.handle('db:getInterestByCard', () => db.getInterestByCard());
  ipcMain.handle('db:getTotalMonthlyInterest', () => db.getTotalMonthlyInterest());
  ipcMain.handle('db:getCategories', () => db.getCategories());
  ipcMain.handle('db:getDbCategories', () => db.getDbCategories());
  ipcMain.handle('db:getDbCategory', (_, id) => db.getDbCategory(id));
  ipcMain.handle('db:addDbCategory', (_, category) => db.addDbCategory(category));
  ipcMain.handle('db:updateDbCategory', (_, id, updates) => db.updateDbCategory(id, updates));
  ipcMain.handle('db:deleteDbCategory', (_, id) => db.deleteDbCategory(id));
  ipcMain.handle('db:getMissingStatementMonths', (_, cardId) => db.getMissingStatementMonths(cardId));

  ipcMain.handle('db:exportBackup', (_, filters) => db.exportBackup(filters));
  ipcMain.handle('db:importBackup', (_, backupData) => db.importBackup(backupData));
  ipcMain.handle('db:applyImport', (_, importData, resolutions) => db.applyImport(importData, resolutions));

  ipcMain.handle('dialog:openFile', async (_, options) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: options.filters || [{ name: 'PDFs', extensions: ['pdf'] }],
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('parse:getSupportedInstitutions', () => {
    const { getSupportedInstitutions } = require('./statement-parser');
    return getSupportedInstitutions();
  });

  ipcMain.handle('parse:pdf', async (_, filePath, institution) => {
    try {
      const { parseStatement } = require('./statement-parser');
      const result = await parseStatement(filePath, institution);
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('app:logError', (_, errorInfo) => {
    debugLog(`[Renderer Error] ${errorInfo.message}`);
    if (errorInfo.filename) {
      debugLog(`  File: ${errorInfo.filename}:${errorInfo.lineno}:${errorInfo.colno}`);
    }
    if (errorInfo.stack) {
      debugLog(`  Stack: ${errorInfo.stack}`);
    }
    if (errorInfo.type) {
      debugLog(`  Type: ${errorInfo.type}`);
    }
    return null;
  });
}

app.on('ready', async () => {
  debugLog('========================================');
  debugLog('weBudget app starting...');
  debugLog(`Platform: ${process.platform}`);
  debugLog(`Architecture: ${process.arch}`);
  debugLog(`Node version: ${process.version}`);
  debugLog(`Electron version: ${process.versions.electron}`);
  debugLog(`App is packaged: ${app.isPackaged}`);
  debugLog(`NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
  debugLog(`Debug log location: ${logPath}`);
  debugLog('========================================');

  await database.initPromise;
  debugLog('Database initialized');
  await registerIpcHandlers();
  debugLog('IPC handlers registered');

  const isProduction = app.isPackaged || process.env.NODE_ENV === 'production';
  debugLog(`Running in ${isProduction ? 'production' : 'development'} mode`);

  if (isProduction) {
    debugLog('Starting splash window...');
    createSplashWindow();
    try {
      await startNextServer();
      debugLog('Waiting for static server to be ready...');
      nextPort = await waitForNextServer();
      debugLog(`Static server is ready on port ${nextPort}`);
    } catch (err) {
      debugLog(`Failed to start static server: ${err.message}`);
      const errorPath = path.join(__dirname, '..', 'app', 'error.html');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadFile(errorPath);
      }
      closeSplash();
      return;
    }
  }

  debugLog(`Creating main window on port ${nextPort}...`);
  createMainWindow(nextPort);
});

app.on('window-all-closed', () => {
  if (nextServer) {
    nextServer.close();
    nextServer = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow(nextPort);
  }
});
