'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import MonthPicker from '../components/MonthPicker'
import type { Card, StatementUpload } from '../../types/electron'

export default function StatementsPage() {
  const pathname = usePathname()
  const [cards, setCards] = useState<Card[]>([])
  const [uploads, setUploads] = useState<StatementUpload[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)

  const [importingOpen, setImportingOpen] = useState(false)
  const [cardId, setCardId] = useState('')
  const [statementMonth, setStatementMonth] = useState('')
  const [filePath, setFilePath] = useState<string | null>(null)
  const [parsedTransactions, setParsedTransactions] = useState<any[]>([])
  const [importResult, setImportResult] = useState<{ added: number; skipped: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'form' | 'preview' | 'result'>('form')

  const load = async () => {
    setLoading(true)
    try {
      const [cardsData, uploadsData] = await Promise.all([
        window.api.db.getCards(),
        window.api.db.getStatementUploads(),
      ])
      setCards(cardsData)
      setUploads(uploadsData)
    } catch (e) {
      console.error('Failed to load statements', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [pathname])

  const openImport = () => {
    setCardId(cards[0]?.id?.toString() || '')
    setStatementMonth('')
    setFilePath(null)
    setParsedTransactions([])
    setImportResult(null)
    setError(null)
    setStep('form')
    setImportingOpen(true)
  }

  const handleFileSelect = async () => {
    const selected = await window.api.dialog.openFile({
      filters: [{ name: 'PDFs', extensions: ['pdf'] }],
    })
    if (!selected) return
    setFilePath(selected)

    const result = await window.api.parsePdf(selected)
    if (!result.success) {
      setError(`Failed to parse PDF: ${result.error}`)
      return
    }

    const transactions = (result.transactions || []).map((tx: any) => ({
      ...tx,
      card_id: parseInt(cardId),
      statement_file: selected.split(/[\\/]/).pop(),
    }))

    setParsedTransactions(transactions)
    setStep('preview')
    setError(null)
  }

  const handleConfirmImport = async () => {
    if (!cardId || !statementMonth) {
      setError('Please select a card and enter a statement month.')
      return
    }

    setImporting(true)
    try {
      const { added, skipped } = await window.api.db.addTransactionsBatch(parsedTransactions)

      await window.api.db.addStatementUpload({
        card_id: parseInt(cardId),
        statement_month: statementMonth,
        source_file: filePath?.split(/[\\/]/).pop() || '',
        transaction_count: added,
      })

      setImportResult({ added, skipped })
      setStep('result')
      load()
    } catch (e) {
      console.error('Import failed', e)
      setError('Import failed.')
    } finally {
      setImporting(false)
    }
  }

  const grouped = uploads.reduce<Record<string, StatementUpload[]>>((acc, upload) => {
    const key = upload.statement_month
    if (!acc[key]) acc[key] = []
    acc[key].push(upload)
    return acc
  }, {})

  const sortedMonths = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-zinc-500">Loading statements...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Statements</h1>
        <button
          onClick={openImport}
          disabled={importing}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {importing ? 'Importing...' : 'Import Statement'}
        </button>
      </div>

      {cards.length === 0 ? (
        <p className="text-sm text-zinc-500">Add a card first to import statements.</p>
      ) : sortedMonths.length === 0 ? (
        <p className="text-sm text-zinc-500">No statements imported yet. Click "Import Statement" to get started.</p>
      ) : (
        <div className="rounded-lg border border-black/10 dark:border-white/10 divide-y divide-black/10 dark:divide-white/10">
          {sortedMonths.map((month) => (
            <div key={month} className="p-4">
              <h3 className="text-sm font-medium mb-2">{month}</h3>
              <div className="space-y-2">
                {grouped[month].map((upload) => (
                  <div key={upload.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium">{upload.card_name}</span>
                      {upload.card_institution && (
                        <span className="text-zinc-500 ml-2">({upload.card_institution})</span>
                      )}
                    </div>
                    <div className="text-right text-zinc-500">
                      <p>{upload.source_file}</p>
                      <p>{upload.transaction_count} transactions · {new Date(upload.imported_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {importingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-auto space-y-4">
            {step === 'form' && (
              <>
                <h2 className="text-lg font-semibold">Import Statement</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Card</label>
                    <select
                      value={cardId}
                      onChange={(e) => setCardId(e.target.value)}
                      className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
                    >
                      <option value="">Select card</option>
                      {cards.map((card) => (
                        <option key={card.id} value={card.id}>
                          {card.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Statement Month</label>
                    <MonthPicker
                      value={statementMonth}
                      onChange={setStatementMonth}
                      placeholder="Select month"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">PDF File</label>
                    <button
                      onClick={handleFileSelect}
                      className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      {filePath ? 'Change PDF' : 'Choose PDF'}
                    </button>
                    {filePath && (
                      <p className="text-sm text-zinc-500 mt-1">{filePath.split(/[\\/]/).pop()}</p>
                    )}
                  </div>
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setImportingOpen(false)}
                    className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleFileSelect}
                    disabled={!cardId || !statementMonth}
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    Parse PDF
                  </button>
                </div>
              </>
            )}

            {step === 'preview' && (
              <>
                <h2 className="text-lg font-semibold">Review Transactions</h2>
                <p className="text-sm text-zinc-500">Found {parsedTransactions.length} transactions</p>
                <div className="max-h-[50vh] overflow-auto divide-y divide-black/10 dark:divide-white/10 border border-black/10 dark:border-white/10 rounded-md">
                  {parsedTransactions.map((tx, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 text-sm">
                      <div>
                        <p className="font-medium">{tx.description}</p>
                        <p className="text-xs text-zinc-500">
                          {tx.date} · {tx.category} · {tx.transaction_type}
                        </p>
                      </div>
                      <p className="font-medium tabular-nums">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(tx.amount)}</p>
                    </div>
                  ))}
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setStep('form')}
                    className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleConfirmImport}
                    disabled={importing || parsedTransactions.length === 0}
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {importing ? 'Importing...' : `Import ${parsedTransactions.length} Transactions`}
                  </button>
                </div>
              </>
            )}

            {step === 'result' && importResult && (
              <>
                <h2 className="text-lg font-semibold">Import Complete</h2>
                <p className="text-sm text-zinc-500">
                  Added <span className="font-medium text-zinc-900 dark:text-zinc-100">{importResult.added}</span> transactions.
                  {importResult.skipped > 0 && (
                    <span> Skipped <span className="font-medium text-zinc-900 dark:text-zinc-100">{importResult.skipped}</span> duplicates.</span>
                  )}
                </p>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setImportingOpen(false)}
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
