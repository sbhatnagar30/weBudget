const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

let db = null;
let initPromise = null;
let DB_PATH = null;

async function initDatabase() {
  const { app } = require('electron');
  DB_PATH = path.join(app.getPath('userData'), 'webudget.db');

  const SQL = await initSqlJs({
    locateFile: (file) => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file),
  });

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'credit',
      institution TEXT,
      interest_rate REAL NOT NULL DEFAULT 0.0,
      credit_limit REAL,
      current_balance REAL NOT NULL DEFAULT 0.0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bank_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      institution TEXT,
      account_type TEXT NOT NULL DEFAULT 'checking',
      current_balance REAL NOT NULL DEFAULT 0.0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER,
      bank_account_id INTEGER,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL DEFAULT 'uncategorized',
      transaction_type TEXT NOT NULL DEFAULT 'expense',
      statement_file TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
      FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique ON transactions(card_id, bank_account_id, date, description, amount);

    CREATE TABLE IF NOT EXISTS interest_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      balance REAL NOT NULL,
      interest_rate REAL NOT NULL,
      monthly_interest REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
      UNIQUE(card_id, month)
    );

    CREATE TABLE IF NOT EXISTS statement_uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER,
      bank_account_id INTEGER,
      statement_month TEXT NOT NULL,
      source_file TEXT NOT NULL,
      transaction_count INTEGER NOT NULL DEFAULT 0,
      institution TEXT,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
      FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE CASCADE,
      UNIQUE(card_id, bank_account_id, statement_month)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#64748b',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_card_id ON transactions(card_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_statement_uploads_month ON statement_uploads(statement_month);
  `);

  saveDatabase();
}

function saveDatabase() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function ensureDb() {
  if (!db) throw new Error('Database not initialized');
}

function lastInsertRowid() {
  ensureDb();
  const res = db.exec('SELECT last_insert_rowid()');
  return res[0]?.values[0]?.[0];
}

function changes() {
  ensureDb();
  const res = db.exec('SELECT changes()');
  return res[0]?.values[0]?.[0] ?? 0;
}

function run(sql, params = []) {
  ensureDb();
  db.run(sql, params);
}

function prepare(sql) {
  ensureDb();
  return db.prepare(sql);
}

function exec(sql) {
  ensureDb();
  return db.exec(sql);
}

function getRowsAsObjects(stmt) {
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

const CATEGORIES = ['gas', 'groceries', 'dining', 'subscriptions', 'retail', 'payment', 'uncategorized'];

function getCards() {
  const stmt = prepare('SELECT * FROM cards ORDER BY name');
  return getRowsAsObjects(stmt);
}

function getCard(id) {
  const stmt = prepare('SELECT * FROM cards WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return undefined;
}

function addCard(card) {
  run(
    `INSERT INTO cards (name, type, institution, interest_rate, credit_limit, current_balance)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [card.name, card.type || 'credit', card.institution || null, card.interest_rate || 0, card.credit_limit || null, card.current_balance || 0]
  );
  const id = lastInsertRowid();
  saveDatabase();
  return getCard(id);
}

function updateCard(id, updates) {
  const fields = [];
  const params = [];

  if (updates.name !== undefined) { fields.push('name = ?'); params.push(updates.name); }
  if (updates.type !== undefined) { fields.push('type = ?'); params.push(updates.type); }
  if (updates.institution !== undefined) { fields.push('institution = ?'); params.push(updates.institution); }
  if (updates.interest_rate !== undefined) { fields.push('interest_rate = ?'); params.push(updates.interest_rate); }
  if (updates.credit_limit !== undefined) { fields.push('credit_limit = ?'); params.push(updates.credit_limit); }
  if (updates.current_balance !== undefined) { fields.push('current_balance = ?'); params.push(updates.current_balance); }

  fields.push("updated_at = datetime('now')");
  params.push(id);

  run(`UPDATE cards SET ${fields.join(', ')} WHERE id = ?`, params);
  saveDatabase();
  return getCard(id);
}

