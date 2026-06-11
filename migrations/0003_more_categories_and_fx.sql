-- Extra default categories (skipped if a same-name category of that type already exists)

INSERT INTO categories (name, type, icon, color)
SELECT 'Groceries', 'expense', '🛒', '#8bc34a'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Groceries' AND type = 'expense');

INSERT INTO categories (name, type, icon, color)
SELECT 'Home', 'expense', '🏠', '#795548'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Home' AND type = 'expense');

INSERT INTO categories (name, type, icon, color)
SELECT 'Car', 'expense', '🚗', '#607d8b'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Car' AND type = 'expense');

INSERT INTO categories (name, type, icon, color)
SELECT 'Clothing', 'expense', '👕', '#ba68c8'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Clothing' AND type = 'expense');

INSERT INTO categories (name, type, icon, color)
SELECT 'Insurance', 'expense', '🛡️', '#455a64'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Insurance' AND type = 'expense');

INSERT INTO categories (name, type, icon, color)
SELECT 'Tax', 'expense', '📋', '#ff8a65'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Tax' AND type = 'expense');

INSERT INTO categories (name, type, icon, color)
SELECT 'Phone', 'expense', '📱', '#29b6f6'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Phone' AND type = 'expense');

INSERT INTO categories (name, type, icon, color)
SELECT 'Sport', 'expense', '🏋️', '#ff7043'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Sport' AND type = 'expense');

INSERT INTO categories (name, type, icon, color)
SELECT 'Baby', 'expense', '👶', '#f06292'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Baby' AND type = 'expense');

INSERT INTO categories (name, type, icon, color)
SELECT 'Pet', 'expense', '🐶', '#a1887f'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Pet' AND type = 'expense');

INSERT INTO categories (name, type, icon, color)
SELECT 'Travel', 'expense', '✈️', '#7e57c2'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Travel' AND type = 'expense');

INSERT INTO categories (name, type, icon, color)
SELECT 'Beauty', 'expense', '💇', '#e91e63'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Beauty' AND type = 'expense');

INSERT INTO categories (name, type, icon, color)
SELECT 'Coffee', 'expense', '☕', '#6d4c41'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Coffee' AND type = 'expense');

INSERT INTO categories (name, type, icon, color)
SELECT 'Social', 'expense', '🍺', '#fb8c00'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Social' AND type = 'expense');

INSERT INTO categories (name, type, icon, color)
SELECT 'Gifts', 'expense', '🎀', '#d81b60'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Gifts' AND type = 'expense');

INSERT INTO categories (name, type, icon, color)
SELECT 'Freelance', 'income', '💻', '#4db6ac'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Freelance' AND type = 'income');

INSERT INTO categories (name, type, icon, color)
SELECT 'Rental', 'income', '🏘️', '#7cb342'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Rental' AND type = 'income');

INSERT INTO categories (name, type, icon, color)
SELECT 'Interest', 'income', '🏦', '#00897b'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Interest' AND type = 'income');

INSERT INTO categories (name, type, icon, color)
SELECT 'Refund', 'income', '💳', '#90a4ae'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Refund' AND type = 'income');

INSERT INTO categories (name, type, icon, color)
SELECT 'Gift', 'income', '🧧', '#e53935'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Gift' AND type = 'income');



-- Original-currency capture for transactions entered while traveling

ALTER TABLE transactions ADD COLUMN orig_amount REAL;

ALTER TABLE transactions ADD COLUMN orig_currency TEXT;