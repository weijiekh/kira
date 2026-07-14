# Time-based entry suggestion

## Problem

New-entry form starts blank every time, even for habitual transactions
(same coffee every weekday morning, same grocery run every Saturday).
User wants a suggestion pre-filled based on when repeat patterns show up.

## Scope

- Suggest category + note + amount together (not amount alone) — grouped
  as one recurring "thing", not independently guessed fields.
- Suggestion appears once, on opening the **new**-entry editor (not the
  edit-existing-transaction flow), before the user has picked anything.
- Single best-guess chip, not a list.
- Prefill only — user must tap the chip to apply, then still tap Save.
  Never auto-submits.

## Matching rule

Time signal comes from `created_at` (the only timestamp with time-of-day;
`date` is date-only). This reflects when the user logged the transaction,
used as a proxy for when it happened.

A past transaction matches "now" if either:
1. Same weekday (`strftime('%w', created_at)`) AND same time-of-day bucket
   (morning 5–11, afternoon 11–17, evening 17–22, night 22–5), or
2. Within a rolling ±2 hour window of the current time, any weekday.

Grouping key for "same recurring thing": `type, category_id, note, amount`
(exact match — no fuzzy amount averaging). Note-less transactions still
group by `category_id, amount` when note is empty.

Confidence bar: a group must have **3 or more** occurrences within the
matching window to be suggested. Below that, no suggestion is shown.

If both rules (1) and (2) produce a qualifying group, prefer rule 1
(weekday+bucket) as more specific. Otherwise use whichever qualifies.

## API

`GET /api/suggest` — no params (server derives current weekday/hour).

Response: `{type, category_id, category_name, category_icon, note, amount}`
or `{}` if no group meets the threshold.

Implementation: two `GROUP BY type, category_id, note, amount HAVING
count(*) >= 3 ORDER BY count(*) DESC, MAX(created_at) DESC LIMIT 1` queries
(one per matching rule), compare as described above.

## Frontend

- Fire `/api/suggest` when the new-entry editor opens (not on edit).
- If a suggestion returns, show one dismissible chip above the keypad,
  e.g. `☕ Coffee · $4.50 · tap to fill`.
- Tap fills type/category/note/keypad entry into the form — same state as
  manual entry. Save button behavior unchanged.
- Dismissing/ignoring does nothing further.

## Out of scope

- Amount averaging / fuzzy grouping.
- Suggestions on the edit-existing-transaction flow.
- Multiple suggestion candidates / ranked list.
