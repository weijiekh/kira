const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const FREQUENCIES = ["daily", "weekly", "monthly", "yearly"];

const pad = (n) => String(n).padStart(2, "0");

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// anchorDay keeps monthly/yearly rules pinned to the start date's day-of-month
// (e.g. started Jan 31 -> Feb 28 -> Mar 31), instead of drifting after short months.
function advanceDate(dateStr, frequency, anchorDay) {
  let [y, m, d] = dateStr.split("-").map(Number);
  if (frequency === "daily" || frequency === "weekly") {
    const dt = new Date(Date.UTC(y, m - 1, d + (frequency === "daily" ? 1 : 7)));
    return dt.toISOString().slice(0, 10);
  }
  if (frequency === "monthly") {
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  } else {
    y += 1;
  }
  return `${y}-${pad(m)}-${pad(Math.min(anchorDay, daysInMonth(y, m)))}`;
}

async function processRecurring(DB) {
  const today = new Date().toISOString().slice(0, 10);
  const { results } = await DB.prepare(
    "SELECT * FROM recurring WHERE active = 1 AND next_date <= ?"
  )
    .bind(today)
    .all();
  let created = 0;
  for (const rule of results) {
    const anchorDay = Number(rule.start_date.slice(8, 10));
    let next = rule.next_date;
    const stmts = [];
    while (next <= today && (!rule.end_date || next <= rule.end_date) && stmts.length < 1000) {
      stmts.push(
        DB.prepare(
          "INSERT INTO transactions (type, amount, category_id, note, date, recurring_id) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(rule.type, rule.amount, rule.category_id, rule.note, next, rule.id)
      );
      next = advanceDate(next, rule.frequency, anchorDay);
    }
    created += stmts.length;
    const expired = rule.end_date && next > rule.end_date;
    stmts.push(
      DB.prepare("UPDATE recurring SET next_date = ?, active = ? WHERE id = ?").bind(
        next,
        expired ? 0 : 1,
        rule.id
      )
    );
    await DB.batch(stmts);
  }
  return created;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function badRequest(message) {
  return json({ error: message }, 400);
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function validateTransaction(body) {
  if (!body) return "Invalid JSON body";
  if (body.type !== "income" && body.type !== "expense") return "type must be 'income' or 'expense'";
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return "amount must be a positive number";
  if (!Number.isInteger(body.category_id)) return "category_id must be an integer";
  if (typeof body.date !== "string" || !DATE_RE.test(body.date)) return "date must be YYYY-MM-DD";
  if (body.note != null && typeof body.note !== "string") return "note must be a string";
  const hasOrigAmount = body.orig_amount != null;
  const hasOrigCurrency = body.orig_currency != null;
  if (hasOrigAmount !== hasOrigCurrency) return "orig_amount and orig_currency must be provided together";
  if (hasOrigAmount) {
    const orig = Number(body.orig_amount);
    if (!Number.isFinite(orig) || orig <= 0) return "orig_amount must be a positive number";
    if (typeof body.orig_currency !== "string" || !/^[A-Z]{3}$/.test(body.orig_currency)) return "orig_currency must be a 3-letter code";
  }
  return null;
}

async function handleApi(request, env, path) {
  const { DB } = env;
  const method = request.method;
  const url = new URL(request.url);

  // --- Categories ---
  if (path === "/api/categories" && method === "GET") {
    const { results } = await DB.prepare(
      "SELECT id, name, type, icon, color FROM categories ORDER BY type, sort_order, id"
    ).all();
    return json(results);
  }

  if (path === "/api/categories/reorder" && method === "PUT") {
    const body = await readBody(request);
    if (!body || !Array.isArray(body.ids) || !body.ids.every(Number.isInteger)) {
      return badRequest("ids must be an array of integers");
    }
    if (body.ids.length) {
      await DB.batch(
        body.ids.map((id, i) =>
          DB.prepare("UPDATE categories SET sort_order = ? WHERE id = ?").bind(i + 1, id)
        )
      );
    }
    return json({ ok: true });
  }

  if (path === "/api/categories" && method === "POST") {
    const body = await readBody(request);
    if (!body || typeof body.name !== "string" || !body.name.trim()) return badRequest("name is required");
    if (body.type !== "income" && body.type !== "expense") return badRequest("type must be 'income' or 'expense'");
    const result = await DB.prepare(
      `INSERT INTO categories (name, type, icon, color, sort_order)
       VALUES (?1, ?2, ?3, ?4, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories WHERE type = ?2))
       RETURNING *`
    )
      .bind(body.name.trim(), body.type, body.icon || "📦", body.color || "#9e9e9e")
      .first();
    return json(result, 201);
  }

  let m = path.match(/^\/api\/categories\/(\d+)$/);
  if (m && method === "DELETE") {
    const id = Number(m[1]);
    const used = await DB.prepare("SELECT 1 FROM transactions WHERE category_id = ? LIMIT 1").bind(id).first();
    if (used) return badRequest("Category has transactions and cannot be deleted");
    await DB.prepare("DELETE FROM budgets WHERE category_id = ?").bind(id).run();
    const result = await DB.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
    if (!result.meta.changes) return json({ error: "Not found" }, 404);
    return json({ ok: true });
  }

  // --- Transactions ---
  if (path === "/api/transactions" && method === "GET") {
    const month = url.searchParams.get("month");
    if (!month || !MONTH_RE.test(month)) return badRequest("month query param must be YYYY-MM");
    const { results } = await DB.prepare(
      `SELECT t.id, t.type, t.amount, t.category_id, t.note, t.date, t.orig_amount, t.orig_currency,
              c.name AS category_name, c.icon AS category_icon, c.color AS category_color
       FROM transactions t JOIN categories c ON c.id = t.category_id
       WHERE substr(t.date, 1, 7) = ?
       ORDER BY t.date DESC, t.id DESC`
    )
      .bind(month)
      .all();
    return json(results);
  }

  if (path === "/api/transactions" && method === "POST") {
    const body = await readBody(request);
    const err = validateTransaction(body);
    if (err) return badRequest(err);
    const cat = await DB.prepare("SELECT type FROM categories WHERE id = ?").bind(body.category_id).first();
    if (!cat) return badRequest("Unknown category_id");
    if (cat.type !== body.type) return badRequest("Category type does not match transaction type");
    const result = await DB.prepare(
      "INSERT INTO transactions (type, amount, category_id, note, date, orig_amount, orig_currency) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *"
    )
      .bind(body.type, Number(body.amount), body.category_id, body.note || "", body.date,
            body.orig_amount != null ? Number(body.orig_amount) : null, body.orig_currency || null)
      .first();
    return json(result, 201);
  }

  m = path.match(/^\/api\/transactions\/(\d+)$/);
  if (m && method === "PUT") {
    const id = Number(m[1]);
    const body = await readBody(request);
    const err = validateTransaction(body);
    if (err) return badRequest(err);
    const cat = await DB.prepare("SELECT type FROM categories WHERE id = ?").bind(body.category_id).first();
    if (!cat) return badRequest("Unknown category_id");
    if (cat.type !== body.type) return badRequest("Category type does not match transaction type");
    const result = await DB.prepare(
      "UPDATE transactions SET type = ?, amount = ?, category_id = ?, note = ?, date = ?, orig_amount = ?, orig_currency = ? WHERE id = ? RETURNING *"
    )
      .bind(body.type, Number(body.amount), body.category_id, body.note || "", body.date,
            body.orig_amount != null ? Number(body.orig_amount) : null, body.orig_currency || null, id)
      .first();
    if (!result) return json({ error: "Not found" }, 404);
    return json(result);
  }

  if (m && method === "DELETE") {
    const result = await DB.prepare("DELETE FROM transactions WHERE id = ?").bind(Number(m[1])).run();
    if (!result.meta.changes) return json({ error: "Not found" }, 404);
    return json({ ok: true });
  }

  // --- Summary ---
  if (path === "/api/summary" && method === "GET") {
    const month = url.searchParams.get("month");
    if (!month || !MONTH_RE.test(month)) return badRequest("month query param must be YYYY-MM");
    const totalsQ = DB.prepare(
      "SELECT type, SUM(amount) AS total FROM transactions WHERE substr(date, 1, 7) = ? GROUP BY type"
    ).bind(month);
    const byCategoryQ = DB.prepare(
      `SELECT c.id, c.name, c.icon, c.color, t.type, SUM(t.amount) AS total
       FROM transactions t JOIN categories c ON c.id = t.category_id
       WHERE substr(t.date, 1, 7) = ?
       GROUP BY c.id, t.type
       ORDER BY total DESC`
    ).bind(month);
    const [totals, byCategory] = await DB.batch([totalsQ, byCategoryQ]);
    let income = 0;
    let expense = 0;
    for (const row of totals.results) {
      if (row.type === "income") income = row.total;
      else expense = row.total;
    }
    return json({ income, expense, balance: income - expense, by_category: byCategory.results });
  }

  // --- Trend (last N months) ---
  if (path === "/api/trend" && method === "GET") {
    const months = Math.min(Math.max(Number(url.searchParams.get("months")) || 6, 1), 24);
    const end = url.searchParams.get("month");
    if (!end || !MONTH_RE.test(end)) return badRequest("month query param must be YYYY-MM");
    const [y, mo] = end.split("-").map(Number);
    const startDate = new Date(Date.UTC(y, mo - 1 - (months - 1), 1));
    const start = `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const { results } = await DB.prepare(
      `SELECT substr(date, 1, 7) AS month, type, SUM(amount) AS total
       FROM transactions
       WHERE substr(date, 1, 7) BETWEEN ? AND ?
       GROUP BY month, type
       ORDER BY month`
    )
      .bind(start, end)
      .all();
    return json(results);
  }

  // --- Budgets ---
  if (path === "/api/budgets" && method === "GET") {
    const month = url.searchParams.get("month");
    if (!month || !MONTH_RE.test(month)) return badRequest("month query param must be YYYY-MM");
    const { results } = await DB.prepare(
      `SELECT c.id AS category_id, c.name, c.icon, c.color,
              COALESCE(b.amount, 0) AS budget,
              COALESCE((SELECT SUM(t.amount) FROM transactions t
                        WHERE t.category_id = c.id AND t.type = 'expense'
                          AND substr(t.date, 1, 7) = ?1), 0) AS spent
       FROM categories c
       LEFT JOIN budgets b ON b.category_id = c.id AND b.month = ?1
       WHERE c.type = 'expense'
       ORDER BY c.sort_order, c.id`
    )
      .bind(month)
      .all();
    return json(results);
  }

  if (path === "/api/budgets" && method === "PUT") {
    const body = await readBody(request);
    if (!body) return badRequest("Invalid JSON body");
    if (!Number.isInteger(body.category_id)) return badRequest("category_id must be an integer");
    if (typeof body.month !== "string" || !MONTH_RE.test(body.month)) return badRequest("month must be YYYY-MM");
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0) return badRequest("amount must be a non-negative number");
    if (amount === 0) {
      await DB.prepare("DELETE FROM budgets WHERE category_id = ? AND month = ?")
        .bind(body.category_id, body.month)
        .run();
      return json({ ok: true });
    }
    await DB.prepare(
      `INSERT INTO budgets (category_id, month, amount) VALUES (?, ?, ?)
       ON CONFLICT (category_id, month) DO UPDATE SET amount = excluded.amount`
    )
      .bind(body.category_id, body.month, amount)
      .run();
    return json({ ok: true });
  }

  // --- Recurring ---
  if (path === "/api/recurring" && method === "GET") {
    const { results } = await DB.prepare(
      `SELECT r.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
       FROM recurring r JOIN categories c ON c.id = r.category_id
       ORDER BY r.active DESC, r.next_date`
    ).all();
    return json(results);
  }

  if (path === "/api/recurring" && method === "POST") {
    const body = await readBody(request);
    if (!body) return badRequest("Invalid JSON body");
    if (body.type !== "income" && body.type !== "expense") return badRequest("type must be 'income' or 'expense'");
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return badRequest("amount must be a positive number");
    if (!Number.isInteger(body.category_id)) return badRequest("category_id must be an integer");
    if (!FREQUENCIES.includes(body.frequency)) return badRequest("frequency must be daily, weekly, monthly or yearly");
    if (typeof body.start_date !== "string" || !DATE_RE.test(body.start_date)) return badRequest("start_date must be YYYY-MM-DD");
    if (body.end_date != null && body.end_date !== "") {
      if (typeof body.end_date !== "string" || !DATE_RE.test(body.end_date)) return badRequest("end_date must be YYYY-MM-DD");
      if (body.end_date < body.start_date) return badRequest("end_date must be after start_date");
    }
    const cat = await DB.prepare("SELECT type FROM categories WHERE id = ?").bind(body.category_id).first();
    if (!cat) return badRequest("Unknown category_id");
    if (cat.type !== body.type) return badRequest("Category type does not match rule type");
    const rule = await DB.prepare(
      `INSERT INTO recurring (type, amount, category_id, note, frequency, start_date, next_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    )
      .bind(body.type, amount, body.category_id, body.note || "", body.frequency,
            body.start_date, body.start_date, body.end_date || null)
      .first();
    const created = await processRecurring(DB);
    return json({ ...rule, created_transactions: created }, 201);
  }

  m = path.match(/^\/api\/recurring\/(\d+)$/);
  if (m && method === "PUT") {
    const id = Number(m[1]);
    const body = await readBody(request);
    if (!body) return badRequest("Invalid JSON body");
    const rule = await DB.prepare("SELECT * FROM recurring WHERE id = ?").bind(id).first();
    if (!rule) return json({ error: "Not found" }, 404);
    const active = body.active != null ? (body.active ? 1 : 0) : rule.active;
    const amount = body.amount != null ? Number(body.amount) : rule.amount;
    if (!Number.isFinite(amount) || amount <= 0) return badRequest("amount must be a positive number");
    const note = body.note != null ? String(body.note) : rule.note;
    let endDate = rule.end_date;
    if ("end_date" in body) {
      if (body.end_date != null && body.end_date !== "" && !DATE_RE.test(body.end_date)) return badRequest("end_date must be YYYY-MM-DD");
      endDate = body.end_date || null;
    }
    const updated = await DB.prepare(
      "UPDATE recurring SET amount = ?, note = ?, end_date = ?, active = ? WHERE id = ? RETURNING *"
    )
      .bind(amount, note, endDate, active, id)
      .first();
    await processRecurring(DB);
    return json(updated);
  }

  if (m && method === "DELETE") {
    const id = Number(m[1]);
    await DB.prepare("UPDATE transactions SET recurring_id = NULL WHERE recurring_id = ?").bind(id).run();
    const result = await DB.prepare("DELETE FROM recurring WHERE id = ?").bind(id).run();
    if (!result.meta.changes) return json({ error: "Not found" }, 404);
    return json({ ok: true });
  }

  if (path === "/api/recurring/process" && method === "POST") {
    const created = await processRecurring(DB);
    return json({ created });
  }

  // --- Exchange rates (ECB via frankfurter.dev, cached 1h; ?date= for historical) ---
  if (path === "/api/rates" && method === "GET") {
    const base = (url.searchParams.get("base") || "USD").toUpperCase();
    if (!/^[A-Z]{3}$/.test(base)) return badRequest("base must be a 3-letter currency code");
    const date = url.searchParams.get("date");
    if (date && !DATE_RE.test(date)) return badRequest("date must be YYYY-MM-DD");
    const upstream = await fetch(`https://api.frankfurter.dev/v1/${date || "latest"}?base=${base}`, {
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    if (!upstream.ok) return json({ error: "Rate service unavailable" }, 502);
    const data = await upstream.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
    });
  }

  // --- Export / Import ---
  if (path === "/api/export" && method === "GET") {
    const { results } = await DB.prepare(
      `SELECT t.date, t.type, c.name AS category, t.amount, t.note
       FROM transactions t JOIN categories c ON c.id = t.category_id
       ORDER BY t.date, t.id`
    ).all();
    return json(results);
  }

  if (path === "/api/import" && method === "POST") {
    const body = await readBody(request);
    if (!body || !Array.isArray(body.rows)) return badRequest("rows must be an array");
    if (body.rows.length > 5000) return badRequest("Too many rows (max 5000 per import)");

    const { results: cats } = await DB.prepare("SELECT id, name, type FROM categories").all();
    const catMap = new Map(cats.map((c) => [`${c.type}:${c.name.toLowerCase()}`, c.id]));

    const valid = [];
    let skipped = 0;
    for (const row of body.rows) {
      const type = row.type === "income" ? "income" : row.type === "expense" ? "expense" : null;
      const amount = Number(row.amount);
      const date = typeof row.date === "string" ? row.date.trim() : "";
      const category = typeof row.category === "string" ? row.category.trim() : "";
      if (!type || !Number.isFinite(amount) || amount <= 0 || !DATE_RE.test(date) || !category) {
        skipped++;
        continue;
      }
      valid.push({ type, amount, date, category, note: typeof row.note === "string" ? row.note : "" });
    }

    for (const row of valid) {
      const key = `${row.type}:${row.category.toLowerCase()}`;
      if (!catMap.has(key)) {
        const cat = await DB.prepare(
          `INSERT INTO categories (name, type, icon, color, sort_order)
           VALUES (?1, ?2, ?3, ?4, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories WHERE type = ?2))
           RETURNING id`
        )
          .bind(row.category, row.type, row.type === "income" ? "💰" : "📦", "#78909c")
          .first();
        catMap.set(key, cat.id);
      }
    }

    const stmts = valid.map((row) =>
      DB.prepare(
        "INSERT INTO transactions (type, amount, category_id, note, date) VALUES (?, ?, ?, ?, ?)"
      ).bind(row.type, row.amount, catMap.get(`${row.type}:${row.category.toLowerCase()}`), row.note, row.date)
    );
    // D1 batch limit safety: chunk inserts
    for (let i = 0; i < stmts.length; i += 100) {
      await DB.batch(stmts.slice(i, i + 100));
    }
    return json({ imported: valid.length, skipped });
  }

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url.pathname);
      } catch (e) {
        console.error(e);
        return json({ error: "Internal error" }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env) {
    await processRecurring(env.DB);
  },
};
