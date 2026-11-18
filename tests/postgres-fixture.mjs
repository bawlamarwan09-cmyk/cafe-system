import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { openStore } from '../lib/store.mjs';

const migrations = new URL('../prisma/migrations/', import.meta.url);
const schema = readdirSync(migrations, {withFileTypes:true}).filter(entry=>entry.isDirectory())
 .map(entry=>entry.name).sort().map(name=>readFileSync(new URL(name+'/migration.sql',migrations),'utf8')).join('\n');

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
