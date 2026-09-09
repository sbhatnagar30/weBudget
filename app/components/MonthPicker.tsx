'use client'

import { useState } from 'react'

const MONTHS = [
  { value: '0', label: 'January' },
  { value: '1', label: 'February' },
  { value: '2', label: 'March' },
  { value: '3', label: 'April' },
  { value: '4', label: 'May' },
  { value: '5', label: 'June' },
  { value: '6', label: 'July' },
  { value: '7', label: 'August' },
  { value: '8', label: 'September' },
  { value: '9', label: 'October' },
  { value: '10', label: 'November' },
  { value: '11', label: 'December' },
]

function getCurrentYear() {
  return new Date().getFullYear()
}

function generateYearOptions() {
  const currentYear = getCurrentYear()
  const years = []
  for (let y = currentYear; y >= currentYear - 10; y--) {
    years.push(y)
  }
  return years
}

export default function MonthPicker({ value, onChange, placeholder = 'Select month' }: { value?: string; onChange: (value: string) => void; placeholder?: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const yearOptions = generateYearOptions()

  const selectedMonth = value ? String(new Date(value + '-01').getMonth()) : ''
  const selectedYear = value ? String(new Date(value + '-01').getFullYear()) : ''

  const handleMonthChange = (month: string) => {
    const year = selectedYear || String(getCurrentYear())
    onChange(`${year}-${String(Number(month) + 1).padStart(2, '0')}`)
  }

  const handleYearChange = (year: string) => {
    const month = selectedMonth || '0'
    onChange(`${year}-${String(Number(month) + 1).padStart(2, '0')}`)
  }

  const displayValue = value
    ? `${MONTHS.find(m => m.value === selectedMonth)?.label || ''} ${selectedYear}`
    : ''

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm text-left flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800"
      >
        <span className={displayValue ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400'}>
          {displayValue || placeholder}
        </span>
        <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute z-50 mt-1 w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-md shadow-lg p-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Month</label>
              <select
                value={selectedMonth}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
              >
                <option value="">Select month</option>
                {MONTHS.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Year</label>
              <select
                value={selectedYear}
                onChange={(e) => handleYearChange(e.target.value)}
                className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
              >
                <option value="">Select year</option>
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
