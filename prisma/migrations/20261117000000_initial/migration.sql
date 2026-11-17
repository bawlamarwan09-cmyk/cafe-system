CREATE TABLE cafes(id SERIAL PRIMARY KEY,name TEXT NOT NULL);

CREATE TABLE users(id SERIAL PRIMARY KEY,cafe_id INTEGER NOT NULL,name TEXT,username TEXT UNIQUE,pin TEXT,role TEXT);

CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id INTEGER,expires BIGINT);

CREATE TABLE attempts(key TEXT PRIMARY KEY,count INTEGER,reset BIGINT);

CREATE TABLE inventory(id SERIAL PRIMARY KEY,cafe_id INTEGER,name TEXT,unit TEXT,quantity DOUBLE PRECISION,threshold DOUBLE PRECISION,cost INTEGER, archived INTEGER NOT NULL DEFAULT 0);

CREATE TABLE products(id SERIAL PRIMARY KEY,cafe_id INTEGER,name TEXT,category TEXT,price INTEGER,equivalent DOUBLE PRECISION,recipe TEXT,active INTEGER DEFAULT 1, image_path TEXT, catalog_key TEXT);

CREATE TABLE sacks(id SERIAL PRIMARY KEY,cafe_id INTEGER,opened TEXT,closed TEXT,opened_by TEXT,closed_by TEXT,equivalents DOUBLE PRECISION DEFAULT 0,status TEXT,reason TEXT, weight_kg DOUBLE PRECISION NOT NULL DEFAULT 1, barista_id INTEGER, barista_name TEXT);

CREATE TABLE customers(id SERIAL PRIMARY KEY,cafe_id INTEGER,name TEXT,phone TEXT);

CREATE TABLE orders(id SERIAL PRIMARY KEY,cafe_id INTEGER,created TEXT,date TEXT,user_name TEXT,lines TEXT,total BIGINT,payment TEXT,customer_id INTEGER,sack_id INTEGER,equivalents DOUBLE PRECISION,status TEXT DEFAULT 'confirmed',request_key TEXT UNIQUE,cancel_reason TEXT, revision INTEGER NOT NULL DEFAULT 0, waiter_id INTEGER);

CREATE TABLE movements(id SERIAL PRIMARY KEY,cafe_id INTEGER,date TEXT,kind TEXT,category TEXT,label TEXT,amount INTEGER,payment TEXT,customer_id INTEGER,employee_id INTEGER,inventory_id INTEGER,quantity DOUBLE PRECISION,user_name TEXT,created TEXT);

CREATE TABLE stock_moves(id SERIAL PRIMARY KEY,cafe_id INTEGER,inventory_id INTEGER,quantity DOUBLE PRECISION,reason TEXT,order_id INTEGER,created TEXT);

CREATE TABLE employees(id SERIAL PRIMARY KEY,cafe_id INTEGER,name TEXT,role TEXT,wage INTEGER);

CREATE TABLE workdays(id SERIAL PRIMARY KEY,cafe_id INTEGER,employee_id INTEGER,date TEXT,wage INTEGER,UNIQUE(cafe_id,employee_id,date));

CREATE TABLE closings(id SERIAL PRIMARY KEY,cafe_id INTEGER,date TEXT,opening BIGINT,counted BIGINT,expected BIGINT,user_name TEXT,created TEXT,UNIQUE(cafe_id,date));

CREATE TABLE catalog_migrations(cafe_id INTEGER,version INTEGER,PRIMARY KEY(cafe_id,version));

CREATE TABLE order_events(id SERIAL PRIMARY KEY,cafe_id INTEGER,order_id INTEGER,kind TEXT,reason TEXT,user_name TEXT,created TEXT,before_json TEXT,after_json TEXT);

CREATE TABLE employee_order_pins(cafe_id INTEGER NOT NULL,employee_id INTEGER NOT NULL,salt TEXT NOT NULL,pin_hash TEXT NOT NULL,PRIMARY KEY(cafe_id,employee_id));

CREATE TABLE order_pin_locks(cafe_id INTEGER NOT NULL,employee_id INTEGER NOT NULL,reported_at TEXT NOT NULL,terminal_user TEXT NOT NULL,PRIMARY KEY(cafe_id,employee_id));

CREATE UNIQUE INDEX one_active_sack ON sacks(cafe_id) WHERE status='active';

CREATE UNIQUE INDEX product_catalog_key ON products(cafe_id,catalog_key) WHERE catalog_key IS NOT NULL;
