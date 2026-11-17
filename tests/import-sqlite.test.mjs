import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { importSQLite } from '../scripts/import-sqlite.mjs';
import { openStore } from '../lib/store.mjs';
import { testDatabase } from './postgres-fixture.mjs';

test('SQLite import keeps historical bags and converts sealed coffee units once', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'monalisa-import-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = join(dir, 'legacy.sqlite');
  const sqlite = new DatabaseSync(source);
  sqlite.exec(`
    CREATE TABLE cafes(id INTEGER PRIMARY KEY, name TEXT);
    INSERT INTO cafes VALUES(1,'Monalisa Café');
    CREATE TABLE sacks(id INTEGER PRIMARY KEY, cafe_id INTEGER, status TEXT, equivalents REAL);
    INSERT INTO sacks VALUES(5,1,'closed',420);
    CREATE TABLE inventory(id INTEGER PRIMARY KEY,cafe_id INTEGER,name TEXT,unit TEXT,quantity REAL,threshold REAL,cost INTEGER);
    INSERT INTO inventory VALUES(1,1,'Khnchas café','sac',2,1,42000);
    CREATE TABLE employees(id INTEGER PRIMARY KEY,cafe_id INTEGER,name TEXT,role TEXT,wage INTEGER);
    INSERT INTO employees VALUES(1,1,'Bachir','Barista',19000);
    CREATE TABLE stock_moves(id INTEGER PRIMARY KEY,cafe_id INTEGER,inventory_id INTEGER,quantity REAL,reason TEXT,created TEXT);
    INSERT INTO stock_moves VALUES(4,1,1,2,'Achat','2026-10-01');
  `);
  sqlite.close();

  const db = await testDatabase(t);
  const importer = {
    $transaction: callback => db.$transaction(tx => {
      const models = Object.fromEntries(Prisma.dmmf.datamodel.models.map(({ name }) => [name, {
        count: async () => Number((await tx.$queryRawUnsafe(`SELECT COUNT(*) AS count FROM "${name}"`))[0].count),
        createMany: async ({ data }) => {
          for (const row of data) {
            const columns = Object.keys(row);
            const bindings = columns.map((_, index) => '$' + (index + 1));
            await tx.$executeRawUnsafe(
              `INSERT INTO "${name}" (${columns.join(',')}) VALUES (${bindings.join(',')})`,
              ...Object.values(row),
            );
          }
        },
      }]));
      return callback({
        ...models,
        $queryRaw: (parts, ...args) =>
          tx.$queryRawUnsafe(parts.reduce((sql, part, index) => index ? sql + '$' + index + part : part, ''), ...args),
      });
    }),
  };
  await importSQLite(source, importer);
  await assert.rejects(() => importSQLite(source, importer), /empty/);
  const store = await openStore(db);
  const manager = { id: 1, cafe_id: 1, role: 'manager', name: 'Manager' };
  const state = await store.state(manager);
  assert.equal(state.inventory[0].quantity, 12);
  assert.equal(state.inventory[0].cost, 7000);
  assert.equal(state.stockMoves[0].quantity, 12);
  assert.equal(state.sacks[0].weight_kg, 6);
  assert.equal(state.sacks[0].equivalents / state.sacks[0].weight_kg, 70);
  await store.action(manager, 'sack-open', {});
  const updated = await store.state(manager);
  assert.equal(updated.sacks[0].id, 6);
  assert.equal(updated.sacks[0].weight_kg, 1);
  assert.equal(updated.inventory[0].quantity, 11);
});
