const state = {
  month: new Date().toISOString().slice(0, 7),
  categories: [],
  transactions: [],
  summary: { income: 0, expense: 0, balance: 0, by_category: [] },
  statsType: "expense",
  editingId: null,
  formType: "expense",
  selectedCategoryId: null,
  editorDate: null,
};

// Calculator keypad state: completed tokens (numbers and +/- operators) plus the entry being typed.
const kp = { tokens: [], entry: "" };

// Currencies supported by the ECB reference rates (frankfurter.dev).
const CURRENCIES = [
  "USD", "EUR", "GBP", "JPY", "CNY", "MYR", "SGD", "THB", "IDR", "PHP", "INR", "KRW",
  "HKD", "AUD", "NZD", "CAD", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON",
  "BGN", "TRY", "ILS", "ZAR", "MXN", "BRL", "ISK",
];

let currency = localStorage.getItem("currency") || "USD";
if (!CURRENCIES.includes(currency)) currency = "USD";
let fmt = new Intl.NumberFormat(undefined, { style: "currency", currency });

function setCurrency(code) {
  currency = code;
  localStorage.setItem("currency", code);
  fmt = new Intl.NumberFormat(undefined, { style: "currency", currency: code });
}

const $ = (sel) => document.querySelector(sel);

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function monthLabel(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function shiftMonth(month, delta) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// --- Theme ---

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("theme", theme);
  $("#theme-toggle").textContent = theme === "dark" ? "☀️" : "🌙";
  $("#dark-toggle").checked = theme === "dark";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === "dark" ? "#1e1e1e" : "#fdd835";
  renderDonut();
  renderTrend();
}

// --- Rendering ---

function renderSummary() {
  const { income, expense, balance } = state.summary;
  $("#sum-income").textContent = fmt.format(income);
  $("#sum-expense").textContent = fmt.format(expense);
  $("#sum-balance").textContent = fmt.format(balance);
  $("#month-label").textContent = monthLabel(state.month);
}

function renderTransactions() {
  const list = $("#tx-list");
  list.innerHTML = "";
  $("#tx-empty").classList.toggle("hidden", state.transactions.length > 0);

  const byDay = new Map();
  for (const tx of state.transactions) {
    if (!byDay.has(tx.date)) byDay.set(tx.date, []);
    byDay.get(tx.date).push(tx);
  }

  for (const [date, txs] of byDay) {
    const group = document.createElement("div");
    group.className = "day-group";

    const dayTotal = txs.reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0);
    const header = document.createElement("div");
    header.className = "day-header";
    const label = new Date(date + "T00:00:00").toLocaleDateString(undefined, {
      weekday: "short", month: "short", day: "numeric",
    });
    header.innerHTML = `<span>${label}</span><span>${fmt.format(dayTotal)}</span>`;
    group.appendChild(header);

    for (const tx of txs) {
      const item = document.createElement("div");
      item.className = "tx-item";
      item.innerHTML = `
        <div class="tx-icon">${tx.category_icon}</div>
        <div class="tx-info">
          <div class="tx-category"></div>
          <div class="tx-note"></div>
        </div>
        <div class="tx-right">
          <div class="tx-amount ${tx.type}">${tx.type === "income" ? "+" : "-"}${fmt.format(tx.amount)}</div>
          ${tx.orig_currency ? `<div class="tx-orig">${tx.orig_amount} ${tx.orig_currency}</div>` : ""}
        </div>`;
      item.querySelector(".tx-category").textContent = tx.category_name;
      item.querySelector(".tx-note").textContent = tx.note;
      item.addEventListener("click", () => openEditor(tx));
      group.appendChild(item);
    }
    list.appendChild(group);
  }
}

