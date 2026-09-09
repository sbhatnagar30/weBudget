export interface Card {
  id: number;
  name: string;
  type: 'credit' | 'debit';
  institution?: string;
  interest_rate: number;
  credit_limit?: number;
  current_balance: number;
  created_at: string;
  updated_at: string;
}

export interface BankAccount {
  id: number;
  name: string;
  institution?: string;
  account_type: string;
  current_balance: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: number;
  card_id: number;
  date: string;
  description: string;
  amount: number;
  category: string;
  transaction_type: string;
  statement_file?: string;
  note?: string;
  created_at: string;
}

export interface StatementUpload {
  id: number;
  card_id: number;
  statement_month: string;
  source_file: string;
  transaction_count: number;
  imported_at: string;
  card_name?: string;
  card_institution?: string;
}

export interface DailySpending {
  date: string;
  category: string;
  total: number;
  count: number;
}

export interface MonthlyCategorySpending {
  month: string;
  category: string;
  total: number;
  count: number;
}

export interface InterestByCard {
  id: number;
  name: string;
  institution?: string;
  current_balance: number;
  interest_rate: number;
  monthly_interest: number;
}

declare global {
  interface Window {
    api: {
      db: {
        getCards: () => Promise<Card[]>;
        getCard: (id: number) => Promise<Card | undefined>;
        addCard: (card: Partial<Card>) => Promise<Card>;
        updateCard: (id: number, updates: Partial<Card>) => Promise<Card>;
        deleteCard: (id: number) => Promise<boolean>;

        getBankAccounts: () => Promise<BankAccount[]>;
        getBankAccount: (id: number) => Promise<BankAccount | undefined>;
        addBankAccount: (account: Partial<BankAccount>) => Promise<BankAccount>;
        updateBankAccount: (id: number, updates: Partial<BankAccount>) => Promise<BankAccount>;
        deleteBankAccount: (id: number) => Promise<boolean>;

        getTransactions: (filters?: Record<string, unknown>) => Promise<Transaction[]>;
        getTransaction: (id: number) => Promise<Transaction | undefined>;
        addTransaction: (tx: Partial<Transaction>) => Promise<Transaction>;
        addTransactionsBatch: (txs: Partial<Transaction>[]) => Promise<{ added: number; skipped: number }>;
        updateTransaction: (id: number, updates: Partial<Transaction>) => Promise<Transaction>;
        deleteTransaction: (id: number) => Promise<boolean>;

        getInterestSnapshots: () => Promise<any[]>;
        addInterestSnapshot: (snapshot: any) => Promise<any>;

        getStatementUploads: () => Promise<StatementUpload[]>;
        getStatementUpload: (id: number) => Promise<StatementUpload | undefined>;
        addStatementUpload: (upload: Partial<StatementUpload>) => Promise<StatementUpload>;

        getMonthlySpendingByCategory: (filters?: Record<string, unknown>) => Promise<MonthlyCategorySpending[]>;
        getDailySpending: (filters?: Record<string, unknown>) => Promise<DailySpending[]>;
        getCardMonthlySummary: (cardId: number, year: string) => Promise<any[]>;
        getInterestByCard: () => Promise<InterestByCard[]>;
        getTotalMonthlyInterest: () => Promise<number>;
        getCategories: () => Promise<string[]>;
        getDbCategories: () => Promise<any[]>;
        getDbCategory: (id: number) => Promise<any>;
        addDbCategory: (category: { name: string; color?: string }) => Promise<any>;
        updateDbCategory: (id: number, updates: { name?: string; color?: string }) => Promise<any>;
        deleteDbCategory: (id: number) => Promise<boolean>;
        getMissingStatementMonths: (cardId: number) => Promise<string[]>;
      };
      dialog: {
        openFile: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
      };
      parsePdf: (filePath: string) => Promise<{ success: boolean; text?: string; transactions?: any[]; error?: string }>;
    };
  }
}

export {};
