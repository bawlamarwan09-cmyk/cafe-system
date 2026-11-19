import {testStore} from './postgres-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('shared POS records the selected waiter without a PIN and keeps duplicate protection',async t=>{
 const store=await testStore(t);
 const manager=await store.session(await store.login('manager','2026'));
 const cashier=await store.session(await store.login('caisse','1234'));
 const [waiter,other]=(await store.state(manager)).employees;
 await store.action(manager,'employee-order-pin',{employee_id:waiter.id,pin:'0452'});
 await store.action(manager,'employee-order-pin',{employee_id:other.id,pin:'7843'});
 const order={key:'without-pin',payment:'cash',lines:[{id:6,qty:1}]};
 await assert.rejects(()=>store.action(cashier,'order',order),/Choisissez le serveur/);
 await assert.rejects(()=>store.action(cashier,'order',{...order,waiter_id:9999}),/introuvable/);
 // An old order-PIN lock no longer prevents a sale.
 await store.db.exec(`INSERT INTO order_pin_locks VALUES(1,${waiter.id},'2026-11-19','Caisse')`);
 const saved=await store.action(cashier,'order',{...order,waiter_id:waiter.id});
 assert.equal(saved.order.waiter_id,waiter.id);
 assert.equal(saved.order.user_name,waiter.name);
 assert.equal(saved.order.lines[0].qty,1);
 assert.equal((await store.action(cashier,'order',{...order,waiter_id:waiter.id})).id,saved.id);
 await assert.rejects(()=>store.action(cashier,'order',{...order,waiter_id:other.id}),/autre commande/);
 assert.equal((await store.state(manager)).orders.length,1);
 await assert.rejects(()=>store.action(cashier,'employee-order-pin',{employee_id:waiter.id,pin:'9999'}),/manager/);
});

test('changing an employee PIN still verifies the previous code',async t=>{
 const store=await testStore(t);
 const manager=await store.session(await store.login('manager','2026'));
 const cashier=await store.session(await store.login('caisse','1234'));
 const waiter=(await store.state(manager)).employees[0];
 await store.action(manager,'employee-order-pin',{employee_id:waiter.id,pin:'0452'});
 await assert.rejects(()=>store.action(cashier,'change-order-pin',{employee_id:waiter.id,old_pin:'0000',pin:'0453'}),/incorrect/);
 await store.action(cashier,'change-order-pin',{employee_id:waiter.id,old_pin:'0452',pin:'0453'});
});