function renderDonut() {
  const canvas = $("#donut-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const rows = state.summary.by_category.filter((r) => r.type === state.statsType);
  const total = rows.reduce((s, r) => s + r.total, 0);
  const legend = $("#donut-legend");
  legend.innerHTML = "";
  renderRanking(rows, total);

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = 70;

  if (!total) {
    ctx.strokeStyle = cssVar("--circle");
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = cssVar("--text-muted");
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(state.statsType === "expense" ? "Expenses" : "Income", cx, cy - 4);
    ctx.fillText("0", cx, cy + 12);
    legend.innerHTML = `<div class="legend-item"><span class="legend-name" style="color:${cssVar("--text-muted")}">No Data Available</span></div>`;
    return;
  }

  let angle = -Math.PI / 2;
  for (const row of rows) {
    const slice = (row.total / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = row.color;
    ctx.fill();
    angle += slice;

    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `
      <div class="legend-dot" style="border-color:${row.color}"></div>
      <span class="legend-name"></span>
      <span class="legend-pct">${((row.total / total) * 100).toFixed(1)}%</span>`;
    item.querySelector(".legend-name").textContent = row.name;
    legend.appendChild(item);
  }

  // donut hole
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = cssVar("--card");
  ctx.fill();
  ctx.fillStyle = cssVar("--text-muted");
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(state.statsType === "expense" ? "Expenses" : "Income", cx, cy - 6);
  ctx.fillStyle = cssVar("--text");
  ctx.font = "bold 14px sans-serif";
  ctx.fillText(fmt.format(total), cx, cy + 12);
}

function renderRanking(rows, total) {
  const box = $("#stats-ranking");
  box.innerHTML = "";
  if (!total) {
    box.innerHTML = `<div class="legend-item"><span class="legend-name" style="color:${cssVar("--text-muted")}">No Data Available</span></div>`;
    return;
  }
  for (const row of rows) {
    const pct = (row.total / total) * 100;
    const item = document.createElement("div");
    item.className = "ranking-item";
    item.innerHTML = `
      <div class="ranking-icon">${row.icon}</div>
      <div class="ranking-info">
        <div class="ranking-name"></div>
        <div class="ranking-bar"><div class="ranking-fill" style="width:${pct}%;background:${row.color}"></div></div>
      </div>
      <div class="ranking-amount">${fmt.format(row.total)}</div>`;
    item.querySelector(".ranking-name").textContent = `${row.name} · ${pct.toFixed(1)}%`;
    box.appendChild(item);
  }
}

async function renderTrend() {
  const canvas = $("#trend-chart");
  if (!canvas) return;
  const rows = await api(`/api/trend?month=${state.month}&months=6`);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const months = [];
  for (let i = 5; i >= 0; i--) months.push(shiftMonth(state.month, -i));
  const data = months.map((m) => {
    const income = rows.find((r) => r.month === m && r.type === "income")?.total || 0;
    const expense = rows.find((r) => r.month === m && r.type === "expense")?.total || 0;
    return { month: m, income, expense };
  });

  const max = Math.max(...data.map((d) => Math.max(d.income, d.expense)), 1);
  const chartH = 140;
  const baseY = 150;
  const groupW = canvas.width / 6;

  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  data.forEach((d, i) => {
    const x = i * groupW + groupW / 2;
    const incomeH = (d.income / max) * chartH;
    const expenseH = (d.expense / max) * chartH;
    ctx.fillStyle = cssVar("--income");
    ctx.fillRect(x - 14, baseY - incomeH, 12, incomeH);
    ctx.fillStyle = cssVar("--expense");
    ctx.fillRect(x + 2, baseY - expenseH, 12, expenseH);
    ctx.fillStyle = cssVar("--text-muted");
    ctx.fillText(d.month.slice(5), x, baseY + 14);
  });
}

async function renderBudgets() {
  const rows = await api(`/api/budgets?month=${state.month}`);
  const list = $("#budget-list");
  list.innerHTML = "";

  for (const row of rows) {
    const pct = row.budget > 0 ? Math.min((row.spent / row.budget) * 100, 100) : 0;
    const over = row.budget > 0 && row.spent > row.budget;
    const item = document.createElement("div");
    item.className = "budget-item";
    item.innerHTML = `
      <div class="budget-top">
        <span>${row.icon}</span>
        <span class="budget-name"></span>
        <input class="budget-input" type="number" min="0" step="0.01" inputmode="decimal"
               value="${row.budget || ""}" placeholder="No limit">
      </div>
      <div class="budget-bar"><div class="budget-fill ${over ? "over" : ""}" style="width:${pct}%"></div></div>
      <div class="budget-detail">
        <span>Spent: ${fmt.format(row.spent)}</span>
        <span>${row.budget > 0 ? `Left: ${fmt.format(row.budget - row.spent)}` : "No budget set"}</span>
      </div>`;
    item.querySelector(".budget-name").textContent = row.name;
    item.querySelector(".budget-input").addEventListener("change", async (e) => {
      const amount = Number(e.target.value) || 0;
      try {
        await api("/api/budgets", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category_id: row.category_id, month: state.month, amount }),
        });
        renderBudgets();
      } catch (err) {
        alert(err.message);
      }
    });
    list.appendChild(item);
  }
}

