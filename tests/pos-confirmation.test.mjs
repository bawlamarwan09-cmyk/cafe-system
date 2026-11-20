import {testStore} from './postgres-fixture.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {LanguageContext} from '../lib/i18n.mjs';


test('POS review and cancel never save a sale; only final confirmation submits, with double-click protection',async t=>{
 const store=await testStore(t);const user=(await store.session((await store.login('caisse','1234'))));
 const manager = (await store.session((await store.login('manager','2026'))));
 const waiter = (await store.state(manager)).employees[0];
 (await store.action(manager,'employee-order-pin',{employee_id:waiter.id,pin:'0471'}));
 const originalFetch=globalThis.fetch;t.after(()=>{globalThis.fetch=originalFetch;});
 const values={0:(await store.state(user)),1:false,3:'pos',4:(await store.state(user)).today,7:{6:2},8:'cash',9:null};let index=0,tree,posts=0,release;
 const lock={current:false};const hold=new Promise(resolve=>{release=resolve;});
 let releaseRefresh;const refreshHold=new Promise(resolve=>{releaseRefresh=resolve;});t.after(()=>releaseRefresh());
 globalThis.fetch=async(url,options)=>{
  if(options?.method==='POST'&&String(url).endsWith('/order')){posts++;const body=JSON.parse(options.body);assert.equal(body.waiter_pin,undefined);await hold;const result=(await store.action(user,'order',body));return {ok:true,json:async()=>({ok:true,...result})};}
  await refreshHold;return {ok:true,json:async()=>values[0]};
 };
 const require=createRequire(import.meta.url);const compile=file=>ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const chart={exports:{}};Function('require','module','exports',compile('../components/sack-performance-chart.tsx'))(require,chart,chart.exports);
 const module={exports:{}},hooks={...React,useEffect:()=>{},useMemo:f=>f(),useRef:()=>lock,useState:initial=>{const n=index++;if(!(n in values))values[n]=initial;return [values[n],next=>{values[n]=typeof next==='function'?next(values[n]):next;}];}};
 Function('require','module','exports',compile('../app/page.tsx'))(p=>p==='react'?hooks:p==='../components/sack-performance-chart'?chart.exports:require(p),module,module.exports);
 function render(){index=0;function Harness(){tree=module.exports.default();return tree;}return renderToStaticMarkup(React.createElement(LanguageContext.Provider,{value:{language:'fr',setLanguage:()=>{}}},React.createElement(Harness)));}
 function find(predicate,node){if(!node)return null;if(Array.isArray(node)){for(const child of node){const result=find(predicate,child);if(result)return result;}return null;}if(typeof node!=='object')return null;return predicate(node)?node:find(predicate,node.props?.children??null);}
 const findInTree=predicate=>find(predicate,tree);
 const button=className=>findInTree(n=>n.type==='button'&&n.props.className?.includes(className));
 render();assert.equal(button('confirm-sale'),null);button('pos-cart-button').props.onClick();let html=render();assert.match(html,/Impression automatique/);assert.equal(findInTree(n=>n.props?.className==='cart-drawer'),null);assert.equal(posts,0);assert.equal((await store.state(user)).orders.length,0);assert.match(html,/Vérifier la commande/);assert.match(html,/Eau minérale/);assert.match(html,/14 DH/);assert.match(html,/Espèces/);
 let actions=findInTree(n=>n.type==='div'&&n.props.className==='modal-actions');actions.props.children[0].props.onClick();render();assert.equal(values[9],null);assert.deepEqual(values[7],{6:2});assert.equal(posts,0);
 button('pos-cart-button').props.onClick();render();
 assert.equal(findInTree(n=>n.type==='div'&&n.props.className==='modal-actions').props.children[1].props.disabled,true);
 findInTree(n=>n.type==='button'&&n.props['aria-label']?.startsWith('Ajouter un ')).props.onClick();
 html=render();assert.match(html,/21 DH/);assert.equal(values[7][6],3);
 findInTree(n=>n.type==='button'&&n.props['aria-label']?.startsWith('Retirer un ')).props.onClick();
 html=render();assert.match(html,/14 DH/);assert.equal(values[7][6],2);
 assert.equal(findInTree(n=>n.type==='select'&&n.props.value===''),null);
 findInTree(n=>n.type==='button'&&n.props.className?.startsWith('waiter-option ')).props.onClick();
 render();
 assert.equal(findInTree(n=>n.type==='input'&&n.props.type==='password'),null);
 assert.equal(findInTree(n=>n.props?.className==='pin-pad'),null);
 render();
 actions=findInTree(n=>n.type==='div'&&n.props.className==='modal-actions');const confirm=actions.props.children[1].props.onClick;
 const previousWindow=globalThis.window,previousDocument=globalThis.document,previousTimeout=globalThis.setTimeout;
 const frames=[];let printCalls=0;
 const node=()=>({children:[],style:{},textContent:'',append(...children){this.children.push(...children);}});
 globalThis.window={};
 globalThis.document={body:node(),createElement(){const doc={body:node(),documentElement:{},open(){},write(){},close(){},createElement:node};const frame={style:{},contentDocument:doc,contentWindow:{focus(){},print(){printCalls++;}},remove(){}};frames.push(frame);return frame;}};
 globalThis.setTimeout=(callback,delay,...args)=>delay===120000?0:previousTimeout(callback,delay,...args);
 t.after(()=>{globalThis.window=previousWindow;globalThis.document=previousDocument;globalThis.setTimeout=previousTimeout;});
 const first=confirm(),second=confirm();assert.equal(posts,1);assert.equal(frames.length,0);assert.equal((await store.state(user)).orders.length,0);release();await Promise.all([first,second]);html=render();assert.equal((await store.state(user)).orders.length,1);assert.equal((await store.state(user)).orders[0].total,1400);assert.equal((await store.state(user)).orders[0].waiter_id,waiter.id);assert.equal((await store.state(user)).inventory.length,0);assert.equal(values[9],null);assert.deepEqual(values[7],{});assert.doesNotMatch(html,/Ticket de commande/);assert.equal(values[0].orders.length,1);releaseRefresh();
 assert.equal(frames.length,1);assert.equal(frames[0].contentDocument.body.children.length,2);
 const copies=frames[0].contentDocument.body.children;
 assert.match(copies[0].children[1].textContent,/COPIE CLIENT/);assert.match(copies[1].children[1].textContent,/COPIE BARMAN/);
 assert.ok(copies[0].children.some(child=>child.textContent.startsWith('TOTAL')));
 assert.equal(copies[1].children.some(child=>child.textContent.startsWith('TOTAL')),false);
 await new Promise(resolve=>previousTimeout(resolve,250));assert.equal(printCalls,1);
});
