'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from 'date-fns'
import type { DailySpending, Transaction } from '../../types/electron'

const AUTO_COLORS = [
  '#64748b', '#9cb8a2', '#d4a574', '#c48b8b', '#7ba7c9',
  '#9b8fb8', '#5f9ea0', '#cd853f', '#8fbc8f', '#bc8f8f'
]

export default function CalendarPage() {
  const pathname = usePathname()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [dailySpending, setDailySpending] = useState<DailySpending[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [dayTransactions, setDayTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

  const startStr = format(monthStart, 'yyyy-MM-dd')
  const endStr = format(monthEnd, 'yyyy-MM-dd')

  const load = async () => {
    setLoading(true)
    try {
      const [spending, cats, txs] = await Promise.all([
        window.api.db.getDailySpending({
          start_date: startStr,
          end_date: endStr,
        }),
        window.api.db.getDbCategories(),
        selectedDate
          ? window.api.db.getTransactions({ start_date: selectedDate, end_date: selectedDate, transaction_type: 'expense' })
          : Promise.resolve([]),
      ])
      setDailySpending(spending)
      setCategories(cats)
      if (selectedDate) {
        setDayTransactions(txs)
      }
    } catch (e) {
      console.error('Failed to load calendar', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [currentMonth, selectedDate, pathname])

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0)

  const getCategoryColor = (categoryName: string) => {
    const cat = categories.find((c) => c.name === categoryName)
    return cat?.color || AUTO_COLORS[categories.findIndex((c) => c.name === categoryName) % AUTO_COLORS.length] || '#64748b'
  }

  const dailyByDate = dailySpending.reduce<Record<string, DailySpending[]>>((acc, d) => {
    if (!acc[d.date]) acc[d.date] = []
    acc[d.date].push(d)
    return acc
  }, {})

  const getSpendingForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return dailyByDate[dateStr] || []
  }

  const maxDayTotal = Math.max(
    ...Object.values(dailyByDate).map(
      (entries) => entries.reduce((sum, d) => sum + d.total, 0)
    ),
    1
  )

  const selectedDateStr = selectedDate || format(new Date(), 'yyyy-MM-dd')
  const selectedDayEntries = dailyByDate[selectedDateStr] || []
  const selectedDayTotal = selectedDayEntries.reduce((sum, d) => sum + d.total, 0)

  const dayTransactionsByCategory = dayTransactions.reduce<Record<string, Transaction[]>>((acc, tx) => {
    const cat = tx.category === 'other' ? 'uncategorized' : (tx.category || 'uncategorized')
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(tx)
    return acc
  }, {})

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-zinc-500">Loading calendar...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Previous
          </button>
          <span className="text-sm font-medium w-32 text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </span>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Next
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-lg border border-black/10 dark:border-white/10 p-4">
          <div className="grid grid-cols-7 gap-px bg-black/10 dark:bg-white/10 mb-px">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="p-2 text-center text-xs font-medium text-zinc-500">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-black/10 dark:bg-white/10">
            {days.map((day) => {
              const entries = getSpendingForDate(day)
              const isSelected = selectedDate === format(day, 'yyyy-MM-dd')
              const dayTotal = entries.reduce((sum, d) => sum + d.total, 0)
              const heightPercent = dayTotal > 0 ? (dayTotal / maxDayTotal) * 100 : 0

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(format(day, 'yyyy-MM-dd'))}
                  className={`relative flex flex-col items-center justify-start p-2 min-h-[120px] bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors ${
                    isSelected ? 'ring-2 ring-inset ring-zinc-900 dark:ring-zinc-100' : ''
                  }`}
                >
                  <span className="text-xs font-medium mb-1">{format(day, 'd')}</span>
                  {entries.length > 0 && (
                    <div className="w-full flex flex-col items-center gap-1 mt-auto mb-1">
                      <div className="w-full flex flex-col gap-[2px]">
                        {entries.map((entry) => {
                          const categoryHeight = dayTotal > 0 ? (entry.total / dayTotal) * 100 : 0
                          return (
                            <div
                              key={entry.category}
                              className="w-full rounded-sm"
                              style={{ backgroundColor: getCategoryColor(entry.category), height: `${Math.max(categoryHeight, 8)}%`, minHeight: '2px' }}
                            />
                          )
                        })}
                      </div>
                      <span className="text-[10px] text-zinc-500 truncate w-full text-center px-1">
                        {formatCurrency(dayTotal)}
                      </span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-lg border border-black/10 dark:border-white/10 p-4">
          <h3 className="text-sm font-medium mb-4">
            {selectedDate ? format(parseISO(selectedDate), 'MMMM d, yyyy') : 'Select a day'}
          </h3>
          {selectedDate && (
            <div className="space-y-4 max-h-[400px] overflow-auto">
              {selectedDayEntries.length === 0 && dayTransactions.length === 0 ? (
                <p className="text-sm text-zinc-500">No transactions on this day.</p>
              ) : (
                <>
                  {selectedDayEntries.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">By Category</p>
                      {selectedDayEntries.map((entry) => (
                        <div key={entry.category} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getCategoryColor(entry.category) }} />
                            <span className="capitalize">{entry.category}</span>
                          </div>
                          <div className="text-right">
                            <p className="font-medium tabular-nums">{formatCurrency(entry.total)}</p>
                            <p className="text-[10px] text-zinc-500">{entry.count} {entry.count === 1 ? 'transaction' : 'transactions'}</p>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between text-sm border-t border-black/10 dark:border-white/10 pt-2 mt-2">
                        <span className="font-medium">Total</span>
                        <span className="font-medium tabular-nums">{formatCurrency(selectedDayTotal)}</span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Transactions</p>
                    {Object.entries(dayTransactionsByCategory).map(([cat, txs]) => (
                      <div key={cat} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getCategoryColor(cat) }} />
                          <p className="text-xs font-medium capitalize">{cat}</p>
                        </div>
                        {txs.map((tx) => (
                          <div key={tx.id} className="flex items-center justify-between text-sm pl-4">
                            <div>
                              <p className="font-medium">{tx.description}</p>
                            </div>
                            <p className="font-medium tabular-nums">{formatCurrency(tx.amount)}</p>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
