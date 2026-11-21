import { PrismaClient } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const clearedTables = ['order_events', 'stock_moves', 'orders', 'movements', 'workdays', 'closings', 'customers', 'order_pin_locks'];
const preservedTables = ['inventory', 'products', 'menu_categories', 'users', 'employees', 'employee_order_pins'];
const localDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const json = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);

export async function resetTestData(db, cafeId, { apply = false, backupDirectory = resolve('backups') } = {}) {
  if (!Number.isSafeInteger(cafeId) || cafeId <= 0) throw new Error('Un identifiant de café positif est obligatoire.');
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(52305, CAST(${cafeId} AS integer))`;
    const cafes = await tx.$queryRawUnsafe('SELECT * FROM cafes WHERE id=$1 FOR UPDATE', cafeId);
    if (cafes.length !== 1) throw new Error('Café introuvable.');
    const rows = {};
    for (const table of [...clearedTables, ...preservedTables, 'sacks']) {
      rows[table] = await tx.$queryRawUnsafe(`SELECT * FROM "${table}" WHERE cafe_id=$1`, cafeId);
    }
    const summary = Object.fromEntries(clearedTables.map(table => [table, rows[table].length]));
    summary.closed_sacks = rows.sacks.filter(s => s.status !== 'active').length;
    summary.active_sacks_reset = rows.sacks.filter(s => s.status === 'active').length;
    if (!apply) return { applied: false, cafe: cafes[0].name, cafeId, summary };

    // A failed backup aborts before any deletion. Never place backups in public/.
    await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
    const backup = join(backupDirectory, `before-reset-cafe-${cafeId}-${Date.now()}.json`);
    await writeFile(backup, json({ version: 1, created: new Date().toISOString(), cafes, ...rows }), { flag: 'wx', mode: 0o600 });
    for (const table of clearedTables) {
      await tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE cafe_id=$1`, cafeId);
    }
    await tx.$executeRawUnsafe("DELETE FROM sacks WHERE cafe_id=$1 AND status IS DISTINCT FROM 'active'", cafeId);
    // The open physical bag remains available; do not deduct another kilogram.
    await tx.$executeRawUnsafe("UPDATE sacks SET equivalents=0, opened=$2, closed=NULL, closed_by=NULL, reason=NULL WHERE cafe_id=$1 AND status='active'", cafeId, new Date().toISOString());
    await tx.$executeRawUnsafe('UPDATE cafes SET business_date=$2 WHERE id=$1', cafeId, localDate());
    for (const table of preservedTables) {
      const after = await tx.$queryRawUnsafe(`SELECT * FROM "${table}" WHERE cafe_id=$1`, cafeId);
      const stable = data => json(data.map(row => json(row)).sort());
      if (stable(after) !== stable(rows[table])) throw new Error(`Données protégées modifiées : ${table}. Annulation.`);
    }
    return { applied: true, cafe: cafes[0].name, cafeId, backup, summary };
  }, { timeout: 60_000 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const db = new PrismaClient();
  try {
    const cafeArg = process.argv.find(arg => arg.startsWith('--cafe='));
    const cafes = cafeArg ? [] : await db.$queryRawUnsafe('SELECT id,name FROM cafes ORDER BY id');
    if (!cafeArg && cafes.length !== 1) throw new Error('Plusieurs cafés ou aucun café : précisez --cafe=ID. ' + json(cafes));
    const cafeId = cafeArg ? Number(cafeArg.slice(7)) : cafes[0].id;
    console.log(json(await resetTestData(db, cafeId, { apply: process.argv.includes('--apply') })));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
