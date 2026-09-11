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

function extractBofAAmount(text) {
  const trimmed = text.trim();
  const matches = trimmed.match(/\b\d{1,2}\.\d{2}\b/g);
  if (!matches || matches.length === 0) return null;

  const candidates = matches.map(m => parseFloat(m)).filter(num => !isNaN(num));

  if (candidates.length === 0) return null;

  const small = candidates.filter(num => Math.abs(num) <= 1000);
  if (small.length > 0) {
    return small[small.length - 1];
  }

  return null;
}

function parseBofACreditStatement(text, statementYear) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const transactions = [];
  
  const sectionHeaders = [
    'Payments and Other Credits',
    'Purchases and Adjustments',
    'Interest Charged',
  ];
  
  const totalPatterns = [
    /^TOTAL PAYMENTS AND OTHER CREDITS FOR THIS PERIOD/i,
    /^TOTAL PURCHASES AND ADJUSTMENTS FOR THIS PERIOD/i,
    /^TOTAL INTEREST CHARGED FOR THIS PERIOD/i,
  ];
  
  let inSection = false;
  let currentSection = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (sectionHeaders.some(header => line.includes(header))) {
      inSection = true;
      currentSection = line;
      continue;
    }
    
    if (inSection && totalPatterns.some(pattern => pattern.test(line))) {
      inSection = false;
      currentSection = null;
      continue;
    }
    
    if (!inSection || !currentSection) continue;
    
    const dateMatch = line.match(/^(\d{2}\/\d{2})\s*(\d{2}\/\d{2})/);
    if (!dateMatch) continue;
    
    const [txnMonth, txnDay] = dateMatch[1].split('/');
    const date = `${statementYear}-${txnMonth}-${txnDay}`;
    const descriptionAndAmount = line.slice(dateMatch[0].length).trim();
    
    let amount = null;
    let description = descriptionAndAmount;
    const nextLine = lines[i + 1] || '';
    
    if (currentSection.includes('Payments and Other Credits')) {
      if (looksLikeAmount(nextLine)) {
        amount = parseMoney(nextLine);
        i++;
      } else {
        amount = extractBofAAmount(descriptionAndAmount);
      }
    } else {
      const purchaseMatch = descriptionAndAmount.match(/^(.+?)(\d{4})(\d{4})([\d,]+\.\d{2})$/);
      if (purchaseMatch) {
        description = purchaseMatch[1].trim();
        amount = parseMoney(purchaseMatch[4]);
      } else {
        amount = extractBofAAmount(descriptionAndAmount);
      }
      if (amount === null) {
        amount = extractAmountFromEnd(descriptionAndAmount);
      }
    }
    
    if (amount === null || Math.abs(amount) < 0.01) continue;
    
    const cleanedDescription = description
      .replace(/\s+/g, ' ')
      .replace(/\$/g, '')
      .trim()
      .substring(0, 200);
    
    transactions.push({
      date,
      description: cleanedDescription,
      amount: Math.abs(amount),
      category: 'other',
      transaction_type: currentSection.includes('Payments') ? 'payment' : 'expense',
    });
  }
  
  return transactions;
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
  const statementYear = detectStatementYear(text);
  
  if (institution === 'bofa_credit') {
    return parseBofACreditStatement(text, statementYear);
  }
  
  return [];
}

module.exports = {
  parse,
  detectInstitution,
  detectStatementYear,
  parseMoney,
  looksLikeAmount,
  normalizeDate,
  extractAmountFromEnd,
};