// --- Keypad ---

function kpDisplay() {
  const s = kp.tokens.join("") + kp.entry;
  return s || "0";
}

function kpValue() {
  const seq = [...kp.tokens];
  if (kp.entry) seq.push(kp.entry);
  let total = 0;
  let op = "+";
  for (const t of seq) {
    if (t === "+" || t === "-") op = t;
    else total = op === "+" ? total + Number(t) : total - Number(t);
  }
  return Math.round(total * 100) / 100;
}

function kpReset(value) {
  kp.tokens = [];
  kp.entry = value != null ? String(value) : "";
  updateAmountDisplay();
}

function updateAmountDisplay() {
  $("#amount-display").textContent = kpDisplay();
  updateConvHint();
}

// Shows the home-currency equivalent while entering an amount in a foreign currency.
async function updateConvHint() {
  const hint = $("#conv-hint");
  const entryCur = $("#entry-currency").value;
  if (!entryCur || entryCur === currency) {
    hint.classList.add("hidden");
    return;
  }
  hint.classList.remove("hidden");
  const value = kpValue();
  try {
    const data = await getRates(entryCur, state.editorDate);
    const rate = data.rates[currency];
    hint.textContent = rate
      ? `≈ ${fmt.format(value * rate)} · rate of ${data.date}`
      : `No rate for ${entryCur} → ${currency}`;
  } catch {
    hint.textContent = "Exchange rate unavailable";
  }
}

function kpPress(key) {
  if (key >= "0" && key <= "9") {
    const decimals = kp.entry.split(".")[1];
    if (decimals && decimals.length >= 2) return;
    if (kp.entry === "0") kp.entry = key;
    else kp.entry += key;
  } else if (key === ".") {
    if (kp.entry.includes(".")) return;
    kp.entry = kp.entry ? kp.entry + "." : "0.";
  } else if (key === "back") {
    if (kp.entry) {
      kp.entry = kp.entry.slice(0, -1);
    } else if (kp.tokens.length) {
      kp.tokens.pop(); // remove trailing operator
      kp.entry = kp.tokens.pop() || "";
    }
  } else if (key === "+" || key === "-") {
    if (!kp.entry && !kp.tokens.length) return;
    if (!kp.entry) {
      kp.tokens[kp.tokens.length - 1] = key; // swap operator
    } else {
      kp.tokens.push(kp.entry, key);
      kp.entry = "";
    }
  }
  updateAmountDisplay();
}

// --- Editor ---

function renderEditorCategories() {
  const grid = $("#editor-categories");
  grid.innerHTML = "";
  const cats = state.categories.filter((c) => c.type === state.formType);
  if (!cats.some((c) => c.id === state.selectedCategoryId)) {
    state.selectedCategoryId = cats[0]?.id ?? null;
  }
  for (const cat of cats) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.id = cat.id;
    const selected = cat.id === state.selectedCategoryId;
    btn.className = "cat-btn" + (selected ? " selected" : "");
    btn.innerHTML = `<div class="cat-circle"></div><span></span>`;
    btn.querySelector(".cat-circle").textContent = cat.icon;
    if (selected) btn.querySelector(".cat-circle").style.background = cat.color;
    btn.querySelector("span").textContent = cat.name;
    btn.addEventListener("click", () => {
      state.selectedCategoryId = cat.id;
      renderEditorCategories();
      updateMemoIcon();
    });
    grid.appendChild(btn);
  }
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "cat-btn cat-add";
  addBtn.innerHTML = `<div class="cat-circle">＋</div><span>Add</span>`;
  addBtn.addEventListener("click", () => openCatModal("editor", state.formType));
  grid.appendChild(addBtn);
  updateMemoIcon();
}

function updateMemoIcon() {
  const cat = state.categories.find((c) => c.id === state.selectedCategoryId);
  $("#memo-cat-icon").textContent = cat ? cat.icon : "💰";
}

function setFormType(type) {
  state.formType = type;
  document.querySelectorAll(".type-tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.type === type);
  });
  renderEditorCategories();
}

function setEditorDate(date) {
  state.editorDate = date;
  $("#date-input").value = date;
  const isToday = date === todayStr();
  const [, m, d] = date.split("-").map(Number);
  $("#date-label").textContent = isToday ? "Today" : `${m}/${d}`;
  $("#date-sublabel").textContent = isToday ? `${m}/${d}` : "";
  updateConvHint();
}

