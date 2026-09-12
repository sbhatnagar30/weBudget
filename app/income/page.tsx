'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import MonthRangePicker from '../components/ui/MonthRangePicker'
import type { Transaction, BankAccount } from '../../types/electron'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import ChartErrorBoundary from '../components/ChartErrorBoundary'

const INCOME_TYPES = new Set(['income'])
const PAYMENT_TYPES = new Set(['payment', 'expense'])

function groupByMonth(transactions: Transaction[]) {
  const map = new Map<string, { income: number; payments: number }>()
  for (const tx of transactions) {
    const [year, month] = tx.date.split('-')
    const key = `${year}-${month}`
    const current = map.get(key) || { income: 0, payments: 0 }
    if (INCOME_TYPES.has(tx.transaction_type)) {
      current.income += tx.amount
    } else if (PAYMENT_TYPES.has(tx.transaction_type)) {
      current.payments += tx.amount
    }
    map.set(key, current)
  }
  return Array.from(map.entries())
    .map(([month, values]) => ({ month, ...values }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

function topDescriptions(transactions: Transaction[], type: 'income' | 'payment', limit = 8) {
  const map = new Map<string, number>()
  for (const tx of transactions) {
    if (tx.transaction_type !== type) continue
    const key = tx.description.trim().slice(0, 40) || 'Other'
    map.set(key, (map.get(key) || 0) + tx.amount)
  }
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}

function groupPaymentDescription(description: string): string {
  const upper = description.toUpperCase()
  if (upper.includes('CITI CARD ONLINE') || upper.includes('CITIBANK, N.A. DES:PAYMENT')) return 'Citi Card Payments'
  if (upper.includes('MOBILE BANKING PAYMENT')) return 'Mobile Banking Payments'
  if (upper.includes('CHASE CREDIT') || upper.includes('CHASE CREDIT CRD')) return 'Chase Credit Payments'
  if (upper.includes('BEST BUY') && upper.includes('AUTO PYMT')) return 'Best Buy Auto Payment'
  if (upper.includes('BEST BUY')) return 'Best Buy Payments'
  if (upper.includes('WITHDRWL') || upper.includes('ATM')) return 'ATM Withdrawal'
  if (upper.includes('CHECK') || upper.includes('CHEQUE')) return 'Check Payment'
  if (upper.includes('TRANSFER')) return 'Transfers'
  if (upper.includes('FEE') || upper.includes('SERVICE FEE')) return 'Bank Fees'
  return description.trim().slice(0, 50) || 'Other'
}

function topPaymentDestinations(transactions: Transaction[], limit = 8) {
  const map = new Map<string, number>()
  for (const tx of transactions) {
    if (!PAYMENT_TYPES.has(tx.transaction_type)) continue
    const key = groupPaymentDescription(tx.description)
    map.set(key, (map.get(key) || 0) + tx.amount)
  }
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}

export default function IncomePage() {
  const pathname = usePathname()
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  const [bankFilter, setBankFilter] = useState<string>('')
  const [dateRange, setDateRange] = useState<{ start?: Date; end?: Date }>({})

  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [categoryName, setCategoryName] = useState('')

  const startDate = dateRange.start ? `${dateRange.start.getFullYear()}-${String(dateRange.start.getMonth() + 1).padStart(2, '0')}-01` : ''
  const endDate = dateRange.end ? `${dateRange.end.getFullYear()}-${String(dateRange.end.getMonth() + 1).padStart(2, '0')}-${new Date(dateRange.end.getFullYear(), dateRange.end.getMonth() + 1, 0).getDate()}` : ''

  const load = async () => {
    setLoading(true)
    try {
      const [accounts, txs] = await Promise.all([
        window.api.db.getBankAccounts(),
        window.api.db.getBankTransactions({
          ...(bankFilter ? { bank_account_id: parseInt(bankFilter) } : {}),
          ...(startDate ? { start_date: startDate } : {}),
          ...(endDate ? { end_date: endDate } : {}),
        }),
      ])
      setBankAccounts(accounts)
      setTransactions(txs)
    } catch (e) {
      console.error('Failed to load income data', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [pathname, bankFilter, dateRange])

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0)

  const totalIncome = useMemo(
    () => transactions.filter(tx => INCOME_TYPES.has(tx.transaction_type)).reduce((sum, tx) => sum + tx.amount, 0),
    [transactions]
  )
  const totalPayments = useMemo(
    () => transactions.filter(tx => PAYMENT_TYPES.has(tx.transaction_type)).reduce((sum, tx) => sum + tx.amount, 0),
    [transactions]
  )
  const netFlow = totalIncome - totalPayments

  const monthlyData = useMemo(() => groupByMonth(transactions), [transactions])
  const paymentsByDestination = useMemo(() => topPaymentDestinations(transactions), [transactions])

  const handleCategoryChange = async (txId: number, newCategory: string) => {
    try {
      await window.api.db.updateTransaction(txId, { category: newCategory })
      setTransactions(prev => prev.map(tx => tx.id === txId ? { ...tx, category: newCategory } : tx))
    } catch (err) {
      console.error('Failed to update transaction category', err)
      alert('Failed to update category. Please try again.')
      await load()
    }
  }

  const handleSaveCategory = async () => {
    if (!editingTx || !categoryName.trim()) return
    await handleCategoryChange(editingTx.id, categoryName.trim())
    setEditingTx(null)
    setCategoryName('')
  }

  const incomeTransactions = transactions.filter(tx => INCOME_TYPES.has(tx.transaction_type))
  const paymentTransactions = transactions.filter(tx => PAYMENT_TYPES.has(tx.transaction_type))

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-zinc-500">Loading income data...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Income</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-black/10 dark:border-white/10 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Total Income</p>
          <p className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(totalIncome)}</p>
        </div>
        <div className="rounded-lg border border-black/10 dark:border-white/10 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Total Payments</p>
          <p className="text-2xl font-semibold tabular-nums text-red-600 dark:text-red-400">{formatCurrency(totalPayments)}</p>
        </div>
        <div className="rounded-lg border border-black/10 dark:border-white/10 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Net Flow</p>
          <p className={`text-2xl font-semibold tabular-nums ${netFlow >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {formatCurrency(netFlow)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={bankFilter}
          onChange={(e) => setBankFilter(e.target.value)}
          className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
        >
          <option value="">All Bank Accounts</option>
          {bankAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>

        <MonthRangePicker
          value={dateRange.start || dateRange.end ? { start: dateRange.start || new Date(), end: dateRange.end || new Date() } : undefined}
          onChange={(range) => setDateRange({ start: range.start, end: range.end })}
          placeholder="Select month range"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-black/10 dark:border-white/10 p-4">
          <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-4">Monthly Flow</h2>
          {monthlyData.length === 0 ? (
            <p className="text-sm text-zinc-500">No income or payment data available for this range.</p>
          ) : (
            <div className="h-72">
              <ChartErrorBoundary>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-black/10 dark:stroke-white/10" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} className="text-zinc-500" />
                    <YAxis tick={{ fontSize: 12 }} className="text-zinc-500" />
                    <Tooltip
                      formatter={(value) => formatCurrency(value as number)}
                      contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: 4 }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} name="Income" isAnimationActive={false} />
                    <Line type="monotone" dataKey="payments" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} name="Payments" isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartErrorBoundary>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-black/10 dark:border-white/10 p-4">
          <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-4">Payments by Destination</h2>
          {paymentsByDestination.length === 0 ? (
            <p className="text-sm text-zinc-500">No payment transactions yet.</p>
          ) : (
            <div className="h-72">
              <ChartErrorBoundary>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={paymentsByDestination} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-black/10 dark:stroke-white/10" />
                    <XAxis type="number" tick={{ fontSize: 12 }} className="text-zinc-500" />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={160} className="text-zinc-500" />
                    <Tooltip
                      formatter={(value) => formatCurrency(value as number)}
                      contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: 4 }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Bar dataKey="value" fill="#ef4444" name="Amount" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartErrorBoundary>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
          <div className="p-4 border-b border-black/10 dark:border-white/10">
            <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Recent Income</h2>
            <p className="text-xs text-zinc-500">{incomeTransactions.length} transactions</p>
          </div>
          {incomeTransactions.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500">No income transactions yet.</p>
          ) : (
            <div className="divide-y divide-black/10 dark:divide-white/10">
              {incomeTransactions.slice(0, 20).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{tx.description}</p>
                    <p className="text-xs text-zinc-500">{tx.date} · {tx.category}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(tx.amount)}</p>
                    <button
                      onClick={() => { setEditingTx(tx); setCategoryName(tx.category || 'other') }}
                      className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    >
                      Categorize
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
          <div className="p-4 border-b border-black/10 dark:border-white/10">
            <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Recent Payments</h2>
            <p className="text-xs text-zinc-500">{paymentTransactions.length} transactions</p>
          </div>
          {paymentTransactions.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500">No payment transactions yet.</p>
          ) : (
            <div className="divide-y divide-black/10 dark:divide-white/10">
              {paymentTransactions.slice(0, 20).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{tx.description}</p>
                    <p className="text-xs text-zinc-500">{tx.date} · {tx.category}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-medium tabular-nums text-red-600 dark:text-red-400">{formatCurrency(tx.amount)}</p>
                    <button
                      onClick={() => { setEditingTx(tx); setCategoryName(tx.category || 'other') }}
                      className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    >
                      Categorize
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-lg p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold">Categorize Transaction</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{editingTx.description}</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Amount</label>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{formatCurrency(editingTx.amount)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <input
                  type="text"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
                  placeholder="e.g. salary, rent, utilities"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setEditingTx(null); setCategoryName('') }}
                className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCategory}
                disabled={!categoryName.trim()}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
