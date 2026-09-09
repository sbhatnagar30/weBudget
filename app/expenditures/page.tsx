'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import MonthPicker from '../components/MonthPicker'
import type { Card, Transaction } from '../../types/electron'

const AUTO_COLORS = [
  '#64748b', '#9cb8a2', '#d4a574', '#c48b8b', '#7ba7c9',
  '#9b8fb8', '#5f9ea0', '#cd853f', '#8fbc8f', '#bc8f8f'
]

export default function ExpendituresPage() {
  const pathname = usePathname()
  const [cards, setCards] = useState<Card[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [cardFilter, setCardFilter] = useState<string>('')
  const [startMonth, setStartMonth] = useState('')
  const [endMonth, setEndMonth] = useState('')

  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<any | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [categoryColor, setCategoryColor] = useState(AUTO_COLORS[0])

  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())

  const startDate = startMonth ? `${startMonth}-01` : ''
  const endDate = (() => {
    if (!endMonth) return ''
    const [year, month] = endMonth.split('-').map(Number)
    const lastDay = new Date(year, month, 0).getDate()
    return `${endMonth}-${String(lastDay).padStart(2, '0')}`
  })()

  const load = async () => {
    setLoading(true)
    try {
      const [cardsData, txs, cats] = await Promise.all([
        window.api.db.getCards(),
        window.api.db.getTransactions({
          ...(cardFilter && { card_id: parseInt(cardFilter) }),
          ...(startDate && { start_date: startDate }),
          ...(endDate && { end_date: endDate }),
          transaction_type: 'expense',
        }),
        window.api.db.getDbCategories(),
      ])
      setCards(cardsData)
      setTransactions(txs)
      setCategories(cats)
    } catch (e) {
      console.error('Failed to load expenditures', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [pathname, cardFilter, startMonth, endMonth])

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0)

  const getCategoryColor = (categoryName: string) => {
    const cat = categories.find((c) => c.name === categoryName)
    return cat?.color || AUTO_COLORS[categories.findIndex((c) => c.name === categoryName) % AUTO_COLORS.length] || '#64748b'
  }

  const cardNameMap = cards.reduce<Record<number, string>>((acc, card) => {
    acc[card.id] = card.name
    return acc
  }, {})

  const handleCategoryChange = async (txId: number, newCategory: string) => {
    try {
      await window.api.db.updateTransaction(txId, { category: newCategory })
      setTransactions(prev => prev.map(tx =>
        tx.id === txId ? { ...tx, category: newCategory } : tx
      ))
    } catch (err) {
      console.error('Failed to update transaction category', err)
      alert('Failed to update category. Please try again.')
      await load()
    }
  }

  const handleNoteChange = async (txId: number, note: string) => {
    try {
      await window.api.db.updateTransaction(txId, { note })
      setTransactions(prev => prev.map(tx =>
        tx.id === txId ? { ...tx, note } : tx
      ))
    } catch (err) {
      console.error('Failed to update transaction note', err)
      alert('Failed to save note. Please try again.')
      await load()
    }
  }

  const handleAddCategory = async () => {
    if (!categoryName.trim()) return
    await window.api.db.addDbCategory({ name: categoryName.trim(), color: categoryColor })
    setCategoryName('')
    setCategoryColor(AUTO_COLORS[0])
    setEditingCategory(null)
    setShowCategoryModal(false)
    load()
  }

  const handleUpdateCategory = async () => {
    if (!editingCategory || !categoryName.trim()) return
    await window.api.db.updateDbCategory(editingCategory.id, { name: categoryName.trim(), color: categoryColor })
    setCategoryName('')
    setCategoryColor(AUTO_COLORS[0])
    setEditingCategory(null)
    setShowCategoryModal(false)
    load()
  }

  const handleDeleteCategory = async (id: number) => {
    if (confirm('Delete this category? Transactions will be moved to uncategorized.')) {
      await window.api.db.deleteDbCategory(id)
      load()
    }
  }

  const openCategoryModal = (category?: any) => {
    if (category) {
      setEditingCategory(category)
      setCategoryName(category.name)
      setCategoryColor(category.color)
    } else {
      setEditingCategory(null)
      setCategoryName('')
      setCategoryColor(AUTO_COLORS[categories.length % AUTO_COLORS.length])
    }
    setShowCategoryModal(true)
  }

  const toggleCategory = (catName: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev)
      if (next.has(catName)) {
        next.delete(catName)
      } else {
        next.add(catName)
      }
      return next
    })
  }

  const collapseAll = () => {
    setCollapsedCategories(new Set([...categoryNames, 'uncategorized']))
  }

  const expandAll = () => {
    setCollapsedCategories(new Set())
  }

  const groupedTransactions = transactions.reduce((acc, tx) => {
    const cat = tx.category === 'other' ? 'uncategorized' : (tx.category || 'uncategorized')
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(tx)
    return acc
  }, {})

  const categoryNames = categories.map(c => c.name).filter(c => c !== 'uncategorized')
  const uncategorized = groupedTransactions['uncategorized'] || []

  const getCategoryTotal = (catName: string) => {
    return groupedTransactions[catName]?.reduce((sum, tx) => sum + tx.amount, 0) || 0
  }

  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null)
  const [draggedTxId, setDraggedTxId] = useState<number | null>(null)

  const handleDragStart = (e: React.DragEvent, txId: number) => {
    e.dataTransfer.setData('text/plain', String(txId))
    e.dataTransfer.effectAllowed = 'move'
    setDraggedTxId(txId)
  }

  const handleDrop = async (e: React.DragEvent, targetCategory: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverCategory(null)
    const txId = parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (txId) {
      try {
        await window.api.db.updateTransaction(txId, { category: targetCategory })
        load()
      } catch (err) {
        console.error('Failed to update transaction category', err)
      }
    } else {
      console.warn('Drop handler fired without transaction id')
    }
    setDraggedTxId(null)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDragEnter = (e: React.DragEvent, categoryName: string) => {
    e.preventDefault()
    setDragOverCategory(categoryName)
  }

  const handleDragLeave = (e: React.DragEvent, categoryName: string) => {
    e.preventDefault()
    const relatedTarget = e.relatedTarget as Node | null
    const currentTarget = e.currentTarget as Node
    if (!currentTarget.contains(relatedTarget)) {
      setDragOverCategory(prev => prev === categoryName ? null : prev)
    }
  }

  const handleDragEnd = () => {
    setDragOverCategory(null)
    setDraggedTxId(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-zinc-500">Loading expenses...</p>
      </div>
    )
  }

  const allCategoryNames = [...categoryNames, 'uncategorized']

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
        <button
          onClick={() => openCategoryModal()}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Add Category
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={cardFilter}
          onChange={(e) => setCardFilter(e.target.value)}
          className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
        >
          <option value="">All Cards</option>
          {cards.map((card) => (
            <option key={card.id} value={card.id}>
              {card.name}
            </option>
          ))}
        </select>

        <MonthPicker
          value={startMonth}
          onChange={setStartMonth}
          placeholder="From Month"
        />

        <MonthPicker
          value={endMonth}
          onChange={setEndMonth}
          placeholder="To Month"
        />

        <div className="flex gap-2 ml-auto">
          <button
            onClick={collapseAll}
            className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Collapse All
          </button>
          <button
            onClick={expandAll}
            className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Expand All
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 2xl:grid-cols-9 gap-4">
        {allCategoryNames.map((catName) => {
          const isUncategorized = catName === 'uncategorized'
          const color = getCategoryColor(catName)
          const catTransactions = groupedTransactions[catName] || []
          const total = getCategoryTotal(catName)
          const isCollapsed = collapsedCategories.has(catName)

          return (
            <div
              key={catName}
              className={`rounded-lg border border-black/10 dark:border-white/10 overflow-hidden ${dragOverCategory === catName ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''}`}
              style={{ borderLeftColor: color, borderLeftWidth: '4px' }}
              onDragEnter={(e) => handleDragEnter(e, catName)}
              onDragLeave={(e) => handleDragLeave(e, catName)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, catName)}
            >
              <div
                className="p-4 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-between cursor-pointer"
                onClick={() => toggleCategory(catName)}
              >
                <div className="flex-1">
                  <h3 className="text-sm font-medium capitalize" style={{ color }}>{catName}</h3>
                  <p className="text-xs text-zinc-500">{catTransactions.length} transactions · {formatCurrency(total)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!isUncategorized && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        openCategoryModal(categories.find((c) => c.name === catName))
                      }}
                      className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    >
                      Settings
                    </button>
                  )}
                  <svg
                    className={`w-4 h-4 text-zinc-500 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              {!isCollapsed && (
                <div
                  className="divide-y divide-black/10 dark:divide-white/10"
                >
                  {catTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, tx.id)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      className="p-4 text-sm cursor-move hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium truncate">{tx.description}</p>
                            <span className="text-[10px] text-zinc-500 whitespace-nowrap">{cardNameMap[tx.card_id] || `Card ${tx.card_id}`}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <p className="text-xs text-zinc-500">{tx.date}</p>
                            <select
                              draggable={false}
                              value={tx.category === 'other' ? 'uncategorized' : tx.category}
                              onChange={(e) => handleCategoryChange(tx.id, e.target.value)}
                              className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-2 py-1 text-xs"
                            >
                              {categories.map((cat) => (
                                <option key={cat.id} value={cat.name}>
                                  {cat.name}
                                </option>
                              ))}
                              <option value="uncategorized">Uncategorized</option>
                            </select>
                          </div>
                          <div className="mt-2">
                            <input
                              type="text"
                              draggable={false}
                              defaultValue={tx.note || ''}
                              onBlur={(e) => {
                                const note = e.target.value
                                if (note !== (tx.note || '')) {
                                  handleNoteChange(tx.id, note)
                                }
                              }}
                              placeholder="Add a note..."
                              className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-2 py-1 text-xs text-zinc-600 dark:text-zinc-400 placeholder:text-zinc-400"
                            />
                          </div>
                        </div>
                        <p className="font-medium tabular-nums whitespace-nowrap">{formatCurrency(tx.amount)}</p>
                      </div>
                    </div>
                  ))}
                  {catTransactions.length === 0 && (
                    <p className="p-4 text-sm text-zinc-500">No transactions in this category.</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-lg p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold">{editingCategory ? 'Edit Category' : 'Add Category'}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
                  placeholder="e.g. Groceries"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Color</label>
                <div className="flex gap-2">
                  {AUTO_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategoryColor(c)}
                      className={`w-8 h-8 rounded-full border-2 ${
                        categoryColor === c ? 'border-zinc-900 dark:border-zinc-100' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowCategoryModal(false)
                  setEditingCategory(null)
                  setCategoryName('')
                  setCategoryColor(AUTO_COLORS[0])
                }}
                className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={editingCategory ? handleUpdateCategory : handleAddCategory}
                disabled={!categoryName.trim()}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {editingCategory ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
