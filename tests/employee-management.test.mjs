import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testStore} from './postgres-fixture.mjs';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';

test('manager edits and removes employees, revokes linked access, and preserves ledger, sales and stock',async t=>{
 const store=await testStore(t);
 const manager=await store.session(await store.login('manager','2026'));
 const cashier=await store.session(await store.login('caisse','1234'));
 const input={name:'Youssef',role:'Serveur',wage:120,username:'youssef',pin:'82736419'};
 await store.action(manager,'employee',input);
 let state=await store.state(manager);
 const employee=state.employees.find(e=>e.name===input.name);
 assert.ok(employee.user_id);
 const token=await store.login(input.username,input.pin);
 await store.action(manager,'employee-order-pin',{employee_id:employee.id,pin:'0471'});
 await store.action(manager,'workday',{employee_id:employee.id});
 await store.action(manager,'movement',{kind:'advance',employee_id:employee.id,label:'Avance Youssef',amount:50,payment:'cash'});
 const product=state.products.find(p=>!p.equivalent && p.available);
 await store.action(cashier,'order',{key:'employee-history',payment:'cash',waiter_id:employee.id,lines:[{id:product.id,qty:1}]});
 state=await store.state(manager);
 const before={orders:state.orders,workdays:state.workdays,movements:state.movements,inventory:state.inventory};
 const edit={id:employee.id,name:'Youssef modifié',role:'Barman',wage:150};
 await assert.rejects(()=>store.action(cashier,'employee-edit',edit),e=>e.status===403);
 await assert.rejects(()=>store.action(manager,'employee-edit',{...edit,wage:-1}));
 await store.action(manager,'employee-edit',edit);
 assert.equal((await store.session(token)).name,edit.name);
 assert.equal((await store.state(manager)).employees.find(e=>e.id===employee.id).wage,15000);
 assert.equal((await store.state(manager)).workdays.find(w=>w.employee_id===employee.id).wage,12000);
 await store.db.exec("INSERT INTO cafes(id,name) VALUES (2,'Autre café');INSERT INTO employees(id,cafe_id,name,role,wage) VALUES (999,2,'Autre','Serveur',10000)");
 for(const type of ['employee-edit','employee-delete']){
  await assert.rejects(()=>store.action(manager,type,{...edit,id:999}),/introuvable/);
 }
 await assert.rejects(()=>store.action(cashier,'employee-delete',{id:employee.id}),e=>e.status===403);
 await store.action(manager,'employee-delete',{id:employee.id});
 assert.equal(await store.session(token),undefined);
 await assert.rejects(()=>store.login(input.username,input.pin),e=>e.status===401);
 state=await store.state(manager);
 assert.equal(state.employees.find(e=>e.id===employee.id).archived,1);
 assert.ok(!state.orderWaiters.some(e=>e.id===employee.id));
 assert.ok(!state.accounts.some(e=>e.id===employee.user_id));
 for(const key of Object.keys(before))assert.deepEqual(state[key],before[key],key);
 for(const type of ['employee-edit','employee-delete','workday','employee-order-pin']){
  await assert.rejects(()=>store.action(manager,type,{...edit,employee_id:employee.id,pin:'0471'}),/supprimé/);
 }
 await assert.rejects(()=>store.action(cashier,'order',{key:'removed-waiter',payment:'cash',waiter_id:employee.id,lines:[{id:product.id,qty:1}]}));
 assert.ok(await store.session(await store.login('manager','2026')));
});

test('legacy migration links only an unambiguous cashier account and never a manager',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 const root=new URL('../prisma/migrations/',import.meta.url);
 const current='20261121140000_employee_management';
 for(const name of readdirSync(root).filter(n=>n!==current&&n!=='migration_lock.toml').sort())await db.exec(readFileSync(new URL(name+'/migration.sql',root),'utf8'));
 await db.exec(`INSERT INTO cafes(id,name) VALUES (1,'Café');
 INSERT INTO employees(id,cafe_id,name) VALUES (1,1,'Unique'),(2,1,'Double'),(3,1,'Double'),(4,1,'Manager');
 INSERT INTO users(id,cafe_id,name,username,role) VALUES (1,1,'Unique','unique','cashier'),(2,1,'Double','double','cashier'),(3,1,'Manager','manager','manager');`);
 await db.exec(readFileSync(new URL(current+'/migration.sql',root),'utf8'));
 assert.deepEqual((await db.query('SELECT user_id,archived FROM employees ORDER BY id')).rows,[{user_id:1,archived:0},{user_id:null,archived:0},{user_id:null,archived:0},{user_id:null,archived:0}]);
});
