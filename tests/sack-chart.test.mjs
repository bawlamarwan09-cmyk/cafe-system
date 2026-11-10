import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {LanguageContext} from '../lib/i18n.mjs';

function chartHarness(){
 let selected=null,tree;
 const require=createRequire(import.meta.url),module={exports:{}};
 const source=readFileSync(new URL('../components/sack-performance-chart.tsx',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 Function('require','module','exports',code)(name=>name==='react'?{...React,useState:()=>[selected,value=>{selected=value;}]}:require(name),module,module.exports);
 function render(sacks,language='fr'){function Harness(){tree=module.exports.default({sacks});return tree;}return renderToStaticMarkup(React.createElement(LanguageContext.Provider,{value:{language,setLanguage:()=>{}}},React.createElement(Harness)));}
 function find(predicate,node=tree){if(!node)return null;if(Array.isArray(node)){for(const child of node){const found=find(predicate,child);if(found)return found;}return null;}if(typeof node!=='object')return null;if(predicate(node))return node;return find(predicate,node.props?.children??null);}
 return {render,click:id=>{const button=find(n=>n.type==='button'&&n.props['data-sack-id']===id);assert.ok(button,`bar ${id} exists`);button.props.onClick();},choose:value=>{const select=find(n=>n.type==='select');select.props.onChange({target:{value}});}};
}
const sack=(id,equivalents,extra={})=>({id,equivalents,weight_kg:1,status:'closed',reason:'Sac entièrement consommé',barista_name:'Bachir',opened:'2026-11-01T10:00:00Z',...extra});
const result=html=>html.match(/<aside[^>]*data-selected-sack="\d+"[\s\S]*?<\/aside>/)?.[0]||'';

test('clicking each bar changes the adjacent result, score and rating for that sack',()=>{
 const chart=chartHarness(),sacks=[sack(1,62),sack(2,75),sack(3,20,{status:'active',reason:null})];
 let html=chart.render(sacks);assert.match(result(html),/data-selected-sack="3"/);assert.match(result(html),/result-in_progress/);assert.match(result(html),/Évaluation à la clôture/);
 chart.click(1);html=chart.render(sacks);assert.match(result(html),/data-selected-sack="1"/);assert.match(result(html),/result-review/);assert.match(result(html),/À revoir/);assert.match(result(html),/>62</);
 chart.click(2);html=chart.render(sacks);assert.match(result(html),/data-selected-sack="2"/);assert.match(result(html),/result-excellent/);assert.match(result(html),/>75</);assert.match(result(html),/Bachir/);
 chart.choose('1');assert.match(result(chart.render(sacks,'ar')),/خاص المراجعة/);
});
test('automatic mode follows new sacks and live counts while manual history selection stays selected',()=>{
 const chart=chartHarness(),past=[sack(1,65),sack(2,75)];
 chart.render(past);chart.click(1);
 const current=[...past,sack(3,10,{status:'active',reason:null})];assert.match(result(chart.render(current)),/data-selected-sack="1"/);
 chart.choose('live');assert.match(result(chart.render(current)),/data-selected-sack="3"/);
 const updated=[...past,sack(3,41,{status:'active',reason:null})];let html=chart.render(updated);assert.match(result(html),/>41</);assert.match(result(html),/result-in_progress/);
 html=chart.render([...past,sack(3,77),sack(4,0,{status:'active',reason:null})]);assert.match(result(html),/data-selected-sack="4"/);assert.match(result(html),/result-in_progress/);
});
test('chart normalizes historical weights, keeps partial bags ungraded and can select bags outside the latest twelve',()=>{
 const chart=chartHarness();let html=chart.render([sack(1,450,{weight_kg:6})]);assert.match(result(html),/>75</);assert.match(result(html),/result-excellent/);
 html=chart.render([sack(2,18,{reason:'Perte ou renversement'})]);assert.match(result(html),/result-unavailable/);assert.match(result(html),/Non mesurable/);
 const many=Array.from({length:30},(_,i)=>sack(i+1,65));chart.render(many);chart.choose('1');html=chart.render(many);assert.match(result(html),/data-selected-sack="1"/);assert.equal((html.match(/data-sack-id=/g)||[]).length,12);assert.match(html,/data-sack-id="1"/);
 assert.doesNotMatch(chart.render([]),/data-selected-sack=/);
});
