'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import MonthWheelPicker from '../components/ui/MonthWheelPicker'
import type { Card, StatementUpload, Transaction, BankAccount } from '../../types/electron'

export default function StatementsPage() {
  const pathname = usePathname()
  const [cards, setCards] = useState<Card[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [uploads, setUploads] = useState<StatementUpload[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)

  const [importingOpen, setImportingOpen] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [accountType, setAccountType] = useState<'card' | 'bank'>('card')
  const [statementMonth, setStatementMonth] = useState('')
  const [filePath, setFilePath] = useState<string | null>(null)
  const [parsedTransactions, setParsedTransactions] = useState<any[]>([])
  const [importResult, setImportResult] = useState<{ added: number; skipped: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'form' | 'preview' | 'result'>('form')

  const [expandedUploadId, setExpandedUploadId] = useState<number | null>(null)
  const [uploadTransactions, setUploadTransactions] = useState<Record<number, Transaction[]>>({})
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [newTx, setNewTx] = useState<Partial<Transaction> | null>(null)

  const [exportOpen, setExportOpen] = useState(false)
  const [exportRange, setExportRange] = useState<'all' | 'month'>('all')
  const [exportMonth, setExportMonth] = useState('')
  const [exporting, setExporting] = useState(false)

  const [importOpen, setImportOpen] = useState(false)
  const [importFilePath, setImportFilePath] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<any | null>(null)
  const [importConflicts, setImportConflicts] = useState<any[]>([])
  const [importResolutions, setImportResolutions] = useState<Record<number, string>>({})
  const [importingBackup, setImportingBackup] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [cardsData, bankAccountsData, uploadsData] = await Promise.all([
        window.api.db.getCards(),
        window.api.db.getBankAccounts(),
        window.api.db.getStatementUploads(),
      ])
      setCards(cardsData)
      setBankAccounts(bankAccountsData)
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
    const firstCard = cards[0] ? `card-${cards[0].id}` : ''
    const firstBank = bankAccounts[0] ? `bank-${bankAccounts[0].id}` : ''
    setAccountId(firstCard || firstBank || '')
    setAccountType(cards.length > 0 ? 'card' : 'bank')
    setStatementMonth('')
    setFilePath(null)
    setParsedTransactions([])
    setImportResult(null)
    setError(null)
    setStep('form')
    setImportingOpen(true)
  }

  const handleAccountChange = (value: string) => {
    setAccountId(value)
    const isCard = value.startsWith('card-')
    setAccountType(isCard ? 'card' : 'bank')
  }

  const selectedAccount = accountType === 'card'
    ? cards.find((c) => c.id === parseInt(accountId.replace('card-', ''), 10))
    : bankAccounts.find((b) => b.id === parseInt(accountId.replace('bank-', ''), 10))

  const handleFileSelect = async () => {
    const selected = await window.api.dialog.openFile({
      filters: [{ name: 'PDFs', extensions: ['pdf'] }],
    })
    if (!selected) return
    setFilePath(selected)

    const institution = selectedAccount?.institution || undefined

    const result = await window.api.parsePdf(selected, institution)
    if (!result.success) {
      setError(`Failed to parse PDF: ${result.error}`)
      return
    }

    const transactions = (result.transactions || []).map((tx: any) => ({
      ...tx,
      card_id: accountType === 'card' ? parseInt(accountId.replace('card-', ''), 10) : undefined,
      bank_account_id: accountType === 'bank' ? parseInt(accountId.replace('bank-', ''), 10) : undefined,
      statement_file: selected.split(/[\\/]/).pop(),
    }))

    setParsedTransactions(transactions)
    setStep('preview')
    setError(null)
  }

  const handleConfirmImport = async () => {
    if (!accountId || !statementMonth) {
      setError('Please select an account and enter a statement month.')
      return
    }

    setImporting(true)
    try {
      const { added, skipped } = await window.api.db.addTransactionsBatch(parsedTransactions)

      await window.api.db.addStatementUpload({
        card_id: accountType === 'card' ? parseInt(accountId.replace('card-', ''), 10) : undefined,
        bank_account_id: accountType === 'bank' ? parseInt(accountId.replace('bank-', ''), 10) : undefined,
        statement_month: statementMonth,
        source_file: filePath?.split(/[\\/]/).pop() || '',
        transaction_count: added,
        institution: selectedAccount?.institution || undefined,
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

  const toggleExpand = async (upload: StatementUpload) => {
    if (expandedUploadId === upload.id) {
      setExpandedUploadId(null)
      return
    }

    setExpandedUploadId(upload.id)
    if (!uploadTransactions[upload.id]) {
      try {
        const txs = await window.api.db.getTransactionsForStatement(upload.source_file)
        setUploadTransactions(prev => ({ ...prev, [upload.id]: txs }))
      } catch (e) {
        console.error('Failed to load statement transactions', e)
      }
    }
  }

  const handleUpdateTransaction = async (tx: Transaction) => {
    try {
      await window.api.db.updateTransaction(tx.id, tx)
      setUploadTransactions(prev => ({
        ...prev,
        [expandedUploadId!]: (prev[expandedUploadId!] || []).map(t => t.id === tx.id ? tx : t),
      }))
      setEditingTx(null)
    } catch (e) {
      console.error('Failed to update transaction', e)
      alert('Failed to update transaction.')
    }
  }

  const handleAddTransaction = async () => {
    if (!newTx || !expandedUploadId) return
    try {
      const upload = uploads.find(u => u.id === expandedUploadId)
      const created = await window.api.db.addTransaction({
        ...newTx,
        card_id: upload?.card_id || undefined,
        bank_account_id: upload?.bank_account_id || undefined,
        statement_file: upload?.source_file || '',
        amount: Number(newTx.amount) || 0,
        date: newTx.date || new Date().toISOString().split('T')[0],
        description: newTx.description || 'Manual transaction',
        category: newTx.category || 'other',
        transaction_type: newTx.transaction_type || 'expense',
      } as any)
      setUploadTransactions(prev => ({
        ...prev,
        [expandedUploadId!]: [...(prev[expandedUploadId!] || []), created],
      }))
      setNewTx(null)
    } catch (e) {
      console.error('Failed to add transaction', e)
      alert('Failed to add transaction.')
    }
  }

  const handleDeleteTransaction = async (txId: number) => {
    if (!confirm('Delete this transaction?')) return
    try {
      await window.api.db.deleteTransaction(txId)
      setUploadTransactions(prev => ({
        ...prev,
        [expandedUploadId!]: (prev[expandedUploadId!] || []).filter(t => t.id !== txId),
      }))
    } catch (e) {
      console.error('Failed to delete transaction', e)
      alert('Failed to delete transaction.')
    }
  }

  const handleDeleteStatement = async (upload: StatementUpload) => {
    if (!confirm(`Delete statement &quot;${upload.source_file}&quot; and all its transactions?`)) return
    try {
      await window.api.db.deleteStatementUpload(upload.id)
      setUploads(prev => prev.filter(u => u.id !== upload.id))
      setUploadTransactions(prev => {
        const next = { ...prev }
        delete next[upload.id]
        return next
      })
      if (expandedUploadId === upload.id) setExpandedUploadId(null)
    } catch (e) {
      console.error('Failed to delete statement', e)
      alert('Failed to delete statement.')
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const filters: any = {}
      if (exportRange === 'month' && exportMonth) {
        const [year, month] = exportMonth.split('-')
        filters.start_date = `${year}-${month}-01`
        filters.end_date = `${year}-${month}-${new Date(parseInt(year), parseInt(month), 0).getDate()}`
      }
      const backup = await window.api.db.exportBackup(filters)
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `webudget-backup-${exportRange === 'month' && exportMonth ? exportMonth : 'all'}-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      setExportOpen(false)
    } catch (e) {
      console.error('Export failed', e)
      alert('Export failed.')
    } finally {
      setExporting(false)
    }
  }

  const handleImportFileSelect = async () => {
    const selected = await window.api.dialog.openFile({
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (!selected) return
    setImportFilePath(selected)
    setImportError(null)
    try {
      const text = await (await fetch(selected)).text()
      const backupData = JSON.parse(text)
      const preview = await window.api.db.importBackup(backupData)
      setImportPreview(backupData)
      setImportConflicts(preview.conflicts)
      setImportResolutions({})
    } catch (e) {
      console.error('Failed to read backup file', e)
      setImportError('Failed to read backup file. Make sure it is a valid weBudget backup.')
      setImportPreview(null)
      setImportConflicts([])
    }
  }

  const handleApplyImport = async () => {
    if (!importPreview) return
    setImportingBackup(true)
    try {
      const resolutions = importConflicts.map((c, i) => importResolutions[i] || 'existing')
      await window.api.db.applyImport(importPreview, resolutions)
      alert('Import complete!')
      setImportOpen(false)
      setImportFilePath(null)
      setImportPreview(null)
      setImportConflicts([])
      setImportResolutions({})
      load()
    } catch (e) {
      console.error('Import failed', e)
      alert('Import failed.')
    } finally {
      setImportingBackup(false)
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
        <div className="flex gap-2">
          <button
            onClick={() => setExportOpen(true)}
            className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Export Backup
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Import Backup
          </button>
          <button
            onClick={openImport}
            disabled={importing}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {importing ? 'Importing...' : 'Import Statement'}
          </button>
        </div>
      </div>

      {(cards.length === 0 && bankAccounts.length === 0) ? (
        <p className="text-sm text-zinc-500">Add a card or bank account first to import statements.</p>
      ) : sortedMonths.length === 0 ? (
        <p className="text-sm text-zinc-500">No statements imported yet. Click &quot;Import Statement&quot; to get started.</p>
      ) : (
        <div className="rounded-lg border border-black/10 dark:border-white/10 divide-y divide-black/10 dark:divide-white/10">
          {sortedMonths.map((month) => (
            <div key={month} className="p-4">
              <h3 className="text-sm font-medium mb-2">{month}</h3>
              <div className="space-y-2">
                {grouped[month].map((upload) => {
                  const isExpanded = expandedUploadId === upload.id
                  const txs = uploadTransactions[upload.id] || []
                  const total = txs.reduce((sum, tx) => sum + tx.amount, 0)
                  const payments = txs.filter(tx => tx.transaction_type === 'payment').reduce((sum, tx) => sum + tx.amount, 0)
                  const expenses = txs.filter(tx => tx.transaction_type === 'expense').reduce((sum, tx) => sum + tx.amount, 0)
                  const income = txs.filter(tx => tx.transaction_type === 'income').reduce((sum, tx) => sum + tx.amount, 0)

                  const accountName = upload.card_name || upload.bank_name || 'Unknown'
                  const accountInstitution = upload.card_institution || upload.bank_institution

                  return (
                    <div key={upload.id} className="rounded-md border border-black/10 dark:border-white/10 overflow-hidden">
                      <div className="flex">
                        <button
                          onClick={() => toggleExpand(upload)}
                          className="flex-1 flex items-center justify-between p-3 text-sm text-left hover:bg-zinc-50 dark:hover:bg-zinc-900"
                        >
                          <div>
                            <span className="font-medium">{accountName}</span>
                            {accountInstitution && (
                              <span className="text-zinc-500 ml-2">({accountInstitution})</span>
                            )}
                          </div>
                          <div className="text-right text-zinc-500">
                            <p>{upload.source_file}</p>
                            <p>{upload.transaction_count} transactions · {new Date(upload.imported_at).toLocaleDateString()}</p>
                            {isExpanded && (
                              <p className="mt-1 text-xs">
                                Income: ${income.toFixed(2)} · Payments: ${payments.toFixed(2)} · Expenses: ${expenses.toFixed(2)} · Total: ${total.toFixed(2)}
                              </p>
                            )}
                          </div>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteStatement(upload)
                          }}
                          className="px-3 py-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                        >
                          Delete
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-black/10 dark:border-white/10">
                          <div className="p-3 space-y-2">
                            {txs.map((tx) => (
                              <div key={tx.id} className="flex items-center justify-between p-2 rounded-md border border-black/5 dark:border-white/5">
                                {editingTx?.id === tx.id ? (
                                  <div className="flex-1 grid grid-cols-2 gap-2">
                                    <input
                                      type="date"
                                      value={editingTx.date}
                                      onChange={(e) => setEditingTx({ ...editingTx, date: e.target.value })}
                                      className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-2 py-1 text-sm"
                                    />
                                    <input
                                      type="text"
                                      value={editingTx.description}
                                      onChange={(e) => setEditingTx({ ...editingTx, description: e.target.value })}
                                      className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-2 py-1 text-sm"
                                    />
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={editingTx.amount}
                                      onChange={(e) => setEditingTx({ ...editingTx, amount: parseFloat(e.target.value) || 0 })}
                                      className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-2 py-1 text-sm"
                                    />
                                    <select
                                      value={editingTx.transaction_type}
                                      onChange={(e) => setEditingTx({ ...editingTx, transaction_type: e.target.value })}
                                      className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-2 py-1 text-sm"
                                    >
                                      <option value="expense">Expense</option>
                                      <option value="payment">Payment</option>
                                      <option value="income">Income</option>
                                    </select>
                                    <div className="col-span-2 flex gap-2">
                                      <button
                                        onClick={() => handleUpdateTransaction(editingTx)}
                                        className="rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
                                      >
                                        Save
                                      </button>
                                      <button
                                        onClick={() => setEditingTx(null)}
                                        className="rounded-md border border-black/10 dark:border-white/10 px-2 py-1 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex-1">
                                      <p className="font-medium">{tx.description}</p>
                                      <p className="text-xs text-zinc-500">
                                        {tx.date} · {tx.transaction_type}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <p className="font-medium tabular-nums">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(tx.amount)}</p>
                                      <button
                                        onClick={() => setEditingTx(tx)}
                                        className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        onClick={() => handleDeleteTransaction(tx.id)}
                                        className="text-xs text-red-500 hover:text-red-700"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}

                            {newTx && (
                              <div className="flex items-center gap-2 p-2 rounded-md border border-dashed border-black/10 dark:border-white/10">
                                <input
                                  type="date"
                                  value={newTx.date || ''}
                                  onChange={(e) => setNewTx({ ...newTx, date: e.target.value })}
                                  className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-2 py-1 text-sm"
                                />
                                <input
                                  type="text"
                                  value={newTx.description || ''}
                                  onChange={(e) => setNewTx({ ...newTx, description: e.target.value })}
                                  placeholder="Description"
                                  className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-2 py-1 text-sm flex-1"
                                />
                                <input
                                  type="number"
                                  step="0.01"
                                  value={newTx.amount || ''}
                                  onChange={(e) => setNewTx({ ...newTx, amount: parseFloat(e.target.value) || 0 })}
                                  placeholder="Amount"
                                  className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-2 py-1 text-sm w-24"
                                />
                                <select
                                  value={newTx.transaction_type || 'expense'}
                                  onChange={(e) => setNewTx({ ...newTx, transaction_type: e.target.value })}
                                  className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-2 py-1 text-sm"
                                >
                                  <option value="expense">Expense</option>
                                  <option value="payment">Payment</option>
                                  <option value="income">Income</option>
                                </select>
                                <button
                                  onClick={handleAddTransaction}
                                  className="rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
                                >
                                  Add
                                </button>
                                <button
                                  onClick={() => setNewTx(null)}
                                  className="rounded-md border border-black/10 dark:border-white/10 px-2 py-1 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}

                            {!newTx && (
                              <button
                                onClick={() => setNewTx({ date: new Date().toISOString().split('T')[0], description: '', amount: 0, transaction_type: 'expense', category: 'other' })}
                                className="w-full rounded-md border border-dashed border-black/10 dark:border-white/10 px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                              >
                                + Add Transaction
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {importingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-lg p-8 w-full max-w-3xl max-h-[90vh] overflow-auto space-y-4">
            {step === 'form' && (
              <>
                <h2 className="text-lg font-semibold">Import Statement</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Account</label>
                    <select
                      value={accountId}
                      onChange={(e) => handleAccountChange(e.target.value)}
                      className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
                    >
                      <option value="">Select account</option>
                      <optgroup label="Cards">
                        {cards.map((card) => (
                          <option key={`card-${card.id}`} value={`card-${card.id}`}>
                            {card.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Bank Accounts">
                        {bankAccounts.map((account) => (
                          <option key={`bank-${account.id}`} value={`bank-${account.id}`}>
                            {account.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Statement Month</label>
                    <MonthWheelPicker
                      value={statementMonth}
                      onChange={setStatementMonth}
                      placeholder="Select month"
                      inline
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">PDF File</label>
                    <button
                      onClick={handleFileSelect}
                      className="w-full rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      {filePath ? 'Change PDF' : 'Choose PDF'}
                    </button>
                    {filePath && (
                      <p className="text-sm text-zinc-500 mt-1 break-all">{filePath.split(/[\\/]/).pop()}</p>
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
                    disabled={!accountId || !statementMonth}
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

      {exportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-lg p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold">Export Backup</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Range</label>
                <select
                  value={exportRange}
                  onChange={(e) => setExportRange(e.target.value as 'all' | 'month')}
                  className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
                >
                  <option value="all">All Data</option>
                  <option value="month">Specific Month</option>
                </select>
              </div>
              {exportRange === 'month' && (
                <div>
                  <label className="block text-sm font-medium mb-1">Month</label>
                  <MonthWheelPicker
                    value={exportMonth}
                    onChange={setExportMonth}
                    placeholder="Select month"
                    inline
                  />
                </div>
              )}
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setExportOpen(false)}
                className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={exporting || (exportRange === 'month' && !exportMonth)}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {exporting ? 'Exporting...' : 'Export'}
              </button>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-auto space-y-4">
            <h2 className="text-lg font-semibold">Import Backup</h2>
            {!importFilePath ? (
              <>
                <p className="text-sm text-zinc-500">Select a weBudget backup JSON file to import.</p>
                <button
                  onClick={handleImportFileSelect}
                  className="w-full rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Choose Backup File
                </button>
                {importError && <p className="text-sm text-red-500">{importError}</p>}
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => { setImportOpen(false); setImportFilePath(null); setImportPreview(null); setImportConflicts([]); setImportResolutions({}); setImportError(null); }}
                    className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : !importPreview ? (
              <>
                <p className="text-sm text-zinc-500">Loading preview...</p>
                {importError && <p className="text-sm text-red-500">{importError}</p>}
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => { setImportOpen(false); setImportFilePath(null); setImportPreview(null); setImportConflicts([]); setImportResolutions({}); setImportError(null); }}
                    className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-zinc-500">
                  {importConflicts.length === 0
                    ? 'No conflicts detected. All items can be imported safely.'
                    : `${importConflicts.length} conflict(s) detected. Please resolve them before importing.`}
                </p>
                {importConflicts.length > 0 && (
                  <div className="max-h-[50vh] overflow-auto divide-y divide-black/10 dark:divide-white/10 border border-black/10 dark:border-white/10 rounded-md">
                    {importConflicts.map((conflict, idx) => (
                      <div key={idx} className="p-3 text-sm">
                        <p className="font-medium mb-2">
                          Conflict {idx + 1}: {conflict.type}
                        </p>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <p className="font-medium mb-1">Existing</p>
                            <pre className="whitespace-pre-wrap break-words bg-zinc-50 dark:bg-zinc-900 p-2 rounded">
                              {JSON.stringify(conflict.existing, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <p className="font-medium mb-1">Incoming</p>
                            <pre className="whitespace-pre-wrap break-words bg-zinc-50 dark:bg-zinc-900 p-2 rounded">
                              {JSON.stringify(conflict.incoming, null, 2)}
                            </pre>
                          </div>
                        </div>
                        <div className="mt-2">
                          <label className="block text-xs font-medium mb-1">Resolution</label>
                          <select
                            value={importResolutions[idx] || 'existing'}
                            onChange={(e) => setImportResolutions(prev => ({ ...prev, [idx]: e.target.value }))}
                            className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-2 py-1 text-xs"
                          >
                            <option value="existing">Keep Existing</option>
                            <option value="incoming">Use Incoming</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {importError && <p className="text-sm text-red-500">{importError}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => { setImportOpen(false); setImportFilePath(null); setImportPreview(null); setImportConflicts([]); setImportResolutions({}); setImportError(null); }}
                    className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApplyImport}
                    disabled={importingBackup || (importConflicts.length > 0 && Object.keys(importResolutions).length !== importConflicts.length)}
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {importingBackup ? 'Importing...' : 'Apply Import'}
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
