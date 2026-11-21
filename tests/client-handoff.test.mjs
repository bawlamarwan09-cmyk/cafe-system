import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testDatabase } from './postgres-fixture.mjs';
import { resetTestData } from '../scripts/reset-test-data.mjs';
import { orderMenuProducts } from '../lib/menu-order.mjs';

test('double espresso goes last without changing other menu order or input', () => {
  const products = [{name:'Café noir'}, {name:'Café double'}, {name:'Thé'}, {name:'Double Nespresso'}];
  assert.deepEqual(orderMenuProducts(products).map(p=>p.name), ['Café noir','Thé','Double Nespresso','Café double']);
  assert.equal(products[1].name, 'Café double');
  for (const name of ['Double espresso','Double expresso']) assert.equal(orderMenuProducts([{name},{name:'Lipton'}]).at(-1).name, name);
});

test('handoff clears only selected cafe activity after backup and preserves stock, menu, staff and open bag', async t => {
  const db = await testDatabase(t);
  const dir = await mkdtemp(join(tmpdir(), 'monalisa-handoff-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  await db.exec(`
    INSERT INTO cafes(id,name,business_date) VALUES (1,'Monalisa','2026-01-01'),(2,'Other','2026-01-02');
    INSERT INTO inventory(id,cafe_id,name,quantity) VALUES (1,1,'Café',23);
    INSERT INTO products(id,cafe_id,name,price) VALUES (1,1,'Café double',1900);
    INSERT INTO menu_categories(cafe_id,name) VALUES (1,'Boissons chaudes');
    INSERT INTO users(id,cafe_id,name) VALUES (1,1,'Manager');
    INSERT INTO employees(id,cafe_id,name) VALUES (1,1,'Barman');
    INSERT INTO sacks(id,cafe_id,status,equivalents) VALUES (1,1,'active',7),(2,1,'closed',65),(3,2,'closed',70);
    INSERT INTO orders(cafe_id,total) VALUES (1,1900),(2,1100);
    INSERT INTO movements(cafe_id,kind,amount) VALUES (1,'purchase',160000),(2,'expense',100);
    INSERT INTO stock_moves(cafe_id,inventory_id,quantity) VALUES (1,1,-1);
    INSERT INTO closings(cafe_id,date) VALUES (1,'2026-01-01');
    INSERT INTO customers(cafe_id,name) VALUES (1,'Test');
    INSERT INTO workdays(cafe_id,employee_id,date) VALUES (1,1,'2026-01-01');
    INSERT INTO order_events(cafe_id,kind) VALUES (1,'edit');
    INSERT INTO order_pin_locks(cafe_id,employee_id,reported_at,terminal_user) VALUES (1,1,'now','Test');
  `);
  const before = await db.$queryRawUnsafe('SELECT * FROM inventory');
  const preview = await resetTestData(db,1);
  assert.equal(preview.applied,false);
  assert.equal((await db.$queryRawUnsafe('SELECT * FROM orders')).length,2);
  await assert.rejects(resetTestData(db,1,{apply:true,backupDirectory:'/dev/null/impossible'}));
  assert.equal((await db.$queryRawUnsafe('SELECT * FROM orders')).length,2);
  const result = await resetTestData(db,1,{apply:true,backupDirectory:dir});
  const backup = JSON.parse(await readFile(result.backup,'utf8'));
  assert.equal(backup.orders.length,1);
  assert.equal(backup.sacks.length,2);
  assert.equal(backup.movements[0].amount,160000);
  for (const table of ['orders','movements','stock_moves','closings','customers','workdays','order_events','order_pin_locks']) {
    assert.equal((await db.$queryRawUnsafe(`SELECT * FROM ${table} WHERE cafe_id=1`)).length,0);
  }
  assert.deepEqual(await db.$queryRawUnsafe('SELECT * FROM inventory'),before);
  for (const table of ['products','menu_categories','users','employees']) assert.equal((await db.$queryRawUnsafe(`SELECT * FROM ${table} WHERE cafe_id=1`)).length,1);
  const sacks = await db.$queryRawUnsafe('SELECT * FROM sacks WHERE cafe_id=1');
  assert.equal(sacks.length,1); assert.equal(sacks[0].status,'active'); assert.equal(sacks[0].equivalents,0);
  assert.equal((await db.$queryRawUnsafe('SELECT * FROM orders WHERE cafe_id=2')).length,1);
  assert.equal((await db.$queryRawUnsafe('SELECT * FROM sacks WHERE cafe_id=2')).length,1);
  assert.notEqual((await db.$queryRawUnsafe('SELECT business_date FROM cafes WHERE id=1'))[0].business_date,'2026-01-01');
});