function openEditor(tx = null) {
  state.editingId = tx ? tx.id : null;
  $("#editor-delete").classList.toggle("hidden", !tx);
  $("#memo-input").value = tx ? tx.note : "";
  state.selectedCategoryId = tx ? tx.category_id : null;
  setFormType(tx ? tx.type : "expense");
  $("#entry-currency").value = tx?.orig_currency || currency;
  setEditorDate(tx ? tx.date : todayStr());
  kpReset(tx ? (tx.orig_currency ? tx.orig_amount : tx.amount) : null);
  $("#editor").classList.remove("hidden");
  $("#app").classList.add("hidden");
}

function closeEditor() {
  $("#editor").classList.add("hidden");
  $("#app").classList.remove("hidden");
}

async function submitEditor() {
  const entered = kpValue();
  if (!state.selectedCategoryId) {
    alert("Please select a category");
    return;
  }
  if (!(entered > 0)) {
    alert("Please enter an amount greater than zero");
    return;
  }
  const entryCur = $("#entry-currency").value;
  let amount = entered;
  let origAmount = null;
  let origCurrency = null;
  if (entryCur !== currency) {
    origAmount = entered;
    origCurrency = entryCur;
    const prev = state.editingId ? state.transactions.find((t) => t.id === state.editingId) : null;
    if (prev && prev.orig_currency === entryCur && Number(prev.orig_amount) === entered) {
      // Amount untouched while editing: keep the rate it was originally converted at.
      amount = prev.amount;
    } else {
      let rate;
      try {
        rate = (await getRates(entryCur, state.editorDate)).rates[currency];
      } catch {}
      if (!rate) {
        alert(`No exchange rate available for ${entryCur} → ${currency}`);
        return;
      }
      amount = Math.round(entered * rate * 100) / 100;
    }
  }
  const payload = {
    type: state.formType,
    amount,
    orig_amount: origAmount,
    orig_currency: origCurrency,
    category_id: state.selectedCategoryId,
    date: state.editorDate,
    note: $("#memo-input").value.trim(),
  };
  try {
    const opts = {
      method: state.editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    };
    await api(state.editingId ? `/api/transactions/${state.editingId}` : "/api/transactions", opts);
    closeEditor();
    state.month = payload.date.slice(0, 7);
    loadMonth();
  } catch (err) {
    alert(err.message);
  }
}

// --- Data loading ---

async function loadMonth() {
  renderSummary();
  const [transactions, summary] = await Promise.all([
    api(`/api/transactions?month=${state.month}`),
    api(`/api/summary?month=${state.month}`),
  ]);
  state.transactions = transactions;
  state.summary = summary;
  renderSummary();
  renderTransactions();
  renderDonut();
  renderTrend();
  if ($("#tab-budget").classList.contains("active")) renderBudgets();
}

// --- Events ---

$("#prev-month").addEventListener("click", () => {
  state.month = shiftMonth(state.month, -1);
  loadMonth();
});

$("#next-month").addEventListener("click", () => {
  state.month = shiftMonth(state.month, 1);
  loadMonth();
});

$("#theme-toggle").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
});

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    $(`#tab-${btn.dataset.tab}`).classList.add("active");
    $("#fab").style.display = btn.dataset.tab === "transactions" ? "" : "none";
    if (btn.dataset.tab === "budget") renderBudgets();
    if (btn.dataset.tab === "stats") { renderDonut(); renderTrend(); }
    if (btn.dataset.tab === "settings") renderSettings();
  });
});

document.querySelectorAll(".stats-type-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".stats-type-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.statsType = btn.dataset.type;
    renderDonut();
  });
});

document.querySelectorAll(".type-tab").forEach((btn) => {
  btn.addEventListener("click", () => setFormType(btn.dataset.type));
});

$("#fab").addEventListener("click", () => openEditor());
$("#editor-back").addEventListener("click", closeEditor);

document.querySelectorAll(".key[data-key]").forEach((btn) => {
  btn.addEventListener("click", () => kpPress(btn.dataset.key));
});

$("#key-confirm").addEventListener("click", submitEditor);

$("#date-input").addEventListener("change", (e) => {
  if (e.target.value) setEditorDate(e.target.value);
});

