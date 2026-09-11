'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { Card, BankAccount, InterestByCard } from '../types/electron'

export default function BalancesPage() {
  const pathname = usePathname()
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [interestData, setInterestData] = useState<InterestByCard[]>([])
  const [totalInterest, setTotalInterest] = useState(0)
  const [loading, setLoading] = useState(true)

  const [showBankModal, setShowBankModal] = useState(false)
  const [showCardModal, setShowCardModal] = useState(false)
  const [editBankId, setEditBankId] = useState<number | null>(null)
  const [editCardId, setEditCardId] = useState<number | null>(null)
  const [deleteBankId, setDeleteBankId] = useState<number | null>(null)
  const [deleteCardId, setDeleteCardId] = useState<number | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [accounts, cardsData, interest, total] = await Promise.all([
        window.api.db.getBankAccounts(),
        window.api.db.getCards(),
        window.api.db.getInterestByCard(),
        window.api.db.getTotalMonthlyInterest(),
      ])
      setBankAccounts(accounts)
      setCards(cardsData)
      setInterestData(interest)
      setTotalInterest(total)
    } catch (e) {
      console.error('Failed to load balances', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [pathname])

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-zinc-500">Loading balances...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Balances</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowBankModal(true)}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Add Bank Account
          </button>
          <button
            onClick={() => setShowCardModal(true)}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Add Card
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-lg border border-black/10 dark:border-white/10 divide-y divide-black/10 dark:divide-white/10">
            <div className="p-4">
              <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Bank Accounts</h2>
            </div>
            {bankAccounts.length === 0 ? (
              <p className="p-4 text-sm text-zinc-500">No bank accounts yet.</p>
            ) : (
              <div className="divide-y divide-black/10 dark:divide-white/10">
                {bankAccounts.map((account) => (
                  <div key={account.id} className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium">{account.name}</p>
                      <p className="text-sm text-zinc-500">
                        {account.institution || 'No institution'} · {account.account_type}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="text-lg font-semibold tabular-nums">{formatCurrency(account.current_balance)}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditBankId(account.id)}
                          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteBankId(account.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-black/10 dark:border-white/10 divide-y divide-black/10 dark:divide-white/10">
            <div className="p-4">
              <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Cards</h2>
            </div>
            {cards.length === 0 ? (
              <p className="p-4 text-sm text-zinc-500">No cards yet.</p>
            ) : (
              <div className="divide-y divide-black/10 dark:divide-white/10">
                {cards.map((card) => {
                  const monthlyInterest = card.current_balance * (card.interest_rate / 100 / 12)
                  return (
                    <div key={card.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{card.name}</p>
                          <p className="text-sm text-zinc-500">
                            {card.institution || 'No institution'} · {card.type}
                            {card.credit_limit ? ` · Limit: ${formatCurrency(card.credit_limit)}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-lg font-semibold tabular-nums">{formatCurrency(card.current_balance)}</p>
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-zinc-500">APR:</label>
                              <input
                                type="number"
                                step="0.1"
                                value={card.interest_rate}
                                onChange={async (e) => {
                                  const rate = parseFloat(e.target.value) || 0
                                  await window.api.db.updateCard(card.id, { interest_rate: rate })
                                  load()
                                }}
                                className="w-16 rounded border border-black/10 dark:border-white/10 bg-transparent px-1.5 py-0.5 text-xs tabular-nums"
                              />
                              <span className="text-xs text-zinc-500">%</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditCardId(card.id)}
                              className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setDeleteCardId(card.id)}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                      {card.type === 'credit' && monthlyInterest > 0 && (
                        <div className="mt-2 text-xs text-zinc-500">
                          Monthly interest: <span className="font-medium text-zinc-700 dark:text-zinc-300">{formatCurrency(monthlyInterest)}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-black/10 dark:border-white/10 p-4">
            <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-4">Interest Summary</h2>
            <div className="space-y-3">
              {interestData.filter((i) => i.monthly_interest > 0).length === 0 ? (
                <p className="text-sm text-zinc-500">No interest-bearing cards.</p>
              ) : (
                interestData
                  .filter((i) => i.monthly_interest > 0)
                  .map((item) => (
                    <div key={item.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-zinc-500">
                          {formatCurrency(item.current_balance)} @ {item.interest_rate}%
                        </p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">
                        {formatCurrency(item.monthly_interest)}/mo
                      </p>
                    </div>
                  ))
              )}
              {interestData.filter((i) => i.monthly_interest > 0).length > 0 && (
                <div className="border-t border-black/10 dark:border-white/10 pt-3 mt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Total monthly interest</p>
                    <p className="text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">
                      {formatCurrency(totalInterest)}/mo
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showBankModal && (
        <BankModal
          onClose={() => setShowBankModal(false)}
          onSubmit={async (values) => {
            await window.api.db.addBankAccount(values)
            setShowBankModal(false)
            load()
          }}
        />
      )}

      {showCardModal && (
        <CardModal
          onClose={() => setShowCardModal(false)}
          onSubmit={async (values) => {
            await window.api.db.addCard(values)
            setShowCardModal(false)
            load()
          }}
        />
      )}

      {editBankId !== null && (
        <EditBankModal
          account={bankAccounts.find((a) => a.id === editBankId)!}
          onClose={() => setEditBankId(null)}
          onSubmit={async (values) => {
            await window.api.db.updateBankAccount(editBankId, values)
            setEditBankId(null)
            load()
          }}
        />
      )}

      {editCardId !== null && (
        <EditCardModal
          card={cards.find((c) => c.id === editCardId)!}
          onClose={() => setEditCardId(null)}
          onSubmit={async (values) => {
            await window.api.db.updateCard(editCardId, values)
            setEditCardId(null)
            load()
          }}
        />
      )}

      {deleteBankId !== null && (
        <ConfirmModal
          title="Delete Bank Account"
          message="Are you sure you want to delete this bank account? This action cannot be undone."
          onConfirm={async () => {
            await window.api.db.deleteBankAccount(deleteBankId)
            setDeleteBankId(null)
            load()
          }}
          onCancel={() => setDeleteBankId(null)}
        />
      )}

      {deleteCardId !== null && (
        <ConfirmModal
          title="Delete Card"
          message="Are you sure you want to delete this card? This action cannot be undone."
          onConfirm={async () => {
            await window.api.db.deleteCard(deleteCardId)
            setDeleteCardId(null)
            load()
          }}
          onCancel={() => setDeleteCardId(null)}
        />
      )}
    </div>
  )
}

function BankModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (values: any) => Promise<void> }) {
  const [name, setName] = useState('')
  const [institution, setInstitution] = useState('')
  const [accountType, setAccountType] = useState('checking')
  const [balance, setBalance] = useState('0')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-lg p-6 w-full max-w-md space-y-4">
        <h2 className="text-lg font-semibold">Add Bank Account</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
              placeholder="e.g. Primary Checking"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Institution</label>
            <select
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
            >
              <option value="">Select institution</option>
              <option value="bofa_checking">Bank of America - Checking</option>
              <option value="chase">Chase</option>
              <option value="citi">Citi</option>
              <option value="synchrony">Synchrony</option>
              <option value="bestbuy">Best Buy</option>
              <option value="paypal">PayPal</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
              className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
            >
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Current Balance</label>
            <input
              type="number"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit({ name, institution, account_type: accountType, current_balance: parseFloat(balance) || 0 })}
            disabled={!name.trim()}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Add Account
          </button>
        </div>
      </div>
    </div>
  )
}

function CardModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (values: any) => Promise<void> }) {
  const [name, setName] = useState('')
  const [institution, setInstitution] = useState('')
  const [type, setType] = useState('credit')
  const [interestRate, setInterestRate] = useState('0')
  const [creditLimit, setCreditLimit] = useState('')
  const [currentBalance, setCurrentBalance] = useState('0')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-lg p-6 w-full max-w-md space-y-4">
        <h2 className="text-lg font-semibold">Add Card</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
              placeholder="e.g. Chase Amazon Visa"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Institution</label>
            <select
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
            >
              <option value="">Select institution</option>
              <option value="bofa_credit">Bank of America - Credit Card</option>
              <option value="bofa_checking">Bank of America - Checking</option>
              <option value="chase_amazon">Chase Amazon</option>
              <option value="citi_costco">Citi Costco</option>
              <option value="synchrony">Synchrony</option>
              <option value="bestbuy">Best Buy</option>
              <option value="paypal">PayPal</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'credit' | 'debit')}
              className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
            >
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Interest Rate (%)</label>
              <input
                type="number"
                step="0.1"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Credit Limit (optional)</label>
              <input
                type="number"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Current Balance</label>
            <input
              type="number"
              value={currentBalance}
              onChange={(e) => setCurrentBalance(e.target.value)}
              className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit({
              name,
              institution,
              type,
              interest_rate: parseFloat(interestRate) || 0,
              credit_limit: creditLimit ? parseFloat(creditLimit) : undefined,
              current_balance: parseFloat(currentBalance) || 0,
            })}
            disabled={!name.trim()}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Add Card
          </button>
        </div>
      </div>
    </div>
  )
}

function EditBankModal({ account, onClose, onSubmit }: { account: BankAccount; onClose: () => void; onSubmit: (values: any) => Promise<void> }) {
  const [name, setName] = useState(account.name)
  const [institution, setInstitution] = useState(account.institution || '')
  const [accountType, setAccountType] = useState(account.account_type)
  const [balance, setBalance] = useState(String(account.current_balance))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-lg p-6 w-full max-w-md space-y-4">
        <h2 className="text-lg font-semibold">Edit Bank Account</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Institution</label>
            <select
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
            >
              <option value="">Select institution</option>
              <option value="bofa_checking">Bank of America - Checking</option>
              <option value="chase">Chase</option>
              <option value="citi">Citi</option>
              <option value="synchrony">Synchrony</option>
              <option value="bestbuy">Best Buy</option>
              <option value="paypal">PayPal</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
              className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
            >
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Current Balance</label>
            <input
              type="number"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit({ name, institution, account_type: accountType, current_balance: parseFloat(balance) || 0 })}
            disabled={!name.trim()}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function EditCardModal({ card, onClose, onSubmit }: { card: Card; onClose: () => void; onSubmit: (values: any) => Promise<void> }) {
  const [name, setName] = useState(card.name)
  const [institution, setInstitution] = useState(card.institution || '')
  const [type, setType] = useState(card.type)
  const [interestRate, setInterestRate] = useState(String(card.interest_rate))
  const [creditLimit, setCreditLimit] = useState(card.credit_limit ? String(card.credit_limit) : '')
  const [currentBalance, setCurrentBalance] = useState(String(card.current_balance))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-lg p-6 w-full max-w-md space-y-4">
        <h2 className="text-lg font-semibold">Edit Card</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Institution</label>
            <select
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
            >
              <option value="">Select institution</option>
              <option value="bofa_credit">Bank of America - Credit Card</option>
              <option value="bofa_checking">Bank of America - Checking</option>
              <option value="chase_amazon">Chase Amazon</option>
              <option value="citi_costco">Citi Costco</option>
              <option value="synchrony">Synchrony</option>
              <option value="bestbuy">Best Buy</option>
              <option value="paypal">PayPal</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'credit' | 'debit')}
              className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
            >
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Interest Rate (%)</label>
              <input
                type="number"
                step="0.1"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Credit Limit (optional)</label>
              <input
                type="number"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Current Balance</label>
            <input
              type="number"
              value={currentBalance}
              onChange={(e) => setCurrentBalance(e.target.value)}
              className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit({
              name,
              institution,
              type,
              interest_rate: parseFloat(interestRate) || 0,
              credit_limit: creditLimit ? parseFloat(creditLimit) : undefined,
              current_balance: parseFloat(currentBalance) || 0,
            })}
            disabled={!name.trim()}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmModal({ title, message, onConfirm, onCancel }: { title: string; message: string; onConfirm: () => Promise<void>; onCancel: () => void }) {
  const [loading, setLoading] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-lg p-6 w-full max-w-sm space-y-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-zinc-500">{message}</p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              setLoading(true)
              await onConfirm()
            }}
            disabled={loading}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
