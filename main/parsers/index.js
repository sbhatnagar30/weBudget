const bofaCredit = require('./bofa-credit');
const bofaChecking = require('./bofa-checking');
const chase = require('./chase');
const costco = require('./costco');
const synchrony = require('./synchrony');
const bestbuy = require('./bestbuy');
const paypal = require('./paypal');

const PARSERS = {
  bofa_credit: bofaCredit,
  bofa_checking: bofaChecking,
  chase_amazon: chase,
  citi_costco: costco,
  synchrony: synchrony,
  bestbuy: bestbuy,
  paypal: paypal,
};

function getParser(institution) {
  return PARSERS[institution] || null;
}

function getSupportedInstitutions() {
  return Object.keys(PARSERS);
}

function parse(text, institution) {
  const parser = getParser(institution);
  if (!parser) return [];
  return parser.parse(text);
}

function detectInstitution(text) {
  const upper = text.toUpperCase();
  if (upper.includes('CHASE') && upper.includes('AMAZON')) return 'chase_amazon';
  if (upper.includes('COSTCO') && upper.includes('CITI')) return 'citi_costco';
  if (upper.includes('BANK OF AMERICA') && upper.includes('ADV PLUS BANKING')) return 'bofa_checking';
  if (upper.includes('BANK OF AMERICA') && upper.includes('VISA SIGNATURE')) return 'bofa_credit';
  if (upper.includes('PAYPAL CREDIT') || (upper.includes('PAYPAL') && upper.includes('SYNCB'))) return 'paypal';
  if (upper.includes('BEST BUY')) return 'bestbuy';
  if (upper.includes('SYNCHRONY')) return 'synchrony';
  if (upper.includes('BANK OF AMERICA')) return 'bofa_credit';
  return 'generic';
}

module.exports = {
  parse,
  detectInstitution,
  getParser,
  getSupportedInstitutions,
  PARSERS,
};
