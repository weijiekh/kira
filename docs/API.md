# Kira REST API

All endpoints are served by the Worker under `/api/`. Request/response bodies are
JSON. Errors return `{ "error": "message" }` with status 400/404/500.
Months are `YYYY-MM`, dates are `YYYY-MM-DD`. There is no authentication —
protect the Worker externally (e.g. Cloudflare Access).

## Categories

| Method | Path | Body / params | Notes |
|---|---|---|---|
| GET | `/api/categories` | — | Ordered by type, then `sort_order` |
| POST | `/api/categories` | `{name, type, icon?, color?}` | `type`: `income`\|`expense`; appended to end of its type's order |
| PUT | `/api/categories/reorder` | `{ids: [..]}` | Sets `sort_order` to array position |
| DELETE | `/api/categories/:id` | — | 400 if the category has transactions; deletes its budgets |

## Transactions

| Method | Path | Body / params | Notes |
|---|---|---|---|
| GET | `/api/transactions?month=` | — | Joined with category name/icon/color; includes `orig_amount`/`orig_currency` |
| POST | `/api/transactions` | `{type, amount, category_id, date, note?, orig_amount?, orig_currency?}` | `orig_*` must be provided together; category type must match `type` |
| PUT | `/api/transactions/:id` | same as POST | Full replace |
| DELETE | `/api/transactions/:id` | — | |

`amount` is always in the base/display currency. `orig_amount`/`orig_currency`
record what was physically paid when entered in a foreign currency.

## Aggregates

| Method | Path | Returns |
|---|---|---|
| GET | `/api/summary?month=` | `{income, expense, balance, by_category: [{id, name, icon, color, type, total}]}` |
| GET | `/api/trend?month=&months=` | Per-month income/expense totals ending at `month` (1–24 months) |
| GET | `/api/budgets?month=` | Every expense category with `budget` (0 = unset) and `spent` |
| PUT | `/api/budgets` | `{category_id, month, amount}` — upsert; `amount: 0` deletes |

## Recurring

| Method | Path | Body / params | Notes |
|---|---|---|---|
| GET | `/api/recurring` | — | Joined with category; active rules first |
| POST | `/api/recurring` | `{type, amount, category_id, note?, frequency, start_date, end_date?}` | `frequency`: daily\|weekly\|monthly\|yearly. Materializes immediately (backfills past dates) |
| PUT | `/api/recurring/:id` | `{amount?, note?, end_date?, active?}` | Partial update; `active: false` pauses |
| DELETE | `/api/recurring/:id` | — | Keeps already-created transactions (unlinks them) |
| POST | `/api/recurring/process` | — | Materialize all due occurrences; returns `{created}` |

Materialization also runs on the daily cron trigger and on every app load.
Monthly/yearly rules pin to the start date's day-of-month, clamped to short months.

## Data & rates

| Method | Path | Body / params | Notes |
|---|---|---|---|
| GET | `/api/export` | — | All transactions: `{date, type, category, amount, note}` |
| POST | `/api/import` | `{rows: [{date, type, category, amount, note?}]}` | Max 5000 rows; invalid rows counted as `skipped`; unknown categories auto-created |
| GET | `/api/rates?base=&date=` | — | ECB rates via frankfurter.dev, cached 1h; omit `date` for latest |
