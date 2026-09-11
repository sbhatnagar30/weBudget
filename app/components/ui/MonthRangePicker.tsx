'use client'

import { useState } from 'react'

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

type MonthRange = { start: Date; end: Date }

type MonthRangePickerProps = {
  value?: MonthRange
  onChange: (value: MonthRange) => void
  placeholder?: string
}

export default function MonthRangePicker({ value, onChange, placeholder = 'Select month range' }: MonthRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const today = new Date()
  const [startYear, setStartYear] = useState(() => value?.start ? value.start.getFullYear() : today.getFullYear())
  const [startMonth, setStartMonth] = useState(() => value?.start ? value.start.getMonth() : 0)
  const [endYear, setEndYear] = useState(() => value?.end ? value.end.getFullYear() : today.getFullYear())
  const [endMonth, setEndMonth] = useState(() => value?.end ? value.end.getMonth() : 11)
  const [selecting, setSelecting] = useState<'start' | 'end'>('start')

  const handleSelect = (year: number, monthIndex: number) => {
    if (selecting === 'start') {
      setStartYear(year)
      setStartMonth(monthIndex)
      setEndYear(year)
      setEndMonth(monthIndex)
      setSelecting('end')
    } else {
      const start = new Date(startYear, startMonth, 1)
      const end = new Date(year, monthIndex, 1)
      if (end < start) {
        onChange({ start: end, end: start })
      } else {
        onChange({ start, end })
      }
      setIsOpen(false)
      setSelecting('start')
    }
  }

  const displayValue = value
    ? `${MONTHS[value.start.getMonth()]} ${value.start.getFullYear()} - ${MONTHS[value.end.getMonth()]} ${value.end.getFullYear()}`
    : ''

  const currentYear = selecting === 'start' ? startYear : endYear

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
          <div className="fixed inset-0 z-40" onClick={() => { setIsOpen(false); setSelecting('start') }} />
          <div className="absolute z-50 mt-1 w-auto min-w-[260px] bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-md shadow-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => {
                  if (selecting === 'start') setStartYear(year => year - 1)
                  else setEndYear(year => year - 1)
                }}
                className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-black/10 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-sm font-medium">{currentYear}</span>
              <button
                type="button"
                onClick={() => {
                  if (selecting === 'start') setStartYear(year => year + 1)
                  else setEndYear(year => year + 1)
                }}
                className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-black/10 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-zinc-500 mb-2">
              {selecting === 'start' ? 'Select start month' : 'Select end month'}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {MONTHS.map((label, idx) => {
                const year = currentYear
                const isStart = startYear === year && startMonth === idx
                const isEnd = endYear === year && endMonth === idx
                const isSelected = selecting === 'start' ? isStart : isEnd
                const isInRange =
                  (year > startYear || (year === startYear && idx >= startMonth)) &&
                  (year < endYear || (year === endYear && idx <= endMonth))
                const isRangeMid = selecting === 'end' && isInRange && !isSelected

                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleSelect(year, idx)}
                    className={[
                      'h-9 rounded-md text-sm',
                      isSelected
                        ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900'
                        : isRangeMid
                          ? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100'
                          : 'border border-black/10 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-zinc-800',
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
