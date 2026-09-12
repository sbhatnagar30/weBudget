const { contextBridge, ipcRenderer } = require('electron');

const suppressedMessages = [
  'Cannot read properties of undefined (reading \'startTime\')',
  "Cannot read properties of undefined (reading 'startTime')",
];

window.addEventListener('error', (event) => {
  if (suppressedMessages.some((msg) => event.message?.includes(msg))) {
    event.preventDefault();
    return;
  }

  ipcRenderer.invoke('app:logError', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    stack: event.error?.stack || 'No stack trace',
  }).catch(() => {});
});

window.addEventListener('unhandledrejection', (event) => {
  ipcRenderer.invoke('app:logError', {
    message: event.reason?.message || String(event.reason),
    stack: event.reason?.stack || 'No stack trace',
    type: 'unhandledrejection',
  }).catch(() => {});
});

contextBridge.exposeInMainWorld('api', {
  db: {
    getCards: () => ipcRenderer.invoke('db:getCards'),
    getCard: (id) => ipcRenderer.invoke('db:getCard', id),
    addCard: (card) => ipcRenderer.invoke('db:addCard', card),
    updateCard: (id, updates) => ipcRenderer.invoke('db:updateCard', id, updates),
    deleteCard: (id) => ipcRenderer.invoke('db:deleteCard', id),

    getBankAccounts: () => ipcRenderer.invoke('db:getBankAccounts'),
    getBankAccount: (id) => ipcRenderer.invoke('db:getBankAccount', id),
    addBankAccount: (account) => ipcRenderer.invoke('db:addBankAccount', account),
    updateBankAccount: (id, updates) => ipcRenderer.invoke('db:updateBankAccount', id, updates),
    deleteBankAccount: (id) => ipcRenderer.invoke('db:deleteBankAccount', id),

    getTransactions: (filters) => ipcRenderer.invoke('db:getTransactions', filters),
    getBankTransactions: (filters) => ipcRenderer.invoke('db:getBankTransactions', filters),
    getTransactionsForStatement: (statementFile) => ipcRenderer.invoke('db:getTransactionsForStatement', statementFile),
    getTransaction: (id) => ipcRenderer.invoke('db:getTransaction', id),
    addTransaction: (tx) => ipcRenderer.invoke('db:addTransaction', tx),
    addTransactionsBatch: (txs) => ipcRenderer.invoke('db:addTransactionsBatch', txs),
    updateTransaction: (id, updates) => ipcRenderer.invoke('db:updateTransaction', id, updates),
    deleteTransaction: (id) => ipcRenderer.invoke('db:deleteTransaction', id),

    getInterestSnapshots: () => ipcRenderer.invoke('db:getInterestSnapshots'),
    addInterestSnapshot: (snapshot) => ipcRenderer.invoke('db:addInterestSnapshot', snapshot),

    getStatementUploads: () => ipcRenderer.invoke('db:getStatementUploads'),
    getStatementUpload: (id) => ipcRenderer.invoke('db:getStatementUpload', id),
    addStatementUpload: (upload) => ipcRenderer.invoke('db:addStatementUpload', upload),
    deleteStatementUpload: (id) => ipcRenderer.invoke('db:deleteStatementUpload', id),

    getMonthlySpendingByCategory: (filters) => ipcRenderer.invoke('db:getMonthlySpendingByCategory', filters),
    getDailySpending: (filters) => ipcRenderer.invoke('db:getDailySpending', filters),
    getCardMonthlySummary: (cardId, year) => ipcRenderer.invoke('db:getCardMonthlySummary', cardId, year),
    getInterestByCard: () => ipcRenderer.invoke('db:getInterestByCard'),
    getTotalMonthlyInterest: () => ipcRenderer.invoke('db:getTotalMonthlyInterest'),
    getCategories: () => ipcRenderer.invoke('db:getCategories'),
    getDbCategories: () => ipcRenderer.invoke('db:getDbCategories'),
    getDbCategory: (id) => ipcRenderer.invoke('db:getDbCategory', id),
    addDbCategory: (category) => ipcRenderer.invoke('db:addDbCategory', category),
    updateDbCategory: (id, updates) => ipcRenderer.invoke('db:updateDbCategory', id, updates),
    deleteDbCategory: (id) => ipcRenderer.invoke('db:deleteDbCategory', id),
    getMissingStatementMonths: (cardId) => ipcRenderer.invoke('db:getMissingStatementMonths', cardId),

    exportBackup: (filters) => ipcRenderer.invoke('db:exportBackup', filters),
    importBackup: (backupData) => ipcRenderer.invoke('db:importBackup', backupData),
    applyImport: (importData, resolutions) => ipcRenderer.invoke('db:applyImport', importData, resolutions),
  },

  dialog: {
    openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
    saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  },

  fs: {
    readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath, data) => ipcRenderer.invoke('fs:writeFile', filePath, data),
  },

  parsePdf: (filePath, institution) => ipcRenderer.invoke('parse:pdf', filePath, institution),
  getSupportedInstitutions: () => ipcRenderer.invoke('parse:getSupportedInstitutions'),
});
