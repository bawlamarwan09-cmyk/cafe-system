import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testStore} from './postgres-fixture.mjs';

test('receipt content persists for the café, is readable by cashiers and editable only by managers',async t=>{
 const store=await testStore(t);
 const manager=await store.session(await store.login('manager','2026'));
 const cashier=await store.session(await store.login('caisse','1234'));
 assert.deepEqual((await store.state(manager)).receiptSettings,{});
 const settings={title:'Monalisa',address:'Agadir\nCentre ville',phone:'0600000000',footer:'Merci !',showServer:false};
 await assert.rejects(()=>store.action(cashier,'receipt-settings',settings),e=>e.status===403);
 await store.action(manager,'receipt-settings',settings);
 assert.deepEqual((await store.state(cashier)).receiptSettings,settings);
 await assert.rejects(()=>store.action(manager,'receipt-settings',{...settings,footer:'a'.repeat(501)}),/trop long/);
 assert.deepEqual((await store.state(manager)).receiptSettings,settings);
 await store.db.exec("INSERT INTO cafes(id,name) VALUES(999,'Autre café')");
 assert.equal((await store.db.$queryRawUnsafe('SELECT receipt_settings FROM cafes WHERE id=999'))[0].receipt_settings,'{}');
});
