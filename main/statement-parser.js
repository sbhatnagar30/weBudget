const pdfParse = require('pdf-parse');
const parsers = require('./parsers');

async function parseStatement(filePath, institution) {
  try {
    const dataBuffer = require('fs').readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    const text = data.text;
    const detectedInstitution = parsers.detectInstitution(text);
    const transactions = parsers.parse(text, detectedInstitution);
    return { success: true, transactions, text, institution: detectedInstitution };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function detectInstitution(text) {
  return parsers.detectInstitution(text);
}

function getSupportedInstitutions() {
  return parsers.getSupportedInstitutions();
}

module.exports = {
  parseStatement,
  detectInstitution,
  getSupportedInstitutions,
};
