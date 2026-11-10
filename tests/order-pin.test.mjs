import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../lib/store.mjs';

test('a shared POS requires each configured waiter PIN and records the verified waiter', t => {
 const store = openStore(':memory:');
 t.after(() => store.close());
 const manager = store.session(store.login('manager', '2026'));
 const cashier = store.session(store.login('caisse', '1234'));
 const waiter = store.state(manager).employees[0];
 const other = store.state(manager).employees[1];
 const configure = {employee_id: waiter.id, pin: '0452'};
 const order = {key:'shared-pos',payment:'cash',lines:[{id:6,qty:1}]};

 assert.throws(() => store.action(cashier,'employee-order-pin',configure), /manager/);
 store.action(manager,'employee-order-pin',configure);
 assert.throws(() => store.action(manager,'employee-order-pin',{employee_id:other.id,pin:'0452'}), /déjà utilisé/);
 store.action(manager,'employee-order-pin',{employee_id:other.id,pin:'7843'});
 assert.deepEqual({...store.state(cashier).orderWaiters.find(w=>w.id===waiter.id)},{id:waiter.id,name:waiter.name});
 assert.throws(() => store.action(cashier,'order',order), /PIN/);
 const before = store.state(manager).inventory;
 for (let i=0;i<2;i++) {
  assert.throws(() => store.action(cashier,'order',{...order,waiter_id:waiter.id,waiter_pin:'7843'}), /incorrect/);
 }
 assert.throws(() => store.action(cashier,'order',{...order,waiter_id:waiter.id,waiter_pin:'7843'}), /bloqué/);
 assert.throws(() => store.action(cashier,'order',{...order,waiter_id:waiter.id,waiter_pin:'0452'}), /bloqué/);
 assert.equal(store.state(manager).orderPinAlerts[0].employee_id,waiter.id);
 assert.equal(store.state(manager).orderPinAlerts[0].terminal_user,cashier.name);
 assert.equal(store.state(cashier).orderPinAlerts,undefined);
 assert.equal(store.state(cashier).orderWaiters.find(w=>w.id===other.id).locked,undefined);
 assert.throws(() => store.action(cashier,'change-order-pin',{employee_id:waiter.id,old_pin:'0452',pin:'0453'}), /bloqué/);
 assert.deepEqual(store.state(manager).inventory,before);
 assert.equal(store.state(manager).orders.length,0);
 assert.throws(() => store.action(manager,'employee-order-pin',configure), /différent/);
 store.action(manager,'employee-order-pin',{...configure,pin:'0453'});
 assert.deepEqual(store.state(manager).orderPinAlerts,[]);
 assert.throws(() => store.action(cashier,'change-order-pin',{employee_id:waiter.id,old_pin:'0452',pin:'0454'}), /incorrect/);
 store.action(cashier,'change-order-pin',{employee_id:waiter.id,old_pin:'0453',pin:'0454'});
 assert.throws(() => store.action(cashier,'order',{...order,waiter_id:waiter.id,waiter_pin:'0453'}), /incorrect/);
 const validOrder = {...order,waiter_id:waiter.id,waiter_pin:'0454'};
 const saved = store.action(cashier,'order',validOrder);
 assert.equal(store.action(cashier,'order',validOrder).id,saved.id);
 assert.throws(() => store.action(cashier,'order',{...order,waiter_id:other.id,waiter_pin:'7843'}), /autre commande/);
 const orders = store.state(manager).orders;
 assert.equal(orders.length,1);
 assert.equal(orders[0].waiter_id,waiter.id);
 assert.equal(orders[0].user_name,waiter.name);
});
