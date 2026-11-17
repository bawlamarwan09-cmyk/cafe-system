import {StoreError} from '../lib/store.mjs';
import {testStore} from './postgres-fixture.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {NextRequest} from 'next/server.js';


test('API authentication → café data → sale → persisted response, without a network listener',async t=>{
 const store=await testStore(t);
 const require=createRequire(import.meta.url),module={exports:{}};
 const source=readFileSync(new URL('../app/api/[...path]/route.ts',import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 Function('require','module','exports',js)(p=>p.endsWith('store.mjs')?{store:()=>store,StoreError}:require(p),module,module.exports);
 const route=module.exports,origin='https://cafe-system-blush.vercel.app',upstream='https://api-cafe.example.test';let cookie='';
 const previousOrigin=process.env.MONALISA_ORIGIN;
 process.env.MONALISA_ORIGIN=origin;
 t.after(()=>{if(previousOrigin===undefined)delete process.env.MONALISA_ORIGIN;else process.env.MONALISA_ORIGIN=previousOrigin;});
 const post=async(path,body,customOrigin=origin)=>route.POST(new NextRequest(upstream+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',origin:customOrigin,cookie},body:JSON.stringify(body)}),{params:Promise.resolve({path:[path]})});
 assert.equal((await route.GET(new NextRequest(upstream+'/api/state'))).status,401);
 assert.equal((await post('login',{username:'manager',pin:'2026'},'https://untrusted.example')).status,403);
 const denied=await post('login',{username:'manager',pin:'wrong'});assert.equal(denied.status,401);assert.deepEqual(await denied.json(),{error:401});
 const login=await post('login',{username:'manager',pin:'2026'});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly/i);
 const initial=await route.GET(new NextRequest(upstream+'/api/state',{headers:{cookie}}));assert.equal(initial.status,200);const data=await initial.json();assert.equal(data.user.cafe_name,'Monalisa Café');assert.equal(data.products.length,110);assert.ok(!('pin' in data.user));
 assert.equal((await post('sack-open',{})).status,200);
 const order=await post('order',{key:'ui-order',payment:'cash',lines:[{id:1,qty:2},{id:6,qty:1}]});assert.equal(order.status,200);const result=await order.json();assert.equal(result.id,1);
 const refreshed=await (await route.GET(new NextRequest(upstream+'/api/state',{headers:{cookie}}))).json();assert.equal(refreshed.orders[0].total,2900);assert.equal(refreshed.sacks[0].equivalents,2);assert.equal(refreshed.inventory.find(i=>i.id===2).quantity,47);
 assert.equal((await post('logout',{})).status,200);assert.equal((await route.GET(new NextRequest(upstream+'/api/state',{headers:{cookie}}))).status,401);
});
