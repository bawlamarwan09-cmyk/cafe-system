import {actionStateSections} from '../lib/action-state.mjs';
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
 const jwtSource=readFileSync(new URL('../lib/session-jwt.ts',import.meta.url),'utf8');
 const transpile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const jwt={exports:{}};
 Function('require','module','exports',transpile(jwtSource))(require,jwt,jwt.exports);
 Function('require','module','exports',transpile(source))(p=>p.endsWith('action-state.mjs')?{actionStateSections}:p.endsWith('store.mjs')?{store:()=>store,StoreError}:p.endsWith('/session-jwt')?jwt.exports:require(p),module,module.exports);
 const route=module.exports,origin='https://cafe-system-blush.vercel.app',upstream='https://api-cafe.example.test';let cookie='';
 const previousOrigin=process.env.MONALISA_ORIGIN;
 process.env.MONALISA_ORIGIN=origin;
 t.after(()=>{if(previousOrigin===undefined)delete process.env.MONALISA_ORIGIN;else process.env.MONALISA_ORIGIN=previousOrigin;});
 const post=async(path,body,customOrigin=origin)=>route.POST(new NextRequest(upstream+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',origin:customOrigin,cookie},body:JSON.stringify(body)}),{params:Promise.resolve({path:[path]})});
 assert.equal((await route.GET(new NextRequest(upstream+'/api/state'))).status,401);
 assert.equal((await post('product',{name:'Sans session'})).status,401);
 const cashierLogin=await post('login',{username:'caisse',pin:'1234'});
 assert.equal(cashierLogin.status,200);
 const cashierData=await cashierLogin.json();assert.equal(cashierData.state.user.role,'cashier');assert.deepEqual(cashierData.state.inventory,[]);assert.ok(!('pin' in cashierData.state.user));
 cookie=cashierLogin.headers.get('set-cookie').split(';')[0];
 assert.equal((await post('product',{name:'Interdit'})).status,403);
 assert.equal((await post('product-delete',{id:1})).status,403);
 cookie='monalisa_session='+'a'.repeat(64);
 assert.equal((await post('product-delete',{id:1})).status,401);
 cookie='';
 assert.equal((await post('login',{username:'manager',pin:'2026'},'https://untrusted.example')).status,403);
 const denied=await post('login',{username:'manager',pin:'wrong'});assert.equal(denied.status,401);assert.deepEqual(await denied.json(),{error:401,message:'Identifiant ou code incorrect.'});
 const login=await post('login',{username:'manager',pin:'2026'});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly/i);const loginData=await login.json();assert.equal(loginData.ok,true);assert.equal(loginData.state.user.role,'manager');assert.equal(loginData.state.products.length,110);assert.ok(!('pin' in loginData.state.user));assert.equal(loginData.state.today.length,10);
 const managerCookie=cookie;
 const [jwtHeader,jwtPayload,jwtSignature]=cookie.slice('monalisa_session='.length).split('.');
 const claims=JSON.parse(Buffer.from(jwtPayload,'base64url').toString('utf8'));
 const alteredPayload=Buffer.from(JSON.stringify({...claims,exp:claims.exp+3600})).toString('base64url');
 cookie='monalisa_session='+[jwtHeader,alteredPayload,jwtSignature].join('.');
 assert.equal((await post('product-delete',{id:1})).status,401);
 const originalTime=Date.now;
 try {
  Date.now=()=>claims.exp*1000;
  assert.equal(jwt.exports.verifySession(managerCookie.slice('monalisa_session='.length)),undefined);
 } finally { Date.now=originalTime; }
 cookie=managerCookie;
 const initial=await route.GET(new NextRequest(upstream+'/api/state',{headers:{cookie}}));assert.equal(initial.status,200);const data=await initial.json();assert.equal(data.user.cafe_name,'Monalisa Café');assert.equal(data.products.length,110);assert.ok(!('pin' in data.user));
 const badProduct=await post('product',{name:'Essai',category:'Boissons chaudes',price:-1});
 assert.equal(badProduct.status,400);
 assert.equal((await badProduct.json()).message,'Montant invalide.');
 assert.equal((await post('sack-open',{})).status,200);
 const order=await post('order',{key:'ui-order',payment:'cash',lines:[{id:1,qty:2},{id:6,qty:1}]});assert.equal(order.status,200);const result=await order.json();assert.equal(result.id,1);
 const refreshed=await (await route.GET(new NextRequest(upstream+'/api/state',{headers:{cookie}}))).json();assert.equal(refreshed.orders[0].total,2900);assert.equal(refreshed.sacks[0].equivalents,2);assert.equal(refreshed.inventory.find(i=>i.id===2).quantity,45);
 const saved=await post('receipt-settings',{title:'Ticket rapide',refresh:true,refresh_date:data.today});
 assert.equal(saved.status,200);assert.match(saved.headers.get('server-timing'),/action;dur=/);
 const patch=await saved.json();assert.equal(patch.state.receiptSettings.title,'Ticket rapide');assert.ok(!('products' in patch.state));assert.ok(!('orders' in patch.state));
 const originalState=store.state,originalError=console.error;let refreshFailure;
 store.state=async()=>{throw new Error('Simulated refresh failure');};console.error=(...args)=>{refreshFailure=args;};
 try {
  const committed=await post('receipt-settings',{title:'Still saved',refresh:true});
  assert.equal(committed.status,200);assert.equal((await committed.json()).ok,true);
 } finally {store.state=originalState;console.error=originalError;}
 assert.ok(refreshFailure);assert.equal((await store.state((await store.session(jwt.exports.verifySession(cookie.slice('monalisa_session='.length)))))).receiptSettings.title,'Still saved');
 assert.equal((await post('logout',{})).status,200);assert.equal((await route.GET(new NextRequest(upstream+'/api/state',{headers:{cookie}}))).status,401);
});
