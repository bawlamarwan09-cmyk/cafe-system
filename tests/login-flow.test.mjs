import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { LanguageContext } from '../lib/i18n.mjs';

test('login installs authenticated state from a single request, without a follow-up state fetch', async t => {
 const originalFetch=globalThis.fetch, OriginalFormData=globalThis.FormData;
 t.after(()=>{globalThis.fetch=originalFetch;globalThis.FormData=OriginalFormData;});
 const state={user:{id:1,role:'manager'},today:'2026-11-21'};
 const requests=[];
 globalThis.fetch=async(url,options)=>{
  requests.push(url);
  assert.equal(url,'/api/login');
  assert.deepEqual(JSON.parse(options.body),{username:'manager',pin:'2026'});
  return {ok:true,status:200,json:async()=>({ok:true,state})};
 };
 globalThis.FormData=class extends OriginalFormData {constructor(){super();this.set('username','manager');this.set('pin','2026');}};
 const require=createRequire(import.meta.url);
 const compile=file=>ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const chart={exports:{}};
 Function('require','module','exports',compile('../components/sack-performance-chart.tsx'))(require,chart,chart.exports);
 const values={0:null,1:false};let index=0,tree;
 const hooks={...React,useEffect:()=>{},useMemo:f=>f(),useRef:initial=>({current:initial}),useState:initial=>{const n=index++;if(!(n in values))values[n]=initial;return [values[n],next=>{values[n]=typeof next==='function'?next(values[n]):next;}];}};
 const module={exports:{}};
 Function('require','module','exports',compile('../app/page.tsx'))(p=>p==='react'?hooks:p==='../components/sack-performance-chart'?chart.exports:require(p),module,module.exports);
 function Harness(){tree=module.exports.default();return tree;}
 renderToStaticMarkup(React.createElement(LanguageContext.Provider,{value:{language:'fr',setLanguage:()=>{}}},React.createElement(Harness)));
 function find(node){if(!node)return null;if(Array.isArray(node))return node.map(find).find(Boolean);if(typeof node!=='object')return null;return node.type==='form'?node:find(node.props?.children);}
 await find(tree).props.onSubmit({preventDefault(){},currentTarget:{}});
 assert.deepEqual(requests,['/api/login']);
 assert.equal(values[0],state);assert.equal(values[4],state.today);assert.equal(values[10],false);assert.equal(values[2],'');
});
