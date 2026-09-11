'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

const ITEM_HEIGHT = 56
const VISIBLE_ITEMS = 5

type MonthWheelPickerProps = {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  inline?: boolean
}

export default function MonthWheelPicker({ value, onChange, placeholder = 'Select month', inline = false }: MonthWheelPickerProps) {
  const today = new Date()
  const [selectedMonth, setSelectedMonth] = useState(() => value ? new Date(value + '-01').getMonth() : today.getMonth())
  const [selectedYear, setSelectedYear] = useState(() => value ? new Date(value + '-01').getFullYear() : today.getFullYear())
  const [viewYear, setViewYear] = useState(() => value ? new Date(value + '-01').getFullYear() : today.getFullYear())
  const [isOpen, setIsOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const wheelAccumulator = useRef(0)
  const rafRef = useRef<number | null>(null)
  const selectedMonthRef = useRef(selectedMonth)
  const onChangeRef = useRef(onChange)
  const viewYearRef = useRef(viewYear)

  useEffect(() => {
    selectedMonthRef.current = selectedMonth
  }, [selectedMonth])

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    viewYearRef.current = viewYear
  }, [viewYear])

  const displayValue = `${MONTHS[selectedMonth]} ${selectedYear}`

  const syncSelectedMonth = useCallback((index: number) => {
    selectedMonthRef.current = index
    setSelectedMonth(index)
    const month = String(index + 1).padStart(2, '0')
    onChangeRef.current(`${viewYearRef.current}-${month}`)
  }, [])

  const updateFromOffset = useCallback((clientY: number) => {
    if (!trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    const y = clientY - rect.top
    const centerOffset = rect.height / 2
    const offsetFromCenter = y - centerOffset + dragOffset
    const rawIndex = Math.round(offsetFromCenter / ITEM_HEIGHT)
    const clampedIndex = Math.max(0, Math.min(MONTHS.length - 1, rawIndex))
    syncSelectedMonth(clampedIndex)
  }, [dragOffset, syncSelectedMonth])

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true)
    setDragOffset(0)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return
    setDragOffset(prev => prev + e.movementY)
    updateFromOffset(e.clientY)
  }

  const handlePointerUp = () => {
    setIsDragging(false)
    setDragOffset(0)
  }

  const handleSelect = (monthIndex: number) => {
    syncSelectedMonth(monthIndex)
    if (!inline) setIsOpen(false)
  }

  useEffect(() => {
    const el = trackRef.current
    if (!el) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      wheelAccumulator.current += e.deltaY
      const threshold = ITEM_HEIGHT
      if (Math.abs(wheelAccumulator.current) < threshold) return

      const steps = Math.max(1, Math.floor(Math.abs(wheelAccumulator.current) / threshold))
      const direction = wheelAccumulator.current > 0 ? 1 : -1
      wheelAccumulator.current = 0

      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const current = selectedMonthRef.current
        const next = Math.max(0, Math.min(MONTHS.length - 1, current + direction * steps))
        selectedMonthRef.current = next
        setSelectedMonth(next)
        const month = String(next + 1).padStart(2, '0')
        onChangeRef.current(`${viewYearRef.current}-${month}`)
      })
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', handleWheel)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [inline])

  const trackStyle = {
    transform: `translateY(${(VISIBLE_ITEMS / 2) * ITEM_HEIGHT - selectedMonth * ITEM_HEIGHT - ITEM_HEIGHT / 2}px)`,
  }

  const picker = (
    <div className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-md shadow-lg overflow-hidden">
      <div className="flex items-center justify-between px-2 h-10 border-b border-black/10 dark:border-white/10">
        <button
          type="button"
          onClick={() => setViewYear(year => year - 1)}
          className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-black/10 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-medium">{viewYear}</span>
        <button
          type="button"
          onClick={() => setViewYear(year => year + 1)}
          className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-black/10 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      <div className="relative h-[285px]">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-10 border-y-2 border-zinc-900 dark:border-zinc-100 z-10" />
        <div
          ref={trackRef}
          className="h-full overflow-hidden"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div
            className="transition-transform duration-100 ease-out"
            style={trackStyle}
          >
            {MONTHS.map((label, idx) => {
              const isSelected = idx === selectedMonth
              return (
                <button
                  key={label}
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    handlePointerDown(e)
                  }}
                  onClick={() => handleSelect(idx)}
                  className={[
                    'w-full flex items-center justify-center text-sm select-none',
                    isSelected
                      ? 'text-zinc-900 dark:text-zinc-100 font-medium'
                      : 'text-zinc-500',
                  ].join(' ')}
                  style={{ height: ITEM_HEIGHT }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )

  if (inline) {
    return picker
  }

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
          <div
            ref={containerRef}
            className="absolute z-50 mt-1 w-full rounded-md shadow-lg overflow-hidden"
            style={{ height: VISIBLE_ITEMS * ITEM_HEIGHT }}
          >
            {picker}
          </div>
        </>
      )}
    </div>
  )
}
