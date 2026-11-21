CREATE INDEX IF NOT EXISTS "orders_cafe_id_id_idx" ON "orders" ("cafe_id", "id");
CREATE INDEX IF NOT EXISTS "orders_cafe_id_date_status_idx" ON "orders" ("cafe_id", "date", "status");
CREATE INDEX IF NOT EXISTS "movements_cafe_id_date_kind_idx" ON "movements" ("cafe_id", "date", "kind");
CREATE INDEX IF NOT EXISTS "stock_moves_cafe_id_id_idx" ON "stock_moves" ("cafe_id", "id");
CREATE INDEX IF NOT EXISTS "order_events_cafe_id_id_idx" ON "order_events" ("cafe_id", "id");
CREATE INDEX IF NOT EXISTS "sacks_cafe_id_status_idx" ON "sacks" ("cafe_id", "status");
CREATE INDEX IF NOT EXISTS "products_cafe_id_catalog_key_idx" ON "products" ("cafe_id", "catalog_key");
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "sessions_expires_idx" ON "sessions" ("expires");
