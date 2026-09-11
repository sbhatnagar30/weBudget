# weBudget

A local personal finance app built with Next.js and Electron. Track cards, bank accounts, expenses, income, and statements in one place.

## Pages

- **Balances** — add and manage credit/debit cards and bank accounts, with current balances and interest snapshots
- **Statements** — import PDF statements, review parsed transactions, edit or delete entries, and export/import backups
- **Expenses** — view and categorize expenses by card with monthly summaries and batch categorization
- **Income** — view checking-account income and payments with monthly flow charts and payment destination breakdowns
- **Calendar** — daily spending heatmap with account filtering and drill-down into day transactions

## Prerequisites

- Node.js 18+
- npm

## Install

```bash
npm install
```

## Run in development

```bash
npm run dev
```

This starts the Next.js dev server and Electron window together.

## Build for production

```bash
npm run build
```

This creates an optimized Next.js build in `.next/`.

## Create distributable builds

```bash
npm run dist
```

Or target a specific platform:

```bash
npm run dist:win
npm run dist:mac
npm run dist:linux
```

Output artifacts are written to `dist/`.

- Windows: NSIS installer (x64)
- Mac: DMG (x64 and arm64)
- Linux: AppImage, deb, and rpm (x64)

## Backup / restore

On the **Statements** page:

- **Export Backup** — export all data, or only a specific month, as a JSON file
- **Import Backup** — select a backup JSON file, preview included records, resolve any conflicts, and apply the import

## Statement parsers

Supported statement formats:

- Bank of America - Credit Card
- Bank of America - Checking
- Chase Amazon
- Citi Costco
- Synchrony
- Best Buy
- PayPal

Statement PDFs are parsed automatically when importing on the Statements page. If auto-detection fails, choose the institution manually in the Balances account settings.

## Notes

- The app stores data locally in `webudget.db`
- Restart the app after updating to pick up new parser or backend changes
