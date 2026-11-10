import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {LanguageContext} from '../lib/i18n.mjs';
import {openStore} from '../lib/store.mjs';

test('POS review and cancel never save a sale; only final confirmation submits, with double-click protection',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'monalisa-confirmation-'));const store=openStore(join(dir,'db.sqlite'));const user=store.session(store.login('caisse','1234'));
 const manager = store.session(store.login('manager','2026'));
 const waiter = store.state(manager).employees[0];
 store.action(manager,'employee-order-pin',{employee_id:waiter.id,pin:'0471'});
 const originalFetch=globalThis.fetch;t.after(()=>{globalThis.fetch=originalFetch;store.close();rmSync(dir,{recursive:true,force:true});});
 const values={0:store.state(user),1:false,3:'pos',4:store.state(user).today,7:{6:2},8:'cash',10:null};let index=0,tree,posts=0,release;
 const lock={current:false};const hold=new Promise(resolve=>{release=resolve;});
 globalThis.fetch=async(url,options)=>{
  if(options?.method==='POST'&&String(url).endsWith('/order')){posts++;const body=JSON.parse(options.body);await hold;const result=store.action(user,'order',body);return {ok:true,json:async()=>({ok:true,...result})};}
  return {ok:true,json:async()=>store.state(user)};
 };
 const require=createRequire(import.meta.url);const compile=file=>ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const chart={exports:{}};Function('require','module','exports',compile('../components/sack-performance-chart.tsx'))(require,chart,chart.exports);
 const module={exports:{}},hooks={...React,useEffect:()=>{},useMemo:f=>f(),useRef:()=>lock,useState:initial=>{const n=index++;if(!(n in values))values[n]=initial;return [values[n],next=>{values[n]=typeof next==='function'?next(values[n]):next;}];}};
 Function('require','module','exports',compile('../app/page.tsx'))(p=>p==='react'?hooks:p==='../components/sack-performance-chart'?chart.exports:require(p),module,module.exports);
 function render(){index=0;function Harness(){tree=module.exports.default();return tree;}return renderToStaticMarkup(React.createElement(LanguageContext.Provider,{value:{language:'fr',setLanguage:()=>{}}},React.createElement(Harness)));}
 function find(predicate,node){if(!node)return null;if(Array.isArray(node)){for(const child of node){const result=find(predicate,child);if(result)return result;}return null;}if(typeof node!=='object')return null;return predicate(node)?node:find(predicate,node.props?.children??null);}
 const findInTree=predicate=>find(predicate,tree);
 const button=className=>findInTree(n=>n.type==='button'&&n.props.className?.includes(className));
 render();button('confirm-sale').props.onClick();let html=render();assert.equal(posts,0);assert.equal(store.state(user).orders.length,0);assert.match(html,/Vérifier la commande/);assert.match(html,/Eau minérale/);assert.match(html,/14 DH/);assert.match(html,/Espèces/);
 let actions=findInTree(n=>n.type==='div'&&n.props.className==='modal-actions');actions.props.children[0].props.onClick();render();assert.equal(values[10],null);assert.deepEqual(values[7],{6:2});assert.equal(posts,0);
 button('confirm-sale').props.onClick();render();
 assert.equal(findInTree(n=>n.type==='div'&&n.props.className==='modal-actions').props.children[1].props.disabled,true);
 findInTree(n=>n.type==='select'&&n.props.value==='').props.onChange({target:{value:String(waiter.id)}});
 render();
 for(const digit of [0,4,7,1]){
  findInTree(n=>n.type==='button'&&n.props.children===(digit===0?'0':digit)).props.onClick();
  render();
 }
 render();
 actions=findInTree(n=>n.type==='div'&&n.props.className==='modal-actions');const confirm=actions.props.children[1].props.onClick;
 const first=confirm(),second=confirm();assert.equal(posts,1);assert.equal(store.state(user).orders.length,0);release();await Promise.all([first,second]);html=render();assert.equal(store.state(user).orders.length,1);assert.equal(store.state(user).orders[0].total,1400);assert.equal(store.state(user).orders[0].waiter_id,waiter.id);assert.equal(store.state(user).inventory.length,0);assert.equal(values[10].type,'receipt');assert.deepEqual(values[7],{});assert.match(html,/Ticket de commande/);
});
