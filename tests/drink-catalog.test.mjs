import {openStore} from '../lib/store.mjs';
import {testStore} from './postgres-fixture.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {drinkCatalog} from '../lib/drink-catalog.mjs';

test('catalog photos are real bundled WebP files and only selected bottled drinks use stock',async t=>{
 const store=await testStore(t);

 const manager=(await store.session((await store.login('manager','2026')))),cashier=(await store.session((await store.login('caisse','1234'))));
 let state=(await store.state(manager));
 assert.equal(state.products.length,110);
 for(const item of drinkCatalog){
  const photo=readFileSync(new URL('../public'+item.image_path,import.meta.url));
  assert.equal(photo.toString('ascii',0,4),'RIFF');assert.equal(photo.toString('ascii',8,12),'WEBP');
  const product=state.products.find(p=>p.catalog_key===item.key);assert.ok(product,item.name);assert.equal(product.image_path,item.image_path);
  assert.equal(product.equivalent,0);
  // Nescafé includes a water bottle, as required for coffee served with water.
  if(item.key==='nescafe'){
   assert.equal(product.available,true);assert.equal(product.stock_tracked,true);
   const aquafina=state.products.find(p=>p.catalog_key==='aquafina');
   assert.deepEqual(product.recipe,aquafina.recipe);continue;
  }
  if(!['coca-cola','hawai-tropical','sprite','poms','schweppes-tonic','schweppes-citron'].includes(item.key)){
   assert.equal(product.available,true);
   assert.equal(product.stock_tracked,false);
   assert.deepEqual(product.recipe,{});
   continue;
  }
  assert.equal(Object.values(product.recipe)[0],1);assert.equal(Object.keys(product.recipe).length,1);
  if(!['coca-cola','hawai-tropical'].includes(item.key)){assert.equal(product.available,false);assert.equal(state.inventory.find(i=>i.id===Number(Object.keys(product.recipe)[0])).quantity,0);}
 }
 const water=state.products.find(p=>p.catalog_key==='aquafina');
 assert.equal(water.name,'Aquafina');assert.deepEqual(water.recipe,{'2':1});
 const fanta=state.products.find(p=>p.catalog_key==='fanta-orange'),fantaStock=state.inventory.find(i=>i.name==='Fanta Orange');
 await store.action(manager,'inventory-delete',{id:fantaStock.id});
 await store.action(cashier,'order',{key:'without-stock',payment:'cash',lines:[{id:fanta.id,qty:1}]});
 const sprite=state.products.find(p=>p.catalog_key==='sprite'),inventoryId=Number(Object.keys(sprite.recipe)[0]);
 await assert.rejects(()=>store.action(cashier,'order',{key:'empty-sprite',payment:'cash',lines:[{id:sprite.id,qty:1}]}),/Stock insuffisant/);
 (await store.action(manager,'movement',{kind:'purchase',inventory_id:inventoryId,quantity:12,amount:60,payment:'cash',label:'12 Sprite'}));
 assert.equal((await store.state(cashier)).products.find(p=>p.id===sprite.id).available,true);
 const sale=(await store.action(cashier,'order',{key:'sprite',payment:'cash',lines:[{id:sprite.id,qty:2}]}));
 state=(await store.state(manager));assert.equal(state.inventory.find(i=>i.id===inventoryId).quantity,10);assert.equal(state.orders[0].total,2000);
 (await store.action(manager,'cancel',{id:sale.id,reason:'Erreur de saisie'}));assert.equal((await store.state(manager)).inventory.find(i=>i.id===inventoryId).quantity,12);
 assert.equal((await store.state(cashier)).inventory.length,0);
});

test('catalog migration preserves legacy prices, quantities and recipes, and survives renamed products',async t=>{
 let store=await testStore(t);

 (await store.db.exec("DELETE FROM products WHERE id>10;DELETE FROM inventory WHERE id>8;DELETE FROM catalog_migrations;UPDATE products SET catalog_key=NULL,image_path=NULL;UPDATE products SET name='Coca-Cola',category='Boissons',price=1300,recipe='{\"3\":1}' WHERE id=7;UPDATE inventory SET quantity=17 WHERE id=3"));
 store=await openStore(store.db);let manager=(await store.session((await store.login('manager','2026')))),state=(await store.state(manager));
 const coke=state.products.find(p=>p.id===7);assert.equal(coke.price,1300);assert.equal(coke.category,'Soda');assert.equal(coke.image_path,'/products/coca-cola.webp');assert.equal(state.inventory.find(i=>i.id===3).quantity,17);assert.deepEqual(coke.recipe,{'3':1});
 (await store.action(manager,'product',{...coke,name:'Coca maison',category:'Spécial',price:14}));
 store=await openStore(store.db);manager=(await store.session((await store.login('manager','2026'))));state=(await store.state(manager));
 assert.equal(state.products.length,110);assert.equal(state.products.find(p=>p.id===7).name,'Coca maison');assert.equal(state.products.find(p=>p.id===7).price,1400);assert.equal(state.products.find(p=>p.id===7).category,'Spécial');assert.equal(state.inventory.find(i=>i.id===3).quantity,17);
 await assert.rejects(()=>store.action(manager,'product',{...coke,price:13,image_path:'https://example.com/tracker.png'}),/Photo/);
});

