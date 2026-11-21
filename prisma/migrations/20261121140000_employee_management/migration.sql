ALTER TABLE employees ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE employees ADD COLUMN user_id INTEGER;
CREATE UNIQUE INDEX employees_user_id_key ON employees(user_id);
-- Link legacy staff only when the name identifies exactly one employee and cashier.
UPDATE employees e SET user_id=u.id FROM users u
WHERE u.cafe_id=e.cafe_id AND u.name=e.name AND u.role='cashier'
AND (SELECT COUNT(*) FROM employees other WHERE other.cafe_id=e.cafe_id AND other.name=e.name)=1
AND (SELECT COUNT(*) FROM users other WHERE other.cafe_id=e.cafe_id AND other.name=e.name AND other.role='cashier')=1;
