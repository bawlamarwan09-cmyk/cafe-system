CREATE TABLE menu_categories (
 id SERIAL PRIMARY KEY,
 cafe_id INTEGER NOT NULL,
 name TEXT NOT NULL,
 UNIQUE(cafe_id, name)
);