$("#editor-delete").addEventListener("click", async () => {
  if (!state.editingId || !confirm("Delete this transaction?")) return;
  try {
    await api(`/api/transactions/${state.editingId}`, { method: "DELETE" });
    closeEditor();
    loadMonth();
  } catch (err) {
    alert(err.message);
  }
});

// Hardware keyboard support in the editor.
document.addEventListener("keydown", (e) => {
  if ($("#editor").classList.contains("hidden")) return;
  if (document.activeElement === $("#memo-input") && e.key !== "Enter" && e.key !== "Escape") return;
  if (e.key >= "0" && e.key <= "9") kpPress(e.key);
  else if (e.key === ".") kpPress(".");
  else if (e.key === "Backspace") kpPress("back");
  else if (e.key === "+") kpPress("+");
  else if (e.key === "-") kpPress("-");
  else if (e.key === "Enter") submitEditor();
  else if (e.key === "Escape") closeEditor();
});

// --- Settings: categories ---

state.catSettingsType = "expense";

const ICON_CHOICES = [
  "🍔", "🍜", "☕", "🍺", "🚌", "🚗", "⛽", "✈️",
  "🛍️", "👕", "🧾", "📱", "🏠", "💡", "💊", "🏥",
  "🎬", "🎮", "📚", "🎓", "🐶", "👶", "🎁", "💼",
  "📈", "💰", "🏦", "🛡️", "💳", "🏋️", "💇", "📦",
];

const COLOR_CHOICES = [
  "#ef5350", "#ec407a", "#ab47bc", "#7e57c2", "#5c6bc0", "#42a5f5", "#26c6da", "#26a69a",
  "#66bb6a", "#9ccc65", "#ffca28", "#ffa726", "#ff7043", "#8d6e63", "#78909c", "#bdbdbd",
];

async function reloadCategories() {
  state.categories = await api("/api/categories");
}

function renderSettings() {
  renderCatSettings();
  renderRecurring();
  updateConverter();
}

function renderCatSettings() {
  const list = $("#cat-settings-list");
  list.innerHTML = "";
  for (const cat of state.categories.filter((c) => c.type === state.catSettingsType)) {
    const row = document.createElement("div");
    row.className = "cat-row";
    row.dataset.id = cat.id;
    row.innerHTML = `
      <span class="drag-handle" aria-hidden="true">≡</span>
      <div class="cat-row-icon"></div>
      <span class="cat-row-name"></span>
      <button class="row-delete" aria-label="Delete category">⊖</button>`;
    row.querySelector(".cat-row-icon").textContent = cat.icon;
    row.querySelector(".cat-row-icon").style.background = cat.color;
    row.querySelector(".cat-row-name").textContent = cat.name;
    row.querySelector(".row-delete").addEventListener("click", async () => {
      if (!confirm(`Delete category "${cat.name}"?`)) return;
      try {
        await api(`/api/categories/${cat.id}`, { method: "DELETE" });
        await reloadCategories();
        renderCatSettings();
      } catch (err) {
        alert(err.message);
      }
    });
    list.appendChild(row);
  }
}

document.querySelectorAll(".cat-type-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".cat-type-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.catSettingsType = btn.dataset.type;
    renderCatSettings();
  });
});

// --- Category drag-to-reorder ---

