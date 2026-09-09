const pdfParse = require('pdf-parse');
const fs = require('fs');

function parseMoney(value) {
  if (!value) return null;
  const cleaned = String(value).replace(/[^0-9.\-()]/g, '');
  if (cleaned.includes('(')) {
    return -parseFloat(cleaned.replace(/[()]/g, ''));
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function looksLikeAmount(text) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return /^\(?\$?[\d,]+\.?\d{0,2}\)?$/.test(trimmed) || /^\(?\$?\-?[\d,]+\.?\d{0,2}\)?$/.test(trimmed);
}

function normalizeDate(raw) {
  const str = String(raw).trim();
  let match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!match) return null;
  let [, month, day, year] = match;
  if (year.length === 2) {
    year = parseInt(year) >= 70 ? `19${year}` : `20${year}`;
  }
  month = String(month).padStart(2, '0');
  day = String(day).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function extractAmountFromEnd(line) {
  const trimmed = line.trim();
  const moneyMatch = trimmed.match(/(?:\$?\-?\(?[\d,]+\.\d{2}\)?)\s*$/);
  if (!moneyMatch) return null;
  return parseMoney(moneyMatch[0]);
}

function parseChaseLine(line, statementYear) {
  const match = line.match(/^(\d{2}\/\d{2})\s+(.+?)([\-]?\d{1,3}(?:,\d{3})*\.\d{2})\s*$/);
  if (!match) return null;
  const date = normalizeShortDate(match[1], statementYear);
  if (!date) return null;
  const description = match[2].trim();
  const amount = parseMoney(match[3]);
  if (amount === null || !description) return null;
  return {
    date,
    description: description.replace(/\s+/g, ' ').substring(0, 200),
    amount: Math.abs(amount),
    category: 'other',
    transaction_type: amount < 0 ? 'payment' : 'expense',
  };
}

function parseChaseLineAlt(line, statementYear) {
  const dateMatch = line.match(/^(\d{2}\/\d{2})\s+/);
  if (!dateMatch) return null;
  const date = normalizeShortDate(dateMatch[1], statementYear);
  if (!date) return null;
  
  const amountMatch = line.match(/([\-]?\d{1,3}(?:,\d{3})*\.\d{2})\s*$/);
  if (!amountMatch) return null;
  const amount = parseMoney(amountMatch[1]);
  if (amount === null) return null;
  
  const description = line.slice(dateMatch[0].length, line.length - amountMatch[1].length).trim();
  if (!description) return null;
  
  return {
    date,
    description: description.replace(/\s+/g, ' ').substring(0, 200),
    amount: Math.abs(amount),
    category: 'other',
    transaction_type: amount < 0 ? 'payment' : 'expense',
  };
}

function parseCostcoLine(line, statementYear) {
  const match = line.match(/^(\d{2}\/\d{2})(\d{2}\/\d{2})(.+?)\$(\-?[\d,]+\.\d{2})\s*$/);
  if (!match) return null;
  const [m1, d1] = match[1].split('/');
  const date = `${statementYear}-${m1}-${d1}`;
  const description = match[3].trim();
  const amount = parseFloat(match[4].replace(/,/g, ''));
  if (isNaN(amount) || !description) return null;
  return {
    date,
    description: description.replace(/\s+/g, ' ').substring(0, 200),
    amount: Math.abs(amount),
    category: 'other',
    transaction_type: match[4].startsWith('-') ? 'payment' : 'expense',
  };
}

function parseBofACreditLine(line, statementYear, nextLine) {
  const match = line.match(/^(\d{2}\/\d{2})(\d{2}\/\d{2})(.+)$/);
  if (!match) return null;
  const [txnMonth, txnDay] = match[1].split('/');
  const date = `${statementYear}-${txnMonth}-${txnDay}`;
  let description = match[3].replace(/\s+/g, ' ').trim();
  
  let amount = extractBofAAmount(description);
  if (amount === null && nextLine && looksLikeAmount(nextLine)) {
    amount = parseMoney(nextLine);
  }
  if (amount === null) return null;
  
  return {
    date,
    description: description.substring(0, 200),
    amount: Math.abs(amount),
    category: 'other',
    transaction_type: amount < 0 ? 'payment' : 'expense',
  };
}

function extractBofAAmount(text) {
  const trimmed = text.trim();
  const matches = trimmed.match(/(?:\$?\-?\(?[\d,]+\.\d{2}\)?)/g);
  if (!matches || matches.length === 0) return null;
  const last = matches[matches.length - 1];
  const numStr = last.replace(/[$,()]/g, '').replace(/^\-/, '-');
  const num = parseFloat(numStr);
  if (isNaN(num)) return null;
  if (Math.abs(num) > 50000) return null;
  return num;
}

function parseBofACheckingLine(lines, index, statementYear) {
  const line = lines[index];
  const match = line.match(/^(\d{2}\/\d{2}\/\d{2})(.+)$/);
  if (!match) return null;
  const date = normalizeDate(match[1]);
  if (!date) return null;
  let description = match[2].replace(/\s+/g, ' ').trim();
  
  let amount = extractAmountFromEnd(description);
  let lookAhead = 0;
  while (amount === null && index + lookAhead + 1 < lines.length) {
    lookAhead++;
    const nextLine = lines[index + lookAhead];
    if (looksLikeAmount(nextLine)) {
      amount = parseMoney(nextLine);
      break;
    }
    if (/^(?:Date|Total|continued)/i.test(nextLine)) break;
  }
  if (amount === null) return null;
  
  return {
    date,
    description: description.substring(0, 200),
    amount: Math.abs(amount),
    category: 'other',
    transaction_type: amount < 0 ? 'payment' : 'expense',
    lookAhead,
  };
}

function parseSynchronyLine(line, statementYear) {
  const match = line.match(/^(\d{2}\/\d{2}\/\d{4})(\d{2}\/\d{2}\/\d{4})(.+?)(\$?\(?([\-]?[\d,]+\.\d{2})\)?)\s*$/);
  if (!match) return null;
  const date = normalizeDate(match[1]);
  if (!date) return null;
  let description = match[3].trim().replace(/\(+$/, '').replace(/\s+/g, ' ');
  const rawAmount = match[4];
  const amount = parseMoney(rawAmount);
  if (amount === null || !description) return null;
  return {
    date,
    description: description.substring(0, 200),
    amount: Math.abs(amount),
    category: 'other',
    transaction_type: amount < 0 ? 'payment' : 'expense',
  };
}

function normalizeShortDate(raw, statementYear) {
  const str = String(raw).trim();
  let match = str.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (!match) return null;
  let [, month, day] = match;
  month = String(month).padStart(2, '0');
  day = String(day).padStart(2, '0');
  return `${statementYear}-${month}-${day}`;
}

function detectStatementYear(text) {
  const periodMatch = text.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i);
  if (periodMatch) {
    const yearMatch = periodMatch[0].match(/\d{4}/);
    if (yearMatch) return yearMatch[0];
  }
  
  const closingMatch = text.match(/Statement\s+Closing\s+Date[:\s]+(\d{2})\/(\d{2})\/(\d{2,4})/i);
  if (closingMatch) {
    let year = closingMatch[3];
    if (year.length === 2) year = parseInt(year) >= 70 ? `19${year}` : `20${year}`;
    return year;
  }
  
  const billingMatch = text.match(/Billing\s+Period[:\s]+(\d{2})\/(\d{2})\/(\d{2,4})/i);
  if (billingMatch) {
    let year = billingMatch[3];
    if (year.length === 2) year = parseInt(year) >= 70 ? `19${year}` : `20${year}`;
    return year;
  }
  
  const rangeMatch = text.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i);
  if (rangeMatch) {
    const yearMatch = rangeMatch[0].match(/\d{4}/);
    if (yearMatch) return yearMatch[0];
  }
  
  const fourDigitMatch = text.match(/\b(20\d{2})\b/);
  if (fourDigitMatch) return fourDigitMatch[1];
  
  return new Date().getFullYear().toString();
}

