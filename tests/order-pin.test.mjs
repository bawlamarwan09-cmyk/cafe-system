import {testStore} from './postgres-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';


test('a shared POS requires each configured waiter PIN and records the verified waiter', async t => {
 const store = await testStore(t);

 const manager = (await store.session((await store.login('manager', '2026'))));
 const cashier = (await store.session((await store.login('caisse', '1234'))));
 const waiter = (await store.state(manager)).employees[0];
 const other = (await store.state(manager)).employees[1];
 const configure = {employee_id: waiter.id, pin: '0452'};
 const order = {key:'shared-pos',payment:'cash',lines:[{id:6,qty:1}]};

 await assert.rejects(() => store.action(cashier,'employee-order-pin',configure), /manager/);
 (await store.action(manager,'employee-order-pin',configure));
 await assert.rejects(() => store.action(manager,'employee-order-pin',{employee_id:other.id,pin:'0452'}), /déjà utilisé/);
 (await store.action(manager,'employee-order-pin',{employee_id:other.id,pin:'7843'}));
 assert.deepEqual({...(await store.state(cashier)).orderWaiters.find(w=>w.id===waiter.id)},{id:waiter.id,name:waiter.name});
 await assert.rejects(() => store.action(cashier,'order',order), /PIN/);
 const before = (await store.state(manager)).inventory;
 for (let i=0;i<2;i++) {
  await assert.rejects(() => store.action(cashier,'order',{...order,waiter_id:waiter.id,waiter_pin:'7843'}), /incorrect/);
 }
 await assert.rejects(() => store.action(cashier,'order',{...order,waiter_id:waiter.id,waiter_pin:'7843'}), /bloqué/);
 await assert.rejects(() => store.action(cashier,'order',{...order,waiter_id:waiter.id,waiter_pin:'0452'}), /bloqué/);
 assert.equal((await store.state(manager)).orderPinAlerts[0].employee_id,waiter.id);
 assert.equal((await store.state(manager)).orderPinAlerts[0].terminal_user,cashier.name);
 assert.equal((await store.state(cashier)).orderPinAlerts,undefined);
 assert.equal((await store.state(cashier)).orderWaiters.find(w=>w.id===other.id).locked,undefined);
 await assert.rejects(() => store.action(cashier,'change-order-pin',{employee_id:waiter.id,old_pin:'0452',pin:'0453'}), /bloqué/);
 assert.deepEqual((await store.state(manager)).inventory,before);
 assert.equal((await store.state(manager)).orders.length,0);
 await assert.rejects(() => store.action(manager,'employee-order-pin',configure), /différent/);
 (await store.action(manager,'employee-order-pin',{...configure,pin:'0453'}));
 assert.deepEqual((await store.state(manager)).orderPinAlerts,[]);
 await assert.rejects(() => store.action(cashier,'change-order-pin',{employee_id:waiter.id,old_pin:'0452',pin:'0454'}), /incorrect/);
 (await store.action(cashier,'change-order-pin',{employee_id:waiter.id,old_pin:'0453',pin:'0454'}));
 await assert.rejects(() => store.action(cashier,'order',{...order,waiter_id:waiter.id,waiter_pin:'0453'}), /incorrect/);
 const validOrder = {...order,waiter_id:waiter.id,waiter_pin:'0454'};
 const saved = (await store.action(cashier,'order',validOrder));
 assert.equal((await store.action(cashier,'order',validOrder)).id,saved.id);
 await assert.rejects(() => store.action(cashier,'order',{...order,waiter_id:other.id,waiter_pin:'7843'}), /autre commande/);
 const orders = (await store.state(manager)).orders;
 assert.equal(orders.length,1);
 assert.equal(orders[0].waiter_id,waiter.id);
 assert.equal(orders[0].user_name,waiter.name);
});