function deleteCard(id) {
  run('DELETE FROM cards WHERE id = ?', [id]);
  const changed = changes();
  saveDatabase();
  return changed > 0;
}

function getBankAccounts() {
  const stmt = prepare('SELECT * FROM bank_accounts ORDER BY name');
  return getRowsAsObjects(stmt);
}

function getBankAccount(id) {
  const stmt = prepare('SELECT * FROM bank_accounts WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return undefined;
}

function addBankAccount(account) {
  run(
    `INSERT INTO bank_accounts (name, institution, account_type, current_balance)
     VALUES (?, ?, ?, ?)`,
    [account.name, account.institution || null, account.account_type || 'checking', account.current_balance || 0]
  );
  const id = lastInsertRowid();
  saveDatabase();
  return getBankAccount(id);
}

function updateBankAccount(id, updates) {
  const fields = [];
  const params = [];

  if (updates.name !== undefined) { fields.push('name = ?'); params.push(updates.name); }
  if (updates.institution !== undefined) { fields.push('institution = ?'); params.push(updates.institution); }
  if (updates.account_type !== undefined) { fields.push('account_type = ?'); params.push(updates.account_type); }
  if (updates.current_balance !== undefined) { fields.push('current_balance = ?'); params.push(updates.current_balance); }

  params.push(id);
  run(`UPDATE bank_accounts SET ${fields.join(', ')} WHERE id = ?`, params);
  saveDatabase();
  return getBankAccount(id);
}

function deleteBankAccount(id) {
  run('DELETE FROM bank_accounts WHERE id = ?', [id]);
  const changed = changes();
  saveDatabase();
  return changed > 0;
}

function getBankTransactions(filters = {}) {
  const conditions = ['bank_account_id IS NOT NULL'];
  const params = [];

  if (filters.bank_account_id) { conditions.push('bank_account_id = ?'); params.push(filters.bank_account_id); }
  if (filters.category) { conditions.push('category = ?'); params.push(filters.category); }
  if (filters.start_date) { conditions.push('date >= ?'); params.push(filters.start_date); }
  if (filters.end_date) { conditions.push('date <= ?'); params.push(filters.end_date); }
  if (filters.transaction_type) { conditions.push('transaction_type = ?'); params.push(filters.transaction_type); }
  if (filters.statement_file) { conditions.push('statement_file = ?'); params.push(filters.statement_file); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const stmt = prepare(`SELECT * FROM transactions ${where} ORDER BY date DESC, id DESC`);
  stmt.bind(params);
  return getRowsAsObjects(stmt);
}

function getTransactions(filters = {}) {
  const conditions = [];
  const params = [];

  if (filters.card_id) { conditions.push('card_id = ?'); params.push(filters.card_id); }
  if (filters.bank_account_id) { conditions.push('bank_account_id = ?'); params.push(filters.bank_account_id); }
  if (filters.category) { conditions.push('category = ?'); params.push(filters.category); }
  if (filters.start_date) { conditions.push('date >= ?'); params.push(filters.start_date); }
  if (filters.end_date) { conditions.push('date <= ?'); params.push(filters.end_date); }
  if (filters.transaction_type) { conditions.push('transaction_type = ?'); params.push(filters.transaction_type); }
  if (filters.statement_file) { conditions.push('statement_file = ?'); params.push(filters.statement_file); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const stmt = prepare(`SELECT * FROM transactions ${where} ORDER BY date DESC, id DESC`);
  stmt.bind(params);
  return getRowsAsObjects(stmt);
}

function getTransactionsForStatement(statementFile) {
  const stmt = prepare('SELECT * FROM transactions WHERE statement_file = ? ORDER BY date DESC, id DESC');
  stmt.bind([statementFile]);
  return getRowsAsObjects(stmt);
}

function getTransaction(id) {
  const stmt = prepare('SELECT * FROM transactions WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return undefined;
}

function addTransaction(transaction) {
  run(
    `INSERT INTO transactions (card_id, bank_account_id, date, description, amount, category, transaction_type, statement_file, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [transaction.card_id || null, transaction.bank_account_id || null, transaction.date, transaction.description, transaction.amount, transaction.category || 'other', transaction.transaction_type || 'expense', transaction.statement_file || null, transaction.note || null]
  );
  const id = lastInsertRowid();
  saveDatabase();
  return getTransaction(id);
}

function addTransactionsBatch(transactions) {
  let added = 0;
  let skipped = 0;

  run('BEGIN TRANSACTION');
  try {
    for (const tx of transactions) {
      run(
        `INSERT OR IGNORE INTO transactions (card_id, bank_account_id, date, description, amount, category, transaction_type, statement_file, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tx.card_id || null, tx.bank_account_id || null, tx.date, tx.description, tx.amount, tx.category || 'other', tx.transaction_type || 'expense', tx.statement_file || null, tx.note || null]
      );
      const changed = changes();
      if (changed > 0) {
        added++;
      } else {
        skipped++;
      }
    }
    run('COMMIT');
  } catch (e) {
    run('ROLLBACK');
    throw e;
  }

  saveDatabase();
  return { added, skipped };
}

function updateTransaction(id, updates) {
  const fields = [];
  const params = [];

  if (updates.date !== undefined) { fields.push('date = ?'); params.push(updates.date); }
  if (updates.description !== undefined) { fields.push('description = ?'); params.push(updates.description); }
  if (updates.amount !== undefined) { fields.push('amount = ?'); params.push(updates.amount); }
  if (updates.category !== undefined) { fields.push('category = ?'); params.push(updates.category); }
  if (updates.transaction_type !== undefined) { fields.push('transaction_type = ?'); params.push(updates.transaction_type); }
  if (updates.note !== undefined) { fields.push('note = ?'); params.push(updates.note); }

  params.push(id);
  run(`UPDATE transactions SET ${fields.join(', ')} WHERE id = ?`, params);
  saveDatabase();
  return getTransaction(id);
}

function deleteTransaction(id) {
  run('DELETE FROM transactions WHERE id = ?', [id]);
  const changed = changes();
  saveDatabase();
  return changed > 0;
}

function getInterestSnapshots() {
  const stmt = prepare('SELECT * FROM interest_snapshots ORDER BY month DESC');
  return getRowsAsObjects(stmt);
}

function addInterestSnapshot(snapshot) {
  run(
    `INSERT OR REPLACE INTO interest_snapshots (card_id, month, balance, interest_rate, monthly_interest)
     VALUES (?, ?, ?, ?, ?)`,
    [snapshot.card_id, snapshot.month, snapshot.balance, snapshot.interest_rate, snapshot.monthly_interest]
  );
  saveDatabase();
  const id = lastInsertRowid();
  const stmt = prepare('SELECT * FROM interest_snapshots WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return undefined;
}

function getStatementUploads() {
  const stmt = prepare(`
    SELECT su.*, c.name as card_name, c.institution as card_institution, ba.name as bank_name, ba.institution as bank_institution
    FROM statement_uploads su
    LEFT JOIN cards c ON c.id = su.card_id
    LEFT JOIN bank_accounts ba ON ba.id = su.bank_account_id
    ORDER BY su.statement_month DESC, COALESCE(c.name, ba.name) ASC
  `);
  return getRowsAsObjects(stmt);
}

function getStatementUpload(id) {
  const stmt = prepare('SELECT * FROM statement_uploads WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return undefined;
}

function addStatementUpload(upload) {
  run(
    `INSERT OR REPLACE INTO statement_uploads (card_id, bank_account_id, statement_month, source_file, transaction_count, institution)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [upload.card_id || null, upload.bank_account_id || null, upload.statement_month, upload.source_file, upload.transaction_count, upload.institution || null]
  );
  saveDatabase();
  const id = lastInsertRowid();
  return getStatementUpload(id);
}

function deleteStatementUpload(id) {
  const upload = getStatementUpload(id);
  if (!upload) return false;

  run('DELETE FROM transactions WHERE statement_file = ?', [upload.source_file]);
  run('DELETE FROM statement_uploads WHERE id = ?', [id]);
  saveDatabase();
  return true;
}

function updateStatementUpload(id, updates) {
  const fields = [];
  const params = [];

  if (updates.card_id !== undefined) { fields.push('card_id = ?'); params.push(updates.card_id); }
  if (updates.bank_account_id !== undefined) { fields.push('bank_account_id = ?'); params.push(updates.bank_account_id); }
  if (updates.statement_month !== undefined) { fields.push('statement_month = ?'); params.push(updates.statement_month); }
  if (updates.source_file !== undefined) { fields.push('source_file = ?'); params.push(updates.source_file); }
  if (updates.transaction_count !== undefined) { fields.push('transaction_count = ?'); params.push(updates.transaction_count); }
  if (updates.institution !== undefined) { fields.push('institution = ?'); params.push(updates.institution); }

  if (fields.length === 0) return getStatementUpload(id);

  params.push(id);
  run(`UPDATE statement_uploads SET ${fields.join(', ')} WHERE id = ?`, params);
  saveDatabase();
  return getStatementUpload(id);
}

function getMonthlySpendingByCategory(filters = {}) {
  const conditions = ['transaction_type = ?'];
  const params = ['expense'];

  if (filters.card_id) { conditions.push('card_id = ?'); params.push(filters.card_id); }
  if (filters.start_date) { conditions.push('date >= ?'); params.push(filters.start_date); }
  if (filters.end_date) { conditions.push('date <= ?'); params.push(filters.end_date); }

  const stmt = prepare(`
    SELECT 
      strftime('%Y-%m', date) as month,
      category,
      SUM(amount) as total,
      COUNT(*) as count
    FROM transactions
    WHERE ${conditions.join(' AND ')}
    GROUP BY month, category
    ORDER BY month DESC, total DESC
  `);
  stmt.bind(params);
  return getRowsAsObjects(stmt);
}

function getDailySpending(filters = {}) {
  const conditions = ['transaction_type = ?'];
  const params = ['expense'];

  if (filters.card_id) { conditions.push('card_id = ?'); params.push(filters.card_id); }
  if (filters.bank_account_id) { conditions.push('bank_account_id = ?'); params.push(filters.bank_account_id); }
  if (filters.start_date) { conditions.push('date >= ?'); params.push(filters.start_date); }
  if (filters.end_date) { conditions.push('date <= ?'); params.push(filters.end_date); }

  const stmt = prepare(`
    SELECT 
      date,
      category,
      SUM(amount) as total,
      COUNT(*) as count
    FROM transactions
    WHERE ${conditions.join(' AND ')}
    GROUP BY date, category
    ORDER BY date DESC, total DESC
  `);
  stmt.bind(params);
  return getRowsAsObjects(stmt);
}

function getCardMonthlySummary(cardId, year) {
  const stmt = prepare(`
    SELECT 
      strftime('%Y-%m', date) as month,
      SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END) as expenses,
      SUM(CASE WHEN transaction_type = 'payment' THEN amount ELSE 0 END) as payments,
      SUM(CASE WHEN transaction_type = 'refund' THEN amount ELSE 0 END) as refunds,
      COUNT(*) as transaction_count
    FROM transactions
    WHERE card_id = ? AND strftime('%Y', date) = ?
    GROUP BY month
    ORDER BY month ASC
  `);
  stmt.bind([cardId, String(year)]);
  return getRowsAsObjects(stmt);
}

function getInterestByCard() {
  const stmt = prepare(`
    SELECT 
      c.id,
      c.name,
      c.institution,
      c.current_balance,
      c.interest_rate,
      ROUND(c.current_balance * c.interest_rate / 100.0 / 12.0, 2) as monthly_interest
    FROM cards c
    WHERE c.type = 'credit'
    ORDER BY monthly_interest DESC
  `);
  return getRowsAsObjects(stmt);
}

function getTotalMonthlyInterest() {
  const stmt = prepare(`
    SELECT 
      ROUND(SUM(current_balance * interest_rate / 100.0 / 12.0), 2) as total_monthly_interest
    FROM cards
    WHERE type = 'credit'
  `);
  const rows = getRowsAsObjects(stmt);
  return rows[0]?.total_monthly_interest || 0;
}

function getCategories() {
  return CATEGORIES;
}

function getMissingStatementMonths(cardId) {
  const stmt = prepare(`
    WITH RECURSIVE months(month) AS (
      SELECT '2020-01'
      UNION ALL
      SELECT datetime(month, '+1 month')
      FROM months
      WHERE month < datetime('now', '+1 month')
    )
    SELECT m.month
    FROM months m
    WHERE NOT EXISTS (
      SELECT 1 FROM statement_uploads su
      WHERE su.card_id = ? AND su.statement_month = m.month
    )
    ORDER BY m.month DESC
    LIMIT 12
  `);
  stmt.bind([cardId]);
  return getRowsAsObjects(stmt).map((r) => r.month);
}

function exportBackup(filters = {}) {
  const result = {
    version: 1,
    exportedAt: new Date().toISOString(),
    dateRange: {
      start: filters.start_date || null,
      end: filters.end_date || null,
    },
    data: {
      cards: getCards(),
      bankAccounts: getBankAccounts(),
      categories: getDbCategories(),
      transactions: getTransactions(filters),
      statementUploads: getStatementUploads(),
    },
  };
  return result;
}

function importBackup(backupData) {
  if (!backupData || !backupData.data) {
    throw new Error('Invalid backup file format');
  }

  const { cards, bankAccounts, categories, transactions, statementUploads } = backupData.data;
  const conflicts = [];
  const toAdd = [];
  const toUpdate = [];

  const existingCards = getCards();
  const existingBankAccounts = getBankAccounts();
  const existingCategories = getDbCategories();
  const existingTransactions = getTransactions();
  const existingUploads = getStatementUploads();

  const cardMap = new Map(existingCards.map((c) => [c.id, c]));
  const bankAccountMap = new Map(existingBankAccounts.map((b) => [b.id, b]));
  const categoryMap = new Map(existingCategories.map((c) => [c.name, c]));
  const txKeyMap = new Map(
    existingTransactions.map((tx) => [
      `${tx.card_id || tx.bank_account_id}-${tx.date}-${tx.description}-${tx.amount}`,
      tx,
    ])
  );
  const uploadMap = new Map(existingUploads.map((u) => [u.source_file, u]));

  for (const card of cards || []) {
    const existing = cardMap.get(card.id);
    if (!existing) {
      toAdd.push({ type: 'card', data: card });
    } else if (existing.updated_at !== card.updated_at) {
      conflicts.push({
        type: 'card',
        existing,
        incoming: card,
        resolution: null,
      });
    }
  }

  for (const bankAccount of bankAccounts || []) {
    const existing = bankAccountMap.get(bankAccount.id);
    if (!existing) {
      toAdd.push({ type: 'bankAccount', data: bankAccount });
    } else if (existing.updated_at !== bankAccount.updated_at) {
      conflicts.push({
        type: 'bankAccount',
        existing,
        incoming: bankAccount,
        resolution: null,
      });
    }
  }

  for (const category of categories || []) {
    const existing = categoryMap.get(category.name);
    if (!existing) {
      toAdd.push({ type: 'category', data: category });
    } else if (existing.color !== category.color) {
      conflicts.push({
        type: 'category',
        existing,
        incoming: category,
        resolution: null,
      });
    }
  }

  for (const tx of transactions || []) {
    const key = `${tx.card_id || tx.bank_account_id}-${tx.date}-${tx.description}-${tx.amount}`;
    const existing = txKeyMap.get(key);
    if (!existing) {
      toAdd.push({ type: 'transaction', data: tx });
    } else if (existing.updated_at !== tx.updated_at) {
      conflicts.push({
        type: 'transaction',
        existing,
        incoming: tx,
        resolution: null,
      });
    }
  }

  for (const upload of statementUploads || []) {
    const existing = uploadMap.get(upload.source_file);
    if (!existing) {
      toAdd.push({ type: 'statementUpload', data: upload });
    } else if (existing.imported_at !== upload.imported_at) {
      conflicts.push({
        type: 'statementUpload',
        existing,
        incoming: upload,
        resolution: null,
      });
    }
  }

  return {
    conflicts,
    toAdd,
    toUpdate,
    summary: {
      totalConflicts: conflicts.length,
      totalToAdd: toAdd.length,
      totalToUpdate: toUpdate.length,
    },
  };
}

function applyImport(importData, conflictResolutions) {
  for (const item of importData.toAdd) {
    switch (item.type) {
      case 'card':
        addCard(item.data);
        break;
      case 'bankAccount':
        addBankAccount(item.data);
        break;
      case 'category':
        addDbCategory(item.data);
        break;
      case 'transaction':
        addTransaction(item.data);
        break;
      case 'statementUpload':
        addStatementUpload(item.data);
        break;
    }
  }

  for (let i = 0; i < importData.conflicts.length; i++) {
    const conflict = importData.conflicts[i];
    const resolution = conflictResolutions[i];
    if (resolution === 'incoming') {
      switch (conflict.type) {
        case 'card':
          updateCard(conflict.existing.id, conflict.incoming);
          break;
        case 'bankAccount':
          updateBankAccount(conflict.existing.id, conflict.incoming);
          break;
        case 'category':
          updateDbCategory(conflict.existing.id, conflict.incoming);
          break;
        case 'transaction':
          updateTransaction(conflict.existing.id, conflict.incoming);
          break;
        case 'statementUpload':
          updateStatementUpload(conflict.existing.id, conflict.incoming);
          break;
      }
    }
    // If 'existing', do nothing
  }

  saveDatabase();
  return true;
}

function getDbCategories() {
  const stmt = prepare('SELECT * FROM categories ORDER BY name');
  return getRowsAsObjects(stmt);
}

function getDbCategory(id) {
  const stmt = prepare('SELECT * FROM categories WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return undefined;
}

function addDbCategory(category) {
  const stmt = prepare(`
    INSERT INTO categories (name, color)
    VALUES (?, ?)
  `);
  stmt.run([category.name, category.color || '#64748b']);
  saveDatabase();
  const id = lastInsertRowid();
  return getDbCategory(id);
}

function updateDbCategory(id, updates) {
  const fields = [];
  const params = [];

  if (updates.name !== undefined) { fields.push('name = ?'); params.push(updates.name); }
  if (updates.color !== undefined) { fields.push('color = ?'); params.push(updates.color); }

  params.push(id);
  run(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`, params);
  saveDatabase();
  return getDbCategory(id);
}

function deleteDbCategory(id) {
  const stmt = prepare('DELETE FROM categories WHERE id = ?');
  stmt.run([id]);
  const changed = changes();
  saveDatabase();
  return changed > 0;
}

initPromise = initDatabase();

module.exports = {
  initPromise,
  getCards,
  getCard,
  addCard,
  updateCard,
  deleteCard,
  getBankAccounts,
  getBankAccount,
  addBankAccount,
  updateBankAccount,
  deleteBankAccount,
  getTransactions,
  getBankTransactions,
  getTransactionsForStatement,
  getTransaction,
  addTransaction,
  addTransactionsBatch,
  updateTransaction,
  deleteTransaction,
  getInterestSnapshots,
  addInterestSnapshot,
  getStatementUploads,
  getStatementUpload,
  addStatementUpload,
  deleteStatementUpload,
  getMonthlySpendingByCategory,
  getDailySpending,
  getCardMonthlySummary,
  getInterestByCard,
  getTotalMonthlyInterest,
  getCategories,
  getDbCategories,
  getDbCategory,
  addDbCategory,
  updateDbCategory,
  deleteDbCategory,
  getMissingStatementMonths,
  updateStatementUpload,
  exportBackup,
  importBackup,
  applyImport,
};
