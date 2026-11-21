import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './postgres-fixture.mjs';
import {openStore} from '../lib/store.mjs';
import {actionStateSections} from '../lib/action-state.mjs';

test('scoped action refreshes match full state with fewer queries and no unrelated photo payload',async t=>{
 const raw=await testDatabase(t);let reads=0;const queries=[];
 const count=client=>({...client,$queryRawUnsafe:(...args)=>{reads++;queries.push(args[0]);return client.$queryRawUnsafe(...args);}});
 const db={...count(raw),$transaction:callback=>raw.$transaction(client=>callback(count(client)))};
 const store=await openStore(db);
 const manager=await store.session(await store.login('manager','2026'));
 const cashier=await store.session(await store.login('caisse','1234'));
 await db.$executeRawUnsafe('UPDATE products SET image_path=$1 WHERE id=1','data:image/png;base64,'+'A'.repeat(200000));
 reads=0;const full=await store.state(manager);const fullReads=reads;
 for(const type of ['employee','employee-edit','employee-delete','employee-order-pin','change-order-pin','workday','account','receipt-settings','category','category-delete','product','product-delete','inventory','inventory-delete','sack-open','sack-close','sack-assign','purchase-edit','purchase-delete','close','cancel','order-edit','movement']){
  const sections=actionStateSections(type,{kind:'purchase'});assert.ok(sections,type);
  const patch=await store.state(manager,full.today,sections);
  for(const key of Object.keys(patch))assert.deepEqual(patch[key],full[key],type+':'+key);
  assert.deepEqual(Object.keys(patch).sort(),['user','today','calendarToday',...sections].sort(),type);
 }
 reads=0;const employeePatch=await store.state(manager,full.today,actionStateSections('employee-edit'));const employeeReads=reads;
 reads=0;await store.state(manager,full.today,actionStateSections('workday'));const workdayReads=reads;
 const fullBytes=Buffer.byteLength(JSON.stringify(full)),patchBytes=Buffer.byteLength(JSON.stringify(employeePatch));
 assert.ok(employeeReads<fullReads);assert.ok(workdayReads<employeeReads);assert.ok(patchBytes<fullBytes/10);
 const cashierFull=await store.state(cashier);
 const cashierPatch=await store.state(cashier,cashierFull.today,actionStateSections('order-edit'));
 assert.deepEqual(cashierPatch.inventory,[]);assert.deepEqual(cashierPatch.orders,cashierFull.orders);
 assert.deepEqual(cashierPatch.products,cashierFull.products);
 const basket=full.products.filter(product=>!product.equivalent&&!product.stock_tracked).slice(0,8);
 assert.equal(basket.length,8);queries.length=0;
 const saved=await store.action(manager,'order',{key:'batched-basket',payment:'cash',lines:basket.map(p=>({id:p.id,qty:1})),expected_total:basket.reduce((sum,p)=>sum+p.price,0)});
 assert.equal(saved.order.lines.length,8);
 assert.equal(queries.filter(sql=>sql.includes('FROM products WHERE cafe_id=')&&sql.includes(' id IN (')).length,1);
 reads=0;await openStore(db);const warmReads=reads;assert.ok(warmReads<15,`warmed startup used ${warmReads} reads`);
 t.diagnostic(JSON.stringify({fullReads,employeeReads,workdayReads,fullBytes,employeePatchBytes:patchBytes,warmStartupReads:warmReads}));
});
