# Kira — dev notes

Personal money manager on Cloudflare Workers + D1. No build step, no framework.

## Commands

- `npm run dev` — wrangler dev on http://localhost:8787 (hot-reloads src/ and public/)
- `npm run db:migrate:local` / `db:migrate:remote` — apply `migrations/` (stop the dev
  server before applying locally to avoid SQLite locks)
- `npm run deploy` — requires real `database_id` in wrangler.jsonc (see README)
- Syntax check without a browser: `node --check public/app.js src/index.js`

## Architecture

- `src/index.js` — single fetch handler; URL-pattern routing, parameterized D1 queries.
  Also exports `scheduled` (daily cron) which runs `processRecurring`.
- `public/app.js` — all client logic; talks to `/api/*`. State in a module-level
  `state` object; re-render functions per section (no virtual DOM).
- Money is stored in the user's base currency. Foreign entries keep
  `orig_amount`/`orig_currency` for display; conversion happens client-side at
  save time using `/api/rates` (ECB via frankfurter.dev, date-aware).
- Display currency + theme live in `localStorage` (`currency`, `theme`), not the DB.
- `public/vendor/` is vendored (SheetJS lazy-loaded for import/export, SortableJS
  for category drag-reorder) — don't replace with CDN links.

## Conventions

- Migrations are append-only, numbered `NNNN_name.sql`; category seed inserts use
  `WHERE NOT EXISTS` to stay idempotent against user-created duplicates.
- Category `sort_order` is per-type (expense/income numbered independently).
- API validation returns 400 with `{error}`; client surfaces via `alert()`.
- The import path is deliberately tolerant (header aliases, day-first dates,
  signed amounts) — keep `mapImportRow` pure; it's tested by extracting it into
  node (see git history / README).
