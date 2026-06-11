CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  icon TEXT NOT NULL DEFAULT '📦',
  color TEXT NOT NULL DEFAULT '#9e9e9e'
);

CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount REAL NOT NULL CHECK (amount > 0),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  note TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_transactions_date ON transactions (date);
CREATE INDEX idx_transactions_category ON transactions (category_id);

CREATE TABLE budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  month TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  UNIQUE (category_id, month)
);

INSERT INTO categories (name, type, icon, color) VALUES
  ('Food', 'expense', '🍔', '#ef5350'),
  ('Transport', 'expense', '🚌', '#42a5f5'),
  ('Shopping', 'expense', '🛍️', '#ab47bc'),
  ('Bills', 'expense', '🧾', '#ffa726'),
  ('Health', 'expense', '💊', '#26a69a'),
  ('Entertainment', 'expense', '🎬', '#ec407a'),
  ('Education', 'expense', '📚', '#5c6bc0'),
  ('Other', 'expense', '📦', '#78909c'),
  ('Salary', 'income', '💼', '#66bb6a'),
  ('Bonus', 'income', '🎁', '#9ccc65'),
  ('Investment', 'income', '📈', '#26c6da'),
  ('Other', 'income', '💰', '#8d6e63');
