'use client'

import { useState, useRef, useEffect } from 'react'

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

type MonthPickerProps = {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function MonthPicker({ value, onChange, placeholder = 'Select month' }: MonthPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => value ? new Date(value + '-01').getFullYear() : new Date().getFullYear())
  const listRef = useRef<HTMLDivElement>(null)

  const selectedMonth = value ? new Date(value + '-01').getMonth() : -1
  const selectedYear = value ? new Date(value + '-01').getFullYear() : -1

  const handleSelect = (monthIndex: number) => {
    const year = viewYear
    const month = String(monthIndex + 1).padStart(2, '0')
    onChange(`${year}-${month}`)
    setIsOpen(false)
  }

  const displayValue = value
    ? `${MONTHS[selectedMonth]} ${selectedYear}`
    : ''

  useEffect(() => {
    if (isOpen && listRef.current) {
      const selectedEl = listRef.current.querySelector('[data-selected="true"]')
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'center' })
      }
    }
  }, [isOpen, viewYear])

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
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 002 2v12a2 2 0 002 2z" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute z-50 mt-1 w-auto min-w-[180px] bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-md shadow-lg p-2">
            <div className="flex items-center justify-between mb-1">
              <button
                type="button"
                onClick={() => setViewYear(year => year - 1)}
                className="inline-flex items-center justify-center h-6 w-6 rounded-md border border-black/10 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-xs font-medium">{viewYear}</span>
              <button
                type="button"
                onClick={() => setViewYear(year => year + 1)}
                className="inline-flex items-center justify-center h-6 w-6 rounded-md border border-black/10 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <div
              ref={listRef}
              className="h-[180px] overflow-y-auto space-y-1 pr-1"
              style={{ scrollbarWidth: 'thin' }}
            >
              {MONTHS.map((label, idx) => {
                const isSelected = selectedYear === viewYear && selectedMonth === idx
                return (
                  <button
                    key={label}
                    data-selected={isSelected ? 'true' : undefined}
                    type="button"
                    onClick={() => handleSelect(idx)}
                    className={[
                      'w-full h-9 rounded-md text-sm',
                      isSelected
                        ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
