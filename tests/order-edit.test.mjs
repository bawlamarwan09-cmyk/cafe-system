import {testStore} from './postgres-fixture.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';

async function setup(t){const store=await testStore(t);return {store,manager:(await store.session((await store.login('manager','2026')))),cashier:(await store.session((await store.login('caisse','1234'))))};}
test('manager edits the same ticket atomically, updates cash/stock/sack, and deletion restores exact net stock after repeated edits',async t=>{
 const {store,manager,cashier}=await setup(t);(await store.action(manager,'sack-open',{}));const before=(await store.state(manager)),initialCoffee=before.inventory.find(i=>i.id===7).quantity;
 const {id}=(await store.action(cashier,'order',{key:'original',payment:'cash',lines:[{id:1,qty:2},{id:7,qty:3}]}));
 const edit={id,revision:0,reason:'Erreur quantité',payment:'card',expected_total:2200,lines:[{id:1,qty:1},{id:2,qty:1}]};
 await assert.rejects(()=>store.action(cashier,'order-edit',edit),/manager/);await assert.rejects(()=>store.action(cashier,'cancel',{id,reason:'Erreur'}),/manager/);
 (await store.action(manager,'order-edit',edit));let s=(await store.state(manager));assert.equal(s.orders.length,1);assert.equal(s.orders[0].id,id);assert.equal(s.orders[0].revision,1);assert.equal(s.orders[0].total,2200);assert.equal(s.orders[0].user_name,cashier.name);assert.equal(s.orders[0].payment,'card');assert.equal(s.sacks[0].equivalents,1.5);assert.equal(s.inventory.find(i=>i.id===3).quantity,36);assert.equal((await store.cashExpected(1,s.today,0)),0);assert.equal(s.orders[0].changes[0].reason,'Erreur quantité');assert.equal(s.orders[0].changes[0].user_name,manager.name);
 await assert.rejects(()=>store.action(manager,'order-edit',edit),/commande a changé/);
 (await store.action(manager,'order-edit',{...edit,revision:1,expected_total:700,payment:'cash',lines:[{id:6,qty:1}]}));s=(await store.state(manager));assert.equal(s.sacks[0].equivalents,0);assert.equal(s.inventory.find(i=>i.id===7).quantity,initialCoffee);assert.equal(s.inventory.find(i=>i.id===5).quantity,12);assert.equal(s.inventory.find(i=>i.id===2).quantity,47);assert.equal((await store.cashExpected(1,s.today,0)),700);
 await assert.rejects(()=>store.action(manager,'cancel',{id,revision:1,reason:'Stale delete'}),/commande a changé/);
 (await store.action(manager,'cancel',{id,revision:2,reason:'Commande supprimée'}));s=(await store.state(manager));assert.equal(s.orders[0].status,'cancelled');assert.equal(s.orders[0].changes.length,3);assert.equal(s.orders[0].changes[0].kind,'delete');assert.equal((await store.cashExpected(1,s.today,0)),0);for(const item of s.inventory)assert.equal(item.quantity,before.inventory.find(i=>i.id===item.id).quantity);
 await assert.rejects(()=>store.action(manager,'cancel',{id,reason:'Encore'}),/déjà annulée/);
});
test('failed edits roll back stock and orders; original line prices survive catalog changes',async t=>{
 const {store,manager}=await setup(t);const {id}=(await store.action(manager,'order',{key:'water',payment:'cash',lines:[{id:6,qty:2}]}));(await store.db.exec('UPDATE products SET price=900 WHERE id=6'));
 const before=(await store.state(manager)),edit={id,revision:0,reason:'Corriger',payment:'cash',lines:[{id:6,qty:1}],expected_total:700};
 await assert.rejects(()=>store.action(manager,'order-edit',{...edit,lines:[{id:6,qty:100}],expected_total:70000}),/Stock insuffisant/);
 await assert.rejects(()=>store.action(manager,'order-edit',{...edit,expected_total:900}),/prix ont changé/);
 await assert.rejects(()=>store.action(manager,'order-edit',{...edit,lines:[]}),/Panier vide/);
 assert.deepEqual((await store.state(manager)),before);
 (await store.action(manager,'order-edit',edit));const s=(await store.state(manager));assert.equal(s.orders[0].total,700);assert.equal(s.orders[0].lines[0].price,700);assert.equal(s.inventory.find(i=>i.id===2).quantity,47);
});
test('closed days, closed coffee sacks and other cafes cannot be edited',async t=>{
 const {store,manager}=await setup(t);(await store.action(manager,'sack-open',{}));const {id}=(await store.action(manager,'order',{key:'coffee',payment:'cash',lines:[{id:1,qty:1}]}));const edit={id,revision:0,reason:'Erreur',payment:'cash',lines:[{id:1,qty:2}],expected_total:2000};
 await assert.rejects(()=>store.action({...manager,cafe_id:999},'order-edit',edit),/introuvable/);
 (await store.action(manager,'sack-close',{id:(await store.state(manager)).sacks[0].id,reason:'Sac entièrement consommé'}));await assert.rejects(()=>store.action(manager,'order-edit',edit),/Khncha clôturée/);
 const water=(await store.action(manager,'order',{key:'water-closed',payment:'cash',lines:[{id:6,qty:1}]}));(await store.action(manager,'close',{opening:0,counted:17}));await assert.rejects(()=>store.action(manager,'order-edit',{...edit,id:water.id}),/journée est clôturée/);
});
