import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../lib/store.mjs';
function setup(t){const dir=mkdtempSync(join(tmpdir(),'monalisa-order-edit-')),store=openStore(join(dir,'test.sqlite'));t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return {store,manager:store.session(store.login('manager','2026')),cashier:store.session(store.login('caisse','1234'))};}
test('manager edits the same ticket atomically, updates cash/stock/sack, and deletion restores exact net stock after repeated edits',t=>{
 const {store,manager,cashier}=setup(t);store.action(manager,'sack-open',{});const before=store.state(manager),initialCoffee=before.inventory.find(i=>i.id===7).quantity;
 const {id}=store.action(cashier,'order',{key:'original',payment:'cash',lines:[{id:1,qty:2},{id:7,qty:3}]});
 const edit={id,revision:0,reason:'Erreur quantité',payment:'card',expected_total:2200,lines:[{id:1,qty:1},{id:2,qty:1}]};
 assert.throws(()=>store.action(cashier,'order-edit',edit),/manager/);assert.throws(()=>store.action(cashier,'cancel',{id,reason:'Erreur'}),/manager/);
 store.action(manager,'order-edit',edit);let s=store.state(manager);assert.equal(s.orders.length,1);assert.equal(s.orders[0].id,id);assert.equal(s.orders[0].revision,1);assert.equal(s.orders[0].total,2200);assert.equal(s.orders[0].user_name,cashier.name);assert.equal(s.orders[0].payment,'card');assert.equal(s.sacks[0].equivalents,1.5);assert.equal(s.inventory.find(i=>i.id===3).quantity,36);assert.equal(store.cashExpected(1,s.today,0),0);assert.equal(s.orders[0].changes[0].reason,'Erreur quantité');assert.equal(s.orders[0].changes[0].user_name,manager.name);
 assert.throws(()=>store.action(manager,'order-edit',edit),/commande a changé/);
 store.action(manager,'order-edit',{...edit,revision:1,expected_total:700,payment:'cash',lines:[{id:6,qty:1}]});s=store.state(manager);assert.equal(s.sacks[0].equivalents,0);assert.equal(s.inventory.find(i=>i.id===7).quantity,initialCoffee);assert.equal(s.inventory.find(i=>i.id===5).quantity,12);assert.equal(s.inventory.find(i=>i.id===2).quantity,47);assert.equal(store.cashExpected(1,s.today,0),700);
 assert.throws(()=>store.action(manager,'cancel',{id,revision:1,reason:'Stale delete'}),/commande a changé/);
 store.action(manager,'cancel',{id,revision:2,reason:'Commande supprimée'});s=store.state(manager);assert.equal(s.orders[0].status,'cancelled');assert.equal(s.orders[0].changes.length,3);assert.equal(s.orders[0].changes[0].kind,'delete');assert.equal(store.cashExpected(1,s.today,0),0);for(const item of s.inventory)assert.equal(item.quantity,before.inventory.find(i=>i.id===item.id).quantity);
 assert.throws(()=>store.action(manager,'cancel',{id,reason:'Encore'}),/déjà annulée/);
});
test('failed edits roll back stock and orders; original line prices survive catalog changes',t=>{
 const {store,manager}=setup(t);const {id}=store.action(manager,'order',{key:'water',payment:'cash',lines:[{id:6,qty:2}]});store.db.exec('UPDATE products SET price=900 WHERE id=6');
 const before=store.state(manager),edit={id,revision:0,reason:'Corriger',payment:'cash',lines:[{id:6,qty:1}],expected_total:700};
 assert.throws(()=>store.action(manager,'order-edit',{...edit,lines:[{id:6,qty:100}],expected_total:70000}),/Stock insuffisant/);
 assert.throws(()=>store.action(manager,'order-edit',{...edit,expected_total:900}),/prix ont changé/);
 assert.throws(()=>store.action(manager,'order-edit',{...edit,lines:[]}),/Panier vide/);
 assert.deepEqual(store.state(manager),before);
 store.action(manager,'order-edit',edit);const s=store.state(manager);assert.equal(s.orders[0].total,700);assert.equal(s.orders[0].lines[0].price,700);assert.equal(s.inventory.find(i=>i.id===2).quantity,47);
});
test('closed days, closed coffee sacks and other cafes cannot be edited',t=>{
 const {store,manager}=setup(t);store.action(manager,'sack-open',{});const {id}=store.action(manager,'order',{key:'coffee',payment:'cash',lines:[{id:1,qty:1}]});const edit={id,revision:0,reason:'Erreur',payment:'cash',lines:[{id:1,qty:2}],expected_total:2000};
 assert.throws(()=>store.action({...manager,cafe_id:999},'order-edit',edit),/introuvable/);
 store.action(manager,'sack-close',{id:store.state(manager).sacks[0].id,reason:'Sac entièrement consommé'});assert.throws(()=>store.action(manager,'order-edit',edit),/Khncha clôturée/);
 const water=store.action(manager,'order',{key:'water-closed',payment:'cash',lines:[{id:6,qty:1}]});store.action(manager,'close',{opening:0,counted:17});assert.throws(()=>store.action(manager,'order-edit',{...edit,id:water.id}),/journée est clôturée/);
});
