const DEFAULT_DATE = new Date().toISOString().split('T')[0]

function parseMMDDYY(value) {
  if (!value) return DEFAULT_DATE
  const digits = value.replace(/\D/g, '')
  if (digits.length === 6) {
    const month = digits.slice(0, 2)
    const day = digits.slice(2, 4)
    const year = '20' + digits.slice(4, 6)
    return `${year}-${month}-${day}`
  }
  if (digits.length === 8) {
    const month = digits.slice(0, 2)
    const day = digits.slice(2, 4)
    const year = digits.slice(4, 8)
    return `${year}-${month}-${day}`
  }
  return DEFAULT_DATE
}

function extractAmount(text) {
  const match = text.match(/(-?\$[\d,]+\.\d{2})/)
  if (!match) return null
  return parseFloat(match[1].replace(/[$,]/g, ''))
}

const KNOWN_TYPES = ['Standard', 'Credit', 'Debit', 'Adjustment', 'Payment']

function stripKnownTypePrefix(description) {
  for (const type of KNOWN_TYPES) {
    if (description.startsWith(type)) {
      return description.slice(type.length)
    }
  }
  return description
}

function parsePayPal(text) {
  const transactions = []
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0)

  const currentActivityIndex = lines.findIndex((line) => line.includes('CURRENT ACTIVITY'))
  if (currentActivityIndex === -1) return transactions

  const sectionLines = lines.slice(currentActivityIndex)
  let currentSection = null

  for (let i = 0; i < sectionLines.length; i++) {
    const line = sectionLines[i]

    if (line.includes('PAYMENTS') && line.includes('CREDITS')) {
      currentSection = 'payments'
      continue
    }
    if (line.includes('PURCHASES') && line.includes('ADJUSTMENTS')) {
      currentSection = 'purchases'
      continue
    }
    if (line.startsWith('Total') || line.includes('Totals Year-To-Date')) {
      currentSection = null
      continue
    }

    if (!currentSection) continue

    const dateMatch = line.match(/(\d{2}\/\d{2}\/\d{2})(\d{2}\/\d{2}\/\d{2})/)
    if (!dateMatch) continue

    const tranDate = parseMMDDYY(dateMatch[1].replace(/\//g, ''))
    let remainder = line.slice(dateMatch[0].length)

    const referenceMatch = remainder.match(/^([A-Z0-9]{16,17})/)
    const reference = referenceMatch ? referenceMatch[1] : ''
    if (reference) {
      remainder = remainder.slice(reference.length)
    }

    const lookAhead = []
    for (let j = i + 1; j < sectionLines.length && j < i + 5; j++) {
      const next = sectionLines[j]
      if (next.startsWith('Total') || next.includes('PURCHASES') || next.includes('PAYMENTS')) break
      if (next.match(/\d{2}\/\d{2}\/\d{2}/)) break
      lookAhead.push(next)
    }

    const combinedText = [remainder, ...lookAhead].filter(Boolean).join(' ')
    const amount = extractAmount(combinedText)
    if (amount === null) {
      i += lookAhead.length
      continue
    }

    let description = remainder.trim()
    if (description) {
      description = description.replace(/-?\$[\d,]+\.\d{2}/, '').trim()
      description = stripKnownTypePrefix(description)
    }

    if (lookAhead.length > 0) {
      description = [description, ...lookAhead].filter(Boolean).join(' ').trim()
      description = description.replace(/-?\$[\d,]+\.\d{2}/, '').trim()
    }

    transactions.push({
      date: tranDate,
      description: description || 'PayPal Transaction',
      amount: Math.abs(amount),
      category: 'other',
      transaction_type: currentSection === 'payments' ? 'payment' : 'expense',
    })

    i += lookAhead.length
  }

  return transactions
}

function parse(text) {
  return parsePayPal(text)
}

function detectPayPal(text) {
  const upper = text.toUpperCase()
  return upper.includes('PAYPAL') && (upper.includes('PAYPAL CREDIT') || upper.includes('SYNCB'))
}

module.exports = {
  parse,
  detectPayPal,
  parsePayPal,
}
