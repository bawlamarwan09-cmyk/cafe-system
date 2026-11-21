import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testStore} from './postgres-fixture.mjs';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {LanguageContext} from '../lib/i18n.mjs';

test('employee save merges the committed patch in one request and ignores duplicate clicks',async t=>{
 const store=await testStore(t),user=await store.session(await store.login('manager','2026'));
 const initial=await store.state(user),employee=initial.employees[0];
 const values={0:initial,1:false,3:'employees',4:initial.today,9:{type:'employee-edit',employee}};
 const refs=[];let index=0,refIndex=0,tree,requests=0,release;
 const hold=new Promise(resolve=>{release=resolve;});
 const originalFetch=globalThis.fetch,OriginalFormData=globalThis.FormData;
 t.after(()=>{globalThis.fetch=originalFetch;globalThis.FormData=OriginalFormData;release();});
 globalThis.FormData=class extends OriginalFormData {constructor(){super();this.set('name','Barman renommé');this.set('role','Barman');this.set('wage','200');}};
 globalThis.fetch=async(url,options)=>{
  requests++;assert.equal(url,'/api/employee-edit');
  const body=JSON.parse(options.body);assert.equal(body.refresh,true);assert.equal(body.refresh_date,initial.today);
  await hold;await store.action(user,'employee-edit',body);
  return {ok:true,status:200,json:async()=>({ok:true,state:{employees:(await store.state(user)).employees}})};
 };
 const require=createRequire(import.meta.url);
 const compile=file=>ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const chart={exports:{}};Function('require','module','exports',compile('../components/sack-performance-chart.tsx'))(require,chart,chart.exports);
 const hooks={...React,useEffect:()=>{},useMemo:f=>f(),useRef:initial=>{const n=refIndex++;return refs[n]??=({current:initial});},useState:initial=>{const n=index++;if(!(n in values))values[n]=initial;return [values[n],next=>{values[n]=typeof next==='function'?next(values[n]):next;}];}};
 const module={exports:{}};Function('require','module','exports',compile('../app/page.tsx'))(p=>p==='react'?hooks:p==='../components/sack-performance-chart'?chart.exports:require(p),module,module.exports);
 function Harness(){tree=module.exports.default();return tree;}
 renderToStaticMarkup(React.createElement(LanguageContext.Provider,{value:{language:'fr',setLanguage:()=>{}}},React.createElement(Harness)));
 const find=node=>!node?null:Array.isArray(node)?node.map(find).find(Boolean):typeof node!=='object'?null:node.type==='form'?node:find(node.props?.children);
 const save=find(tree).props.onSubmit,event={preventDefault(){},currentTarget:{}};
 const first=save(event),duplicate=save(event);assert.equal(requests,1);release();await Promise.all([first,duplicate]);
 assert.equal(requests,1);assert.equal(values[9],null);assert.equal(values[10],false);
 assert.equal(values[0].employees.find(e=>e.id===employee.id).name,'Barman renommé');
 assert.equal(values[0].products,initial.products);assert.equal(values[0].orders,initial.orders);
});
