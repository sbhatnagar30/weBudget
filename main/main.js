const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const database = require('./database');
const { parseStatementText } = require('./statement-parser');

let mainWindow;
let nextServer = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const dev = process.env.NODE_ENV !== 'production';
  const url = dev ? 'http://localhost:3000' : 'http://localhost:3000';

  mainWindow.loadURL(url).catch(() => {
    setTimeout(() => mainWindow.loadURL(url), 500);
  });

  if (dev) {
    mainWindow.webContents.openDevTools();
  }
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.maximize();
}

function startNextServer() {
  if (nextServer) return nextServer;

  const nextBin = path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next');
  nextServer = spawn('node', [nextBin, 'start', '-p', '3000'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'ignore',
  });

  nextServer.on('error', (err) => {
    console.error('Failed to start Next.js server:', err);
  });

  return nextServer;
}

function registerIpcHandlers() {
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

  ipcMain.handle('dialog:openFile', async (_, options) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: options.filters || [{ name: 'PDFs', extensions: ['pdf'] }],
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('parse:pdf', async (_, filePath) => {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(dataBuffer);
      const parsed = parseStatementText(data.text);
      return { success: true, text: data.text, transactions: parsed };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

app.on('ready', async () => {
  await database.initPromise;
  registerIpcHandlers();

  if (process.env.NODE_ENV === 'production') {
    startNextServer();
  }

  setTimeout(createMainWindow, process.env.NODE_ENV === 'production' ? 1000 : 0);
});

app.on('window-all-closed', () => {
  if (nextServer) {
    nextServer.kill();
    nextServer = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});
