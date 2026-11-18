import {testStore} from './postgres-fixture.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {today,openStore} from '../lib/store.mjs';

async function setup(t){const store=await testStore(t);const manager=(await store.session((await store.login('manager','2026'))));const cashier=(await store.session((await store.login('caisse','1234'))));return {store,manager,cashier};}
test('price changes after the confirmation preview cannot save a different total silently',async t=>{const {store,manager}=await setup(t);const before=(await store.state(manager)).inventory.find(i=>i.id===2).quantity;await assert.rejects(()=>store.action(manager,'order',{key:'review-price',payment:'cash',expected_total:700,lines:[{id:6,qty:2}]}),/prix ont changé/);assert.equal((await store.state(manager)).orders.length,0);assert.equal((await store.state(manager)).inventory.find(i=>i.id===2).quantity,before);(await store.action(manager,'order',{key:'review-price',payment:'cash',expected_total:1400,lines:[{id:6,qty:2}]}));assert.equal((await store.state(manager)).orders.length,1);});
test('manager can assign an unassigned active legacy sack without moving stock or sales',async t=>{const {store,manager,cashier}=await setup(t);(await store.db.exec("INSERT INTO sacks(cafe_id,opened,opened_by,status,weight_kg,equivalents) VALUES(1,'2026-11-01','Manager','active',6,70)"));const stock=(await store.state(manager)).inventory[0].quantity;await assert.rejects(()=>store.action(cashier,'sack-assign',{id:1,barista_id:1}),/manager/);(await store.action(manager,'sack-assign',{id:1,barista_id:1}));const sack=(await store.state(manager)).sacks[0];assert.equal(sack.barista_name,'Bachir');assert.equal(sack.weight_kg,6);assert.equal(sack.equivalents,70);assert.equal((await store.state(manager)).inventory[0].quantity,stock);await assert.rejects(()=>store.action(manager,'sack-assign',{id:1,barista_id:2}),/sans barman/);});
test('sacks record the responsible barman separately from the manager opening them',async t=>{const {store,manager}=await setup(t);(await store.action(manager,'sack-open',{barista_id:1}));let s=(await store.state(manager));assert.equal(s.sacks[0].opened_by,manager.name);assert.equal(s.sacks[0].barista_name,'Bachir');assert.equal(s.sacks[0].barista_id,1);(await store.db.exec("UPDATE employees SET name='Bachir modifié' WHERE id=1"));assert.equal((await store.state(manager)).sacks[0].barista_name,'Bachir');(await store.action(manager,'sack-close',{id:s.sacks[0].id,reason:'Remplacement exceptionnel'}));const before=(await store.state(manager)).inventory[0].quantity;await assert.rejects(()=>store.action(manager,'sack-open',{barista_id:999}),/introuvable/);assert.equal((await store.state(manager)).inventory[0].quantity,before);});
test('packs contain six separate 1kg bags; opening uses one bag and 65 equivalents completes its target',async t=>{const {store,manager}=await setup(t);const initial=(await store.state(manager)).inventory[0].quantity;(await store.action(manager,'movement',{kind:'purchase',inventory_id:1,purchase_unit:'pack6',quantity:2,amount:840,payment:'cash',label:'2 lots de café'}));let s=(await store.state(manager));assert.equal(s.inventory[0].quantity,initial+12);assert.equal(s.inventory[0].cost,7000);assert.equal(s.movements[0].quantity,12);assert.equal(s.movements[0].amount,84000);await assert.rejects(()=>store.action(manager,'movement',{kind:'purchase',inventory_id:2,purchase_unit:'pack6',quantity:1,amount:10,payment:'cash',label:'Erreur article'}),/réservé/);await assert.rejects(()=>store.action(manager,'movement',{kind:'purchase',inventory_id:1,purchase_unit:'pack6',quantity:0.5,amount:210,payment:'cash',label:'Demi lot'}),/entier/);(await store.action(manager,'sack-open',{}));s=(await store.state(manager));assert.equal(s.inventory[0].quantity,initial+11);assert.equal(s.sacks[0].weight_kg,1);(await store.action(manager,'order',{key:'65-coffees',payment:'cash',lines:[{id:1,qty:65}]}));(await store.action(manager,'sack-close',{id:s.sacks[0].id,reason:'Sac entièrement consommé'}));s=(await store.state(manager));assert.equal(s.sacks[0].equivalents/s.sacks[0].weight_kg,65);});
test('cashier dashboard excludes manager details but preserves operational daily figures',async t=>{const {store,manager,cashier}=await setup(t);(await store.action(manager,'sack-open',{}));(await store.action(manager,'movement',{kind:'expense',label:'Nettoyage',amount:20,payment:'cash'}));(await store.action(manager,'movement',{kind:'expense',label:'Historique privé',amount:75,payment:'cash',date:'2025-01-01'}));const data=(await store.state(cashier));assert.equal(data.coffeeReady,true);for(const key of ['inventory','sacks','stockMoves','employees','workdays','closings','accounts'])assert.deepEqual(data[key],[]);assert.ok(data.products.every(p=>!('recipe' in p)&&!('equivalent' in p)));assert.equal(data.movements.length,1);assert.equal(data.movements[0].amount,2000);assert.equal(data.movements[0].date,today());assert.ok(!('label' in data.movements[0]));const historical=(await store.state(cashier,'2025-01-01'));assert.equal(historical.movements.length,1);assert.equal(historical.movements[0].amount,7500);const full=(await store.state(manager));assert.ok(full.inventory.length);assert.ok(full.sacks.length);assert.equal(full.movements.length,2);(await store.action(cashier,'order',{key:'cashier-still-works',payment:'cash',lines:[{id:1,qty:1}]}));assert.equal((await store.state(cashier)).orders.length,1);});
test('coffee orders require a sack; normal + milk = 1.5 equivalents; retry never duplicates; cancellation restores stock',async t=>{const {store,manager,cashier}=await setup(t);const before=(await store.state(manager));await assert.rejects(()=>store.action(cashier,'order',{key:'a',payment:'cash',lines:[{id:1,qty:1}]}),/ouvrir une khncha/);(await store.action(manager,'sack-open',{}));const body={key:'a',payment:'cash',lines:[{id:1,qty:1},{id:2,qty:1}]};const first=(await store.action(cashier,'order',body));assert.deepEqual((await store.action(cashier,'order',body)),first);let state=(await store.state(manager));assert.equal(state.orders.length,1);assert.equal(state.orders[0].total,2200);assert.equal(state.sacks[0].equivalents,1.5);assert.equal(state.inventory[0].quantity,before.inventory[0].quantity-1);assert.equal(state.inventory.find(i=>i.id===5).quantity,12);(await store.action(manager,'cancel',{id:first.id,reason:'Erreur de saisie, non préparé'}));state=(await store.state(manager));assert.equal(state.sacks[0].equivalents,0);assert.equal(state.inventory.find(i=>i.id===5).quantity,12);assert.equal((await store.cashExpected(1,today(),0)),0);await assert.rejects(()=>store.action(manager,'cancel',{id:first.id,reason:'Encore'}),/déjà annulée/);});
test('credit orders, debt repayments and customer creation are disabled',async t=>{const {store,manager,cashier}=await setup(t);await assert.rejects(()=>store.action(cashier,'order',{key:'credit-disabled',payment:'credit',lines:[{id:6,qty:1}]}),/Mode de paiement invalide/);await assert.rejects(()=>store.action(manager,'customer',{name:'Amine'}),/désactivé/);await assert.rejects(()=>store.action(manager,'movement',{kind:'repayment',amount:10,payment:'cash',label:'Ancien crédit'}),/Type invalide/);assert.equal((await store.state(manager)).orders.length,0);assert.equal((await store.state(manager)).movements.length,0);});
test('transaction rollback prevents partial sales; stock cannot go below zero',async t=>{const {store,manager}=await setup(t);const state=(await store.state(manager));await assert.rejects(()=>store.action(manager,'order',{key:'stock',payment:'cash',lines:[{id:6,qty:50}]}),/Stock insuffisant/);assert.equal((await store.state(manager)).orders.length,0);assert.equal((await store.state(manager)).inventory[1].quantity,state.inventory[1].quantity);});
test('purchases update base units and cash once; salary advances affect cash once; closing locks day',async t=>{const {store,manager}=await setup(t);(await store.action(manager,'movement',{kind:'purchase',label:'Carton 24 bouteilles',amount:60,payment:'cash',inventory_id:2,quantity:24}));(await store.action(manager,'movement',{kind:'advance',label:'Avance Bachir',amount:50,payment:'cash',employee_id:1}));assert.equal((await store.state(manager)).inventory[1].quantity,72);assert.equal((await store.cashExpected(1,today(),20000)),9000);(await store.action(manager,'close',{opening:200,counted:90}));assert.equal((await store.state(manager)).closings[0].expected,9000);await assert.rejects(()=>store.action(manager,'order',{key:'after-close',payment:'cash',lines:[{id:6,qty:1}]}),/clôturée/);await assert.rejects(()=>store.action(manager,'movement',{kind:'expense',label:'Après',amount:1,payment:'cash'}),/clôturée/);});
test('manager actions and café isolation are enforced on the server',async t=>{const {store,manager,cashier}=await setup(t);await assert.rejects(()=>store.action(cashier,'sack-open',{}),/manager/);await assert.rejects(()=>store.action(cashier,'movement',{kind:'expense',amount:1,label:'Non',payment:'cash'}),/manager/);(await store.db.exec("INSERT INTO cafes VALUES(2,'Autre café');INSERT INTO products(id,cafe_id,name,category,price,equivalent,recipe) VALUES(9999,2,'Privé','Boissons',100,0,'{}')"));assert.ok(!(await store.state(manager)).products.find(p=>p.id===9999));await assert.rejects(()=>store.action(manager,'order',{key:'tenant',payment:'cash',lines:[{id:9999,qty:1}]}),/introuvable/);});
test('closed partial sacks do not permit coffee corrections; completed sacks keep final totals',async t=>{const {store,manager}=await setup(t);(await store.action(manager,'sack-open',{}));(await store.action(manager,'order',{key:'end',payment:'cash',lines:[{id:1,qty:1}]}));(await store.action(manager,'sack-close',{id:1,reason:'Clôture anticipée / reste de café'}));assert.equal((await store.state(manager)).sacks[0].equivalents,1);await assert.rejects(()=>store.action(manager,'cancel',{id:1,reason:'Après clôture'}),/Khncha clôturée/);});