test('fresh juice illustrations identify each fruit and preserve the existing orange recipe',async t=>{
 const store=await testStore(t);

 const state=(await store.state((await store.session((await store.login('manager','2026'))))));
 const juices=state.products.filter(p=>p.catalog_key?.startsWith('juice-'));
 assert.equal(juices.length,6);
 const orange=juices.find(p=>p.catalog_key==='juice-orange');assert.equal(orange.id,9);assert.deepEqual(orange.recipe,{});
 const art=new Set();
 for (const juice of juices) {
  const photo = readFileSync(new URL('../public'+juice.image_path, import.meta.url));
  if(['juice-panache','juice-banane','juice-pomme'].includes(juice.catalog_key)){
   assert.equal(photo.toString('ascii',8,12),'WEBP');
   assert.equal(photo.toString('ascii',12,16),'VP8X');
   assert.ok(photo[20]&0x10,'photo has an alpha channel');
  }else assert.deepEqual([...photo.subarray(0,3)],[255,216,255]);
  art.add(photo.toString('base64'));
  assert.equal(juice.available,true);
  assert.equal(juice.stock_tracked,false);
  assert.deepEqual(juice.recipe,{});
 }
 assert.equal(art.size,6);
});

test('untracked drinks are available without stock, while Coca-Cola and Aquafina still require stock',async t=>{
 const store=await testStore(t);

 const manager=(await store.session((await store.login('manager','2026')))),cashier=(await store.session((await store.login('caisse','1234'))));
 (await store.db.exec("UPDATE inventory SET quantity=0"));
 let state=(await store.state(cashier));const juices=state.products.filter(p=>p.category==='Boissons fraîches'&&p.stock_tracked===false);assert.equal(juices.length,26);assert.ok(juices.every(p=>p.available));assert.equal(state.coffeeReady,false);
 const before=(await store.state(manager)).inventory.map(i=>[i.id,i.quantity]);
 const sale=(await store.action(cashier,'order',{key:'free-juices',payment:'cash',lines:juices.map(p=>({id:p.id,qty:2}))}));
 state=(await store.state(manager));assert.equal(state.orders[0].total,2*juices.reduce((sum,juice)=>sum+juice.price,0));assert.equal(state.orders[0].equivalents,0);assert.equal(state.orders[0].sack_id,null);assert.equal(state.stockMoves.length,0);assert.deepEqual(state.inventory.map(i=>[i.id,i.quantity]),before);
 (await store.action(manager,'cancel',{id:sale.id,reason:'Erreur de commande'}));assert.deepEqual((await store.state(manager)).inventory.map(i=>[i.id,i.quantity]),before);
 for(const key of ['coca-cola','aquafina']){const bottled=state.products.find(p=>p.catalog_key===key);assert.equal(bottled.available,false);await assert.rejects(()=>store.action(cashier,'order',{key,payment:'cash',lines:[{id:bottled.id,qty:1}]}),/Stock insuffisant/);}
});

test('legacy juice portions leave active stock without erasing purchases or quantities',async t=>{
 let store=await testStore(t);

 let manager=(await store.session((await store.login('manager','2026'))));const juice=(await store.state(manager)).products.find(p=>p.catalog_key==='juice-avocat');
 const [{id:item}]=await store.db.$queryRawUnsafe("INSERT INTO inventory(cafe_id,name,unit,quantity,threshold,cost) VALUES(1,'Jus d’avocat (portion)','portion',0,6,500) RETURNING id");
 await store.db.$executeRawUnsafe('UPDATE products SET recipe=$1 WHERE id=$2',JSON.stringify({[item]:1}),juice.id);
 (await store.action(manager,'movement',{kind:'purchase',inventory_id:item,quantity:5,amount:25,payment:'cash',label:'Anciennes portions'}));
 store=await openStore(store.db);manager=(await store.session((await store.login('manager','2026'))));const state=(await store.state(manager));
 assert.ok(!state.inventory.some(i=>i.id===item));assert.equal(state.movements[0].amount,2500);assert.equal(state.stockMoves[0].quantity,5);assert.equal((await store.db.$queryRawUnsafe('SELECT quantity FROM inventory WHERE id=$1',item))[0].quantity,5);
 assert.equal(state.products.find(p=>p.id===juice.id).available,true);
 await assert.rejects(()=>store.action(manager,'movement',{kind:'purchase',inventory_id:item,quantity:1,amount:5,payment:'cash',label:'Retired'}),/stock actif/);
});

test('Aquafina accepts a replacement photo and keeps its stock recipe', async t => {
 const store = await testStore(t);
 const manager = await store.session(await store.login('manager', '2026'));
 const water = (await store.state(manager)).products.find(p => p.catalog_key === 'aquafina');
 const edit = { id:water.id, name:water.name, category:water.category, price:water.price / 100, equivalent:water.equivalent };
 for (const filename of ['coca-cola.webp', 'sprite.webp']) {
  const photo = readFileSync(new URL('../public/products/' + filename, import.meta.url));
  const image_path = 'data:image/webp;base64,' + photo.toString('base64');
  await store.action(manager, 'product', { ...edit, image_path });
  await store.action(manager, 'product', edit);
  const updated = (await store.state(manager)).products.find(p => p.id === water.id);
  assert.equal(updated.image_path, image_path);
  assert.deepEqual(updated.recipe, water.recipe);
 }
});