function detectInstitution(text) {
  const upper = text.toUpperCase();
  if (upper.includes('CHASE') && upper.includes('AMAZON')) return 'chase_amazon';
  if (upper.includes('COSTCO') && upper.includes('CITI')) return 'citi_costco';
  if (upper.includes('BANK OF AMERICA') && upper.includes('ADV PLUS BANKING')) return 'bofa_checking';
  if (upper.includes('BANK OF AMERICA') && upper.includes('VISA SIGNATURE')) return 'bofa_credit';
  if (upper.includes('SYNCHRONY')) return 'synchrony';
  if (upper.includes('BANK OF AMERICA')) return 'bofa_credit';
  return 'generic';
}

function parseStatementText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const transactions = [];
  const institution = detectInstitution(text);
  const statementYear = detectStatementYear(text);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let tx = null;

    if (institution === 'chase_amazon') {
      tx = parseChaseLine(line, statementYear);
      if (!tx) tx = parseChaseLineAlt(line, statementYear);
    } else if (institution === 'citi_costco') {
      tx = parseCostcoLine(line, statementYear);
    } else if (institution === 'bofa_credit') {
      const nextLine = lines[i + 1] || '';
      tx = parseBofACreditLine(line, statementYear, nextLine);
      if (tx) i++;
    } else if (institution === 'bofa_checking') {
      tx = parseBofACheckingLine(lines, i, statementYear);
      if (tx && tx.lookAhead) {
        i += tx.lookAhead;
        delete tx.lookAhead;
      }
    } else if (institution === 'synchrony') {
      tx = parseSynchronyLine(line, statementYear);
    } else {
      tx = parseGenericLine(line, statementYear);
    }

    if (tx) {
      transactions.push(tx);
    }
  }

  return transactions;
}

function parseGenericLine(line, statementYear) {
  const match = line.match(/^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+(.+?)\s+([\-]?\$?[\d,]+\.\d{2})\s*$/);
  if (!match) return null;
  const date = normalizeDate(match[1]);
  if (!date) return null;
  const description = match[2].trim();
  const amount = parseMoney(match[3]);
  if (amount === null || !description) return null;
  return {
    date,
    description: description.replace(/\s+/g, ' ').substring(0, 200),
    amount: Math.abs(amount),
    category: 'other',
    transaction_type: amount < 0 ? 'payment' : 'expense',
  };
}

function parseStatement(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    return pdfParse(dataBuffer).then(data => {
      const transactions = parseStatementText(data.text);
      return { success: true, transactions, text: data.text };
    });
  } catch (error) {
    return Promise.resolve({ success: false, error: error.message, transactions: [] });
  }
}

module.exports = {
  parseStatementText,
  parseStatement,
  normalizeDate,
  parseMoney,
  detectInstitution,
};
