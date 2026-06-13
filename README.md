# Kira

A personal money manager that runs entirely on Cloudflare Workers — a mobile-first
web app for tracking expenses and income, inspired by the classic Android
"Money Manager: Expense Tracker" app.

## Features

- **Quick entry** — calculator-style keypad with `+`/`−` arithmetic, memo, date
  picker, and a category grid (tap to select, long-press-drag to rearrange).
- **Multi-currency** — enter amounts in any of 31 currencies while traveling;
  they're converted to your base currency at the ECB rate **of the transaction's
  date** and stored with the original amount shown in small print.
- **Recurring transactions** — daily/weekly/monthly/yearly rules (rent, salary,
  subscriptions) with optional end dates. Due entries are created on app load and
  by a daily cron trigger. Monthly rules pin to the start day (Jan 31 → Feb 28 → Mar 31).
- **Budgets** — monthly limit per expense category with progress bars.
- **Stats** — donut chart and ranking by category, 6-month income/expense trend.
- **Categories** — fully editable: add (with icon + color picker), delete, and
  drag to reorder; creatable inline from the entry screen.
- **Import / Export** — export all transactions as CSV or Excel (timestamped
  filename); import CSV/XLSX from this app *or other money apps* (flexible
  header/date/amount detection, see below).
- **Light/dark mode** — follows system preference, toggleable, persisted.

## Stack

| Layer | Tech |
|---|---|
| Hosting / API | Cloudflare Worker (`src/index.js`, plain fetch handler, no framework) |
| Database | Cloudflare D1 (SQLite), migrations in `migrations/` |
| Frontend | Static vanilla HTML/CSS/JS in `public/`, served via Workers assets |
| Exchange rates | [frankfurter.dev](https://frankfurter.dev) (free ECB rates), proxied + cached by the Worker |
| Spreadsheets | SheetJS (vendored, lazy-loaded) · SortableJS for drag-reorder |

No build step. No client framework. ~0 cold-start.

## First-time setup (local)

Prerequisites: [Node.js](https://nodejs.org) 18+ and npm.

```sh
git clone <this repo> && cd kira   # or just cd into the folder
npm install                                  # installs wrangler (dev dependency)
npm run db:migrate:local                     # creates the local SQLite DB with seed categories
npm run dev                                  # http://localhost:8787
```

The local database lives under `.wrangler/state/` and survives restarts.

## Deploy to Cloudflare

A free Cloudflare account is enough (Workers free tier + D1 free tier).

```sh
npx wrangler login                           # one-time browser auth

# 1. Create the production database
npx wrangler d1 create kira-db
#    Copy the printed database_id into wrangler.jsonc (d1_databases[0].database_id)

# 2. Apply migrations to the remote DB
npm run db:migrate:remote

# 3. Ship it
npm run deploy                               # -> https://kira.<your-subdomain>.workers.dev
```

Re-deploys are just `npm run deploy`. New migrations: add a numbered file under
`migrations/` and run `npm run db:migrate:remote` before deploying code that
depends on it.

> **⚠️ No authentication is built in.** Anyone with the URL can read and write
> your data. Put the Worker behind
> [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/)
> (free for personal use) or keep the URL private.

### Cron

`wrangler.jsonc` registers a daily trigger (`0 0 * * *`) that materializes due
recurring transactions even if you don't open the app. It is also run on every
app load, so local dev works without it.

## Import format

Use **More → Import CSV / Excel**. The native format is:

```csv
date,type,category,amount,note
2026-06-08,expense,Travel,43.34,Paris dinner
```

Exports from other kira apps usually work as-is. The importer accepts:

- Header aliases: `Income/Expense` → type, `Memo`/`Description`/`Remarks` → note,
  `Subcategory` (merged into the note), etc.
- Dates: `YYYY-MM-DD`, day-first `14/03/26` / `31-12-2025`, Excel date cells.
- Amounts with currency symbols / thousands separators (`RM1,234.50`); when no
  type column exists, negative amounts are treated as expenses.
- Rows it can't understand (e.g. transfers) are skipped and counted in the result.

Unknown categories are created automatically.

## Project layout

```
wrangler.jsonc          Worker config: D1 binding, assets, cron
src/index.js            API routes + recurring engine + scheduled handler
migrations/             D1 schema (0001..0004), applied in order
public/index.html       SPA shell (records / stats / budget / more + editor)
public/app.js           All client logic
public/style.css        Theming via CSS variables (light/dark)
public/vendor/          SheetJS, SortableJS (vendored, no CDN at runtime)
docs/API.md             REST endpoint reference
```

## Notes & limitations

- The display currency (More → Preferences) only changes formatting; stored
  amounts are not retroactively converted. Pick your base currency first.
- Exchange rates are ECB reference rates (business days); weekend/backdated
  conversions use the closest prior rate.
- Editing a foreign-currency transaction without changing its amount keeps the
  original conversion; changing the amount re-converts at the transaction date's rate.
- Deleting a recurring rule keeps the transactions it already created.
