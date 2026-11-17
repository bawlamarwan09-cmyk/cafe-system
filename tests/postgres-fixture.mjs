import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { openStore } from '../lib/store.mjs';

const schema = readFileSync(new URL('../prisma/migrations/20261117000000_initial/migration.sql', import.meta.url), 'utf8');

// PostgreSQL in-process keeps fixture databases isolated without an external server.
export async function testDatabase(t) {
  const postgres = new PGlite();
  t.after(() => postgres.close());
  await postgres.exec(schema);
  return {
    $queryRawUnsafe: async (sql, ...args) => (await postgres.query(sql, args)).rows,
    $executeRawUnsafe: async (sql, ...args) => (await postgres.query(sql, args)).affectedRows,
    $transaction: callback => postgres.transaction(tx => callback({
      $queryRawUnsafe: async (sql, ...args) => (await tx.query(sql, args)).rows,
      $executeRawUnsafe: async (sql, ...args) => (await tx.query(sql, args)).affectedRows,
      $queryRaw: async (parts, scope) => (await tx.query(parts.join('$1'), [scope])).rows,
    })),
    // Fixtures also need multi-statement setup for legacy data.
    exec: sql => postgres.exec(sql),
  };
}

export async function testStore(t) {
  return openStore(await testDatabase(t));
}