async function saveCategoryOrder(container, itemSelector, rerender) {
  const ids = [...container.querySelectorAll(itemSelector)]
    .map((el) => Number(el.dataset.id))
    .filter(Boolean);
  try {
    await api("/api/categories/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    await reloadCategories();
  } catch (err) {
    alert(err.message);
  }
  rerender();
}

if (window.Sortable) {
  Sortable.create($("#editor-categories"), {
    animation: 150,
    delay: 200,
    delayOnTouchOnly: true,
    draggable: ".cat-btn",
    filter: ".cat-add",
    onMove: (evt) => !evt.related.classList.contains("cat-add"),
    onEnd: () => saveCategoryOrder($("#editor-categories"), ".cat-btn:not(.cat-add)", renderEditorCategories),
  });
  Sortable.create($("#cat-settings-list"), {
    animation: 150,
    handle: ".drag-handle",
    draggable: ".cat-row",
    onEnd: () => saveCategoryOrder($("#cat-settings-list"), ".cat-row", renderCatSettings),
  });
}

// --- Category modal ---

const catModal = { type: "expense", icon: ICON_CHOICES[0], color: COLOR_CHOICES[0] };

function showModal(id) {
  $("#modal-backdrop").classList.remove("hidden");
  document.querySelectorAll(".sheet-modal").forEach((mdl) => mdl.classList.add("hidden"));
  $(id).classList.remove("hidden");
}

function hideModals() {
  $("#modal-backdrop").classList.add("hidden");
}

function renderIconGrid() {
  const grid = $("#icon-grid");
  grid.innerHTML = "";
  for (const icon of ICON_CHOICES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-option" + (icon === catModal.icon ? " selected" : "");
    btn.textContent = icon;
    btn.addEventListener("click", () => { catModal.icon = icon; renderIconGrid(); });
    grid.appendChild(btn);
  }
}

function renderColorGrid() {
  const grid = $("#color-grid");
  grid.innerHTML = "";
  for (const color of COLOR_CHOICES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "color-option" + (color === catModal.color ? " selected" : "");
    btn.style.background = color;
    btn.addEventListener("click", () => { catModal.color = color; renderColorGrid(); });
    grid.appendChild(btn);
  }
}

function setCatModalType(type) {
  catModal.type = type;
  document.querySelectorAll(".cat-modal-type").forEach((b) => {
    b.classList.toggle("active", b.dataset.type === type);
  });
}

let catModalSource = "settings";

function openCatModal(source, type) {
  catModalSource = source;
  $("#cat-name").value = "";
  setCatModalType(type);
  renderIconGrid();
  renderColorGrid();
  showModal("#cat-modal");
  $("#cat-name").focus();
}

$("#add-category-btn").addEventListener("click", () => openCatModal("settings", state.catSettingsType));

document.querySelectorAll(".cat-modal-type").forEach((btn) => {
  btn.addEventListener("click", () => setCatModalType(btn.dataset.type));
});

$("#cat-save").addEventListener("click", async () => {
  const name = $("#cat-name").value.trim();
  if (!name) { alert("Please enter a name"); return; }
  try {
    const created = await api("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type: catModal.type, icon: catModal.icon, color: catModal.color }),
    });
    hideModals();
    await reloadCategories();
    if (catModalSource === "editor") {
      state.selectedCategoryId = created.id;
      setFormType(catModal.type);
    } else {
      state.catSettingsType = catModal.type;
      document.querySelectorAll(".cat-type-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.type === catModal.type);
      });
      renderCatSettings();
    }
  } catch (err) {
    alert(err.message);
  }
});

// --- Recurring ---

const FREQ_LABELS = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };

