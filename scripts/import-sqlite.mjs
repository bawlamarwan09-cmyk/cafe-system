import { DatabaseSync } from 'node:sqlite';
import { scryptSync } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Prisma, PrismaClient } from '@prisma/client';

export async function importSQLite(source, db, pins = {}) {
  const sqlite = new DatabaseSync(source, { readOnly: true });
  try {
    sqlite.exec('BEGIN');
    const check = sqlite.prepare('PRAGMA quick_check').get();
    if (check.quick_check !== 'ok') throw new Error('Invalid SQLite database.');
    const tables = new Set(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
    const legacyBags = !sqlite.prepare('PRAGMA table_info(sacks)').all().some(field => field.name === 'weight_kg');
    const oldCoffee = new Set(legacyBags ? sqlite.prepare("SELECT id FROM inventory WHERE name='Khnchas café' AND unit='sac'").all().map(row => row.id) : []);
    const sourceCafes = sqlite.prepare('SELECT COUNT(*) AS count FROM cafes').get().count;
    if (!sourceCafes) throw new Error('The SQLite database is empty.');

    return await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(52305, 0)`;
      const counts = {};
      for (const model of Prisma.dmmf.datamodel.models) {
        const table = model.name;
        if (await tx[table].count()) throw new Error('Import requires an empty PostgreSQL database.');
        if (['sessions', 'attempts'].includes(table) || !tables.has(table)) continue;
        const rows = sqlite.prepare(`SELECT * FROM "${table}"`).iterate();
        let count = 0, maxId = 0, batch = [];
        for (const row of rows) {
          if (legacyBags && table === 'sacks') row.weight_kg = 6;
          if (table === 'inventory' && oldCoffee.has(row.id)) {
            row.quantity *= 6;
            row.threshold *= 6;
            row.cost = Math.round(row.cost / 6);
          }
          if (['stock_moves','movements'].includes(table) && oldCoffee.has(row.inventory_id) && row.quantity != null) {
            row.quantity *= 6;
          }
          if (table === 'users' && Object.hasOwn(pins, row.username)) {
            row.pin = scryptSync(pins[row.username], 'monalisa-local-v1', 64).toString('hex');
          }
          const data = {};
          for (const field of model.fields) {
            const value = row[field.name];
            if (value !== undefined) data[field.name] = field.type === 'BigInt' && value !== null ? BigInt(value) : value;
          }
          batch.push(data);
          maxId = Math.max(maxId, row.id ?? 0);
          count++;
          if (batch.length === 250) {
            await tx[table].createMany({ data: batch });
            batch = [];
          }
        }
        if (batch.length) await tx[table].createMany({ data: batch });
        if (maxId) {
          await tx.$queryRaw`SELECT setval(pg_get_serial_sequence(${table}, 'id'), ${maxId}) AS value`;
        }
        counts[table] = count;
      }
      return counts;
    }, { timeout: 300_000 });
  } finally {
    sqlite.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = process.argv[2];
  const manager = process.env.MONALISA_MANAGER_PIN;
  const cashier = process.env.MONALISA_CASHIER_PIN;
  if (!source || !/^\d{8,12}$/.test(manager || '') || !/^\d{8,12}$/.test(cashier || '') || manager === cashier) {
    throw new Error('Provide a SQLite backup and two different production PINs (8 to 12 digits).');
  }
  const db = new PrismaClient();
  try {
    console.table(await importSQLite(source, db, { manager, caisse: cashier }));
  } finally {
    await db.$disconnect();
  }
}
