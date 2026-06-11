CREATE TABLE recurring (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount REAL NOT NULL CHECK (amount > 0),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  note TEXT NOT NULL DEFAULT '',
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  start_date TEXT NOT NULL,
  next_date TEXT NOT NULL,
  end_date TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE transactions ADD COLUMN recurring_id INTEGER REFERENCES recurring(id);
