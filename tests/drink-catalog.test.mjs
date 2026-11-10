import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../lib/store.mjs';
import {drinkCatalog} from '../lib/drink-catalog.mjs';

test('catalog photos are real bundled WebP files and drinks use one separate stock unit',t=>{
 const dir=mkdtempSync(join(tmpdir(),'monalisa-drinks-')),store=openStore(join(dir,'test.sqlite'));
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 const manager=store.session(store.login('manager','2026')),cashier=store.session(store.login('caisse','1234'));
 let state=store.state(manager);
 assert.equal(state.products.length,28);
 for(const item of drinkCatalog){
  const photo=readFileSync(new URL('../public'+item.image_path,import.meta.url));
  assert.equal(photo.toString('ascii',0,4),'RIFF');assert.equal(photo.toString('ascii',8,12),'WEBP');
  const product=state.products.find(p=>p.catalog_key===item.key);assert.ok(product,item.name);assert.equal(product.image_path,item.image_path);
  assert.equal(product.equivalent,0);assert.equal(Object.values(product.recipe)[0],1);assert.equal(Object.keys(product.recipe).length,1);
  if(!['coca-cola','hawai-tropical'].includes(item.key)){assert.equal(product.available,false);assert.equal(state.inventory.find(i=>i.id===Number(Object.keys(product.recipe)[0])).quantity,0);}
 }
 const fanta=state.products.find(p=>p.catalog_key==='fanta-orange'),inventoryId=Number(Object.keys(fanta.recipe)[0]);
 assert.throws(()=>store.action(cashier,'order',{key:'empty-fanta',payment:'cash',lines:[{id:fanta.id,qty:1}]}),/Stock insuffisant/);
 store.action(manager,'movement',{kind:'purchase',inventory_id:inventoryId,quantity:12,amount:60,payment:'cash',label:'12 Fanta'});
 assert.equal(store.state(cashier).products.find(p=>p.id===fanta.id).available,true);
 const sale=store.action(cashier,'order',{key:'fanta',payment:'cash',lines:[{id:fanta.id,qty:2}]});
 state=store.state(manager);assert.equal(state.inventory.find(i=>i.id===inventoryId).quantity,10);assert.equal(state.orders[0].total,2000);
 store.action(manager,'cancel',{id:sale.id,reason:'Erreur de saisie'});assert.equal(store.state(manager).inventory.find(i=>i.id===inventoryId).quantity,12);
 assert.equal(store.state(cashier).inventory.length,0);
});

test('catalog migration preserves legacy prices, quantities and recipes, and survives renamed products',t=>{
 const dir=mkdtempSync(join(tmpdir(),'monalisa-catalog-migration-')),path=join(dir,'test.sqlite');let store=openStore(path);
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 store.db.exec("DELETE FROM products WHERE id>10;DELETE FROM inventory WHERE id>8;DELETE FROM catalog_migrations;UPDATE products SET catalog_key=NULL,image_path=NULL;UPDATE products SET name='Coca-Cola',category='Boissons',price=1300,recipe='{\"3\":1}' WHERE id=7;UPDATE inventory SET quantity=17 WHERE id=3");
 store.close();store=openStore(path);let manager=store.session(store.login('manager','2026')),state=store.state(manager);
 const coke=state.products.find(p=>p.id===7);assert.equal(coke.price,1300);assert.equal(coke.category,'Sodas');assert.equal(coke.image_path,'/products/coca-cola.webp');assert.equal(state.inventory.find(i=>i.id===3).quantity,17);assert.deepEqual(coke.recipe,{'3':1});
 store.action(manager,'product',{...coke,name:'Coca maison',category:'Spécial',price:14});
 store.close();store=openStore(path);manager=store.session(store.login('manager','2026'));state=store.state(manager);
 assert.equal(state.products.length,28);assert.equal(state.products.find(p=>p.id===7).name,'Coca maison');assert.equal(state.products.find(p=>p.id===7).price,1400);assert.equal(state.products.find(p=>p.id===7).category,'Spécial');assert.equal(state.inventory.find(i=>i.id===3).quantity,17);
 assert.throws(()=>store.action(manager,'product',{...coke,price:13,image_path:'https://example.com/tracker.png'}),/Photo/);
});

test('fresh juice illustrations identify each fruit and preserve the existing orange recipe',t=>{
 const dir=mkdtempSync(join(tmpdir(),'monalisa-juice-')),store=openStore(join(dir,'test.sqlite'));
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 const state=store.state(store.session(store.login('manager','2026')));
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

test('fresh juice sales are always available without a sack or fruit stock, while bottled drinks remain tracked',t=>{
 const dir=mkdtempSync(join(tmpdir(),'monalisa-free-juice-')),store=openStore(join(dir,'test.sqlite'));
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 const manager=store.session(store.login('manager','2026')),cashier=store.session(store.login('caisse','1234'));
 store.db.exec("UPDATE inventory SET quantity=0");
 let state=store.state(cashier);const juices=state.products.filter(p=>p.category==='Jus');assert.equal(juices.length,6);assert.ok(juices.every(p=>p.available));assert.equal(state.coffeeReady,false);
 const before=store.state(manager).inventory.map(i=>[i.id,i.quantity]);
 const sale=store.action(cashier,'order',{key:'free-juices',payment:'cash',lines:juices.map(p=>({id:p.id,qty:2}))});
 state=store.state(manager);assert.equal(state.orders[0].total,18000);assert.equal(state.orders[0].equivalents,0);assert.equal(state.orders[0].sack_id,null);assert.equal(state.stockMoves.length,0);assert.deepEqual(state.inventory.map(i=>[i.id,i.quantity]),before);
 store.action(manager,'cancel',{id:sale.id,reason:'Erreur de commande'});assert.deepEqual(store.state(manager).inventory.map(i=>[i.id,i.quantity]),before);
 for(const key of ['coca-cola','cappy-orange']){const bottled=state.products.find(p=>p.catalog_key===key);assert.equal(bottled.available,false);assert.throws(()=>store.action(cashier,'order',{key,payment:'cash',lines:[{id:bottled.id,qty:1}]}),/Stock insuffisant/);}
});

test('legacy juice portions leave active stock without erasing purchases or quantities',t=>{
 const dir=mkdtempSync(join(tmpdir(),'monalisa-juice-archive-')),path=join(dir,'test.sqlite');let store=openStore(path);
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 let manager=store.session(store.login('manager','2026'));const juice=store.state(manager).products.find(p=>p.catalog_key==='juice-avocat');
 const item=Number(store.db.prepare("INSERT INTO inventory(cafe_id,name,unit,quantity,threshold,cost) VALUES(1,'Jus d’avocat (portion)','portion',0,6,500)").run().lastInsertRowid);
 store.db.prepare('UPDATE products SET recipe=? WHERE id=?').run(JSON.stringify({[item]:1}),juice.id);
 store.action(manager,'movement',{kind:'purchase',inventory_id:item,quantity:5,amount:25,payment:'cash',label:'Anciennes portions'});
 store.close();store=openStore(path);manager=store.session(store.login('manager','2026'));const state=store.state(manager);
 assert.ok(!state.inventory.some(i=>i.id===item));assert.equal(state.movements[0].amount,2500);assert.equal(state.stockMoves[0].quantity,5);assert.equal(store.db.prepare('SELECT quantity FROM inventory WHERE id=?').get(item).quantity,5);
 assert.equal(state.products.find(p=>p.id===juice.id).available,true);
 assert.throws(()=>store.action(manager,'movement',{kind:'purchase',inventory_id:item,quantity:1,amount:5,payment:'cash',label:'Retired'}),/stock actif/);
});
