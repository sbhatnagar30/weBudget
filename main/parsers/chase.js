const pdfParse = require('pdf-parse');

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

function normalizeShortDate(raw, statementYear) {
  const str = String(raw).trim();
  let match = str.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (!match) return null;
  let [, month, day] = match;
  month = String(month).padStart(2, '0');
  day = String(day).padStart(2, '0');
  return `${statementYear}-${month}-${day}`;
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

function parse(text) {
  const institution = detectInstitution(text);
  if (institution !== 'chase_amazon') return [];
  
  const statementYear = detectStatementYear(text);
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const transactions = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let tx = parseChaseLine(line, statementYear);
    if (!tx) tx = parseChaseLineAlt(line, statementYear);
    if (tx) transactions.push(tx);
  }
  
  return transactions;
}

module.exports = {
  parse,
  detectInstitution,
  detectStatementYear,
  parseMoney,
  looksLikeAmount,
  normalizeDate,
  normalizeShortDate,
  extractAmountFromEnd,
};