async function renderRecurring() {
  const rules = await api("/api/recurring");
  const list = $("#recurring-list");
  list.innerHTML = "";
  if (!rules.length) {
    list.innerHTML = `<p class="data-hint">No recurring transactions. Add rent, salary, subscriptions…</p>`;
    return;
  }
  for (const rule of rules) {
    const row = document.createElement("div");
    row.className = "rec-row" + (rule.active ? "" : " inactive");
    const until = rule.end_date ? ` · until ${rule.end_date}` : "";
    const status = rule.active ? `next ${rule.next_date}` : "paused";
    row.innerHTML = `
      <div class="cat-row-icon">${rule.category_icon}</div>
      <div class="rec-info">
        <div class="rec-title"></div>
        <div class="rec-sub">${FREQ_LABELS[rule.frequency]} · ${status}${until}</div>
      </div>
      <span class="rec-amount ${rule.type === "income" ? "income" : "expense"}">${rule.type === "income" ? "+" : "-"}${fmt.format(rule.amount)}</span>
      <input type="checkbox" class="rec-toggle" ${rule.active ? "checked" : ""} aria-label="Active">
      <button class="row-delete" aria-label="Delete rule">⊖</button>`;
    row.querySelector(".rec-title").textContent = rule.note || rule.category_name;
    row.querySelector(".rec-amount").style.color = rule.type === "income" ? "var(--income)" : "var(--expense)";
    row.querySelector(".rec-toggle").addEventListener("change", async (e) => {
      try {
        await api(`/api/recurring/${rule.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: e.target.checked }),
        });
        renderRecurring();
        loadMonth();
      } catch (err) {
        alert(err.message);
      }
    });
    row.querySelector(".row-delete").addEventListener("click", async () => {
      if (!confirm("Delete this recurring rule? Already created transactions are kept.")) return;
      try {
        await api(`/api/recurring/${rule.id}`, { method: "DELETE" });
        renderRecurring();
      } catch (err) {
        alert(err.message);
      }
    });
    list.appendChild(row);
  }
}

let recModalType = "expense";

function setRecModalType(type) {
  recModalType = type;
  document.querySelectorAll(".rec-modal-type").forEach((b) => {
    b.classList.toggle("active", b.dataset.type === type);
  });
  const select = $("#rec-category");
  select.innerHTML = "";
  for (const cat of state.categories.filter((c) => c.type === type)) {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = `${cat.icon} ${cat.name}`;
    select.appendChild(opt);
  }
}

$("#add-recurring-btn").addEventListener("click", () => {
  $("#rec-amount").value = "";
  $("#rec-note").value = "";
  $("#rec-frequency").value = "monthly";
  $("#rec-start").value = todayStr();
  $("#rec-end").value = "";
  setRecModalType("expense");
  showModal("#rec-modal");
});

document.querySelectorAll(".rec-modal-type").forEach((btn) => {
  btn.addEventListener("click", () => setRecModalType(btn.dataset.type));
});

$("#rec-save").addEventListener("click", async () => {
  const amount = Number($("#rec-amount").value);
  if (!(amount > 0)) { alert("Please enter an amount greater than zero"); return; }
  if (!$("#rec-start").value) { alert("Please pick a start date"); return; }
  try {
    await api("/api/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: recModalType,
        amount,
        category_id: Number($("#rec-category").value),
        note: $("#rec-note").value.trim(),
        frequency: $("#rec-frequency").value,
        start_date: $("#rec-start").value,
        end_date: $("#rec-end").value || null,
      }),
    });
    hideModals();
    renderRecurring();
    loadMonth();
  } catch (err) {
    alert(err.message);
  }
});

$("#modal-backdrop").addEventListener("click", (e) => {
  if (e.target.id === "modal-backdrop") hideModals();
});

document.querySelectorAll(".modal-close").forEach((btn) => {
  btn.addEventListener("click", hideModals);
});

// --- Preferences: currency + dark mode ---

function fillCurrencySelect(select, value) {
  select.innerHTML = "";
  for (const code of CURRENCIES) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = code;
    select.appendChild(opt);
  }
  select.value = value;
}

fillCurrencySelect($("#currency-select"), currency);
fillCurrencySelect($("#entry-currency"), currency);

$("#entry-currency").addEventListener("change", updateConvHint);

$("#currency-select").addEventListener("change", (e) => {
  setCurrency(e.target.value);
  loadMonth();
  renderSettings();
  if ($("#tab-budget").classList.contains("active")) renderBudgets();
});

$("#dark-toggle").addEventListener("change", (e) => {
  applyTheme(e.target.checked ? "dark" : "light");
});

// --- Currency converter ---

const ratesCache = new Map();

// date (optional, YYYY-MM-DD in the past) fetches the ECB rate of that day,
// so backdated travel expenses convert at the rate of when they happened.
async function getRates(base, date) {
  const historical = date && date < todayStr();
  const key = historical ? `${base}:${date}` : `${base}:latest`;
  if (!ratesCache.has(key)) {
    ratesCache.set(key, await api(`/api/rates?base=${base}${historical ? `&date=${date}` : ""}`));
  }
  return ratesCache.get(key);
}

async function updateConverter() {
  const amount = Number($("#conv-amount").value) || 0;
  const from = $("#conv-from").value;
  const to = $("#conv-to").value;
  const result = $("#conv-result");
  const rateLine = $("#conv-rate");
  if (from === to) {
    result.textContent = amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
    rateLine.textContent = "Live ECB reference rates, updated daily.";
    return;
  }
  result.textContent = "…";
  try {
    const data = await getRates(from);
    const rate = data.rates[to];
    if (!rate) throw new Error(`No rate for ${to}`);
    result.textContent = (amount * rate).toLocaleString(undefined, { maximumFractionDigits: 2 });
    rateLine.textContent = `1 ${from} = ${rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${to} · ECB rates as of ${data.date}`;
  } catch (err) {
    result.textContent = "—";
    rateLine.textContent = "Rates unavailable: " + err.message;
  }
}

fillCurrencySelect($("#conv-from"), currency);
fillCurrencySelect($("#conv-to"), currency === "USD" ? "EUR" : "USD");

$("#conv-amount").addEventListener("input", updateConverter);
$("#conv-from").addEventListener("change", updateConverter);
$("#conv-to").addEventListener("change", updateConverter);

$("#conv-swap").addEventListener("click", () => {
  const from = $("#conv-from").value;
  $("#conv-from").value = $("#conv-to").value;
  $("#conv-to").value = from;
  updateConverter();
});

// --- Import / Export ---

function ensureXLSX() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/vendor/xlsx.full.min.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Failed to load spreadsheet library"));
    document.head.appendChild(s);
  });
}

function exportFilename(ext) {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  return `kira-export_${stamp}.${ext}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

$("#export-csv").addEventListener("click", async () => {
  try {
    const rows = await api("/api/export");
    const esc = (v) => {
      v = String(v ?? "");
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    };
    const csv = ["date,type,category,amount,note"]
      .concat(rows.map((r) => [r.date, r.type, r.category, r.amount, r.note].map(esc).join(",")))
      .join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), exportFilename("csv"));
  } catch (err) {
    alert(err.message);
  }
});

$("#export-xlsx").addEventListener("click", async () => {
  try {
    const [rows] = await Promise.all([api("/api/export"), ensureXLSX()]);
    const ws = XLSX.utils.json_to_sheet(rows, { header: ["date", "type", "category", "amount", "note"] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    XLSX.writeFile(wb, exportFilename("xlsx"));
  } catch (err) {
    alert(err.message);
  }
});

$("#import-file").addEventListener("click", () => $("#import-input").click());

function normalizeImportDate(value) {
  if (typeof value === "number" && window.XLSX) {
    return XLSX.SSF.format("yyyy-mm-dd", value);
  }
  const s = String(value || "").trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // Day-first dates like 14/03/26 or 14-03-2026 (the Money Manager Android export
  // uses DD/MM); fall back to month-first only when the day position can't be a month.
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let [, a, b, y] = m;
    let day = Number(a);
    let month = Number(b);
    if (month > 12 && day <= 12) [day, month] = [month, day];
    if (month > 12 || day > 31) return "";
    if (y.length === 2) y = `20${y}`;
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!isNaN(d)) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return "";
}

const IMPORT_HEADER_ALIASES = {
  date: ["date", "day", "transaction date", "time", "period"],
  type: ["type", "income/expense", "income or expense", "kind", "transaction type"],
  category: ["category", "categories", "category name"],
  subcategory: ["subcategory", "sub category", "sub-category"],
  amount: ["amount", "money", "value", "total", "price", "sum"],
  note: ["note", "notes", "memo", "remark", "remarks", "detail", "details", "contents"],
  description: ["description"],
};

function mapImportRow(raw) {
  const lower = {};
  for (const [k, v] of Object.entries(raw)) lower[String(k).trim().toLowerCase()] = v;
  const pick = (field) => {
    for (const alias of IMPORT_HEADER_ALIASES[field]) {
      if (alias in lower && lower[alias] !== "") return lower[alias];
    }
    return "";
  };

  // Amounts may carry currency symbols / thousands separators ("RM1,234.50").
  const amountRaw = String(pick("amount")).replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  const amountNum = Number(amountRaw);

  let type = String(pick("type")).trim().toLowerCase();
  if (/^(income|in|credit|deposit|revenue)/.test(type)) type = "income";
  else if (/^(expense|exp|spending|out|debit|withdrawal)/.test(type)) type = "expense";
  else if (!type) type = amountNum < 0 ? "expense" : "income"; // signed-amount exports
  else type = ""; // unknown kind (e.g. transfer) -> row gets skipped server-side

  const note = [pick("note"), pick("description"), pick("subcategory")]
    .map((v) => String(v).trim())
    .filter(Boolean)
    .join(" · ");

  return {
    date: normalizeImportDate(pick("date")),
    type,
    category: String(pick("category")).trim(),
    amount: Math.abs(amountNum),
    note,
  };
}

$("#import-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const status = $("#import-status");
  status.textContent = "Importing…";
  try {
    await ensureXLSX();
    const wb = XLSX.read(await file.arrayBuffer());
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    const rows = raw.map(mapImportRow);
    const result = await api("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    status.textContent = `Imported ${result.imported} transaction(s), skipped ${result.skipped}.`;
    await reloadCategories();
    renderSettings();
    loadMonth();
  } catch (err) {
    status.textContent = "Import failed: " + err.message;
  }
});

// --- Init ---

(async function init() {
  const theme = localStorage.getItem("theme") ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(theme);
  try {
    await api("/api/recurring/process", { method: "POST" }).catch(() => {});
    state.categories = await api("/api/categories");
    await loadMonth();
  } catch (err) {
    alert("Failed to load: " + err.message);
  }
})();