test('manager can change login codes and revoke sessions for self and cashiers', async t => {
 const store = await testStore(t);
 const managerToken = await store.login('manager', '2026');
 const cashierToken = await store.login('caisse', '1234');
 const manager = await store.session(managerToken), cashier = await store.session(cashierToken);
 const reset = {account_id:cashier.id,current_pin:'2026',pin:'87264915',confirm_pin:'87264915'};
 await assert.rejects(() => store.action(cashier,'account-pin',reset), error => error.status===403);
 await assert.rejects(() => store.action(manager,'account-pin',{...reset,current_pin:'0000'}), error => error.status===403);
 assert.ok(await store.session(cashierToken));
 await store.action(manager,'account-pin',reset);
 assert.equal(await store.session(cashierToken),undefined);
 assert.ok(await store.session(managerToken));
 await assert.rejects(() => store.login('caisse','1234'), error => error.status===401);
 assert.ok(await store.session(await store.login('caisse',reset.pin)));

 await store.action(manager,'account-pin',{...reset,account_id:manager.id});
 assert.equal(await store.session(managerToken),undefined);
 await assert.rejects(() => store.login('manager','2026'), error => error.status===401);
 assert.ok(await store.session(await store.login('manager',reset.pin)));
});

test('coffee without water uses its own price and still counts toward the active sack',async t=>{
 const {store,manager}=await setup(t);
 await store.action(manager,'sack-open',{});
 const {products}=await store.state(manager);
 const regular=products.find(product=>product.name==='Café noir');
 const withoutWater=products.find(product=>product.name==='Café sans eau');
 assert.equal(withoutWater.price,800);
 assert.equal(withoutWater.equivalent,regular.equivalent);
 await store.action(manager,'order',{key:'water-options',payment:'cash',lines:[
  {id:regular.id,qty:1},{id:withoutWater.id,qty:1},
 ]});
 const state=await store.state(manager);
 assert.equal(state.orders[0].total,regular.price+800);
 assert.equal(state.sacks[0].equivalents,regular.equivalent*2);
});

test('manager renames and deletes categories with product transfer and persists removal', async t => {
 const {store,manager,cashier}=await setup(t);
 let state=await store.state(manager);
 const source=state.categories.find(category=>category.name==='Boissons chaudes');
 const target=state.categories.find(category=>category.name==='Boissons fraîches');
 const productIds=state.products.filter(product=>product.category===source.name).map(product=>product.id);
 await assert.rejects(()=>store.action(cashier,'category',{id:source.id,name:'Privé'}),error=>error.status===403);
 await store.action(manager,'category',{id:source.id,name:'Chaud'});
 state=await store.state(manager);
 assert.ok(state.products.filter(product=>productIds.includes(product.id)).every(product=>product.category==='Chaud'));
 await assert.rejects(()=>store.action(manager,'category-delete',{id:source.id}));
 await store.action(manager,'category-delete',{id:source.id,target_id:target.id});
 state=await store.state(manager);
 assert.ok(!state.categories.some(category=>category.id===source.id));
 assert.ok(state.products.filter(product=>productIds.includes(product.id)).every(product=>product.category===target.name));
 const reopened=await openStore(store.db);
 assert.ok(!(await reopened.state(manager)).categories.some(category=>category.id===source.id));
});
