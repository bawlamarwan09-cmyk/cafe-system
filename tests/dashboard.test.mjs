import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';
import React from 'react';
import {LanguageContext} from '../lib/i18n.mjs';
import ts from 'typescript';
import {openStore} from '../lib/store.mjs';

test('all four management panels render for managers and are absent for cashiers',t=>{
 const dir=mkdtempSync(join(tmpdir(),'monalisa-dashboard-'));const store=openStore(join(dir,'db.sqlite'));t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 const require=createRequire(import.meta.url),source=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 const chartSource=readFileSync(new URL('../components/sack-performance-chart.tsx',import.meta.url),'utf8');const chartModule={exports:{}};Function('require','module','exports',ts.transpileModule(chartSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(require,chartModule,chartModule.exports);
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 function render(username,pin,language='fr',view='dashboard',modal=null){const data=store.state(store.session(store.login(username,pin)));let index=0;const module={exports:{}};const hooks={...React,useEffect:()=>{},useMemo:f=>f(),useState:initial=>{const n=index++;return [n===0?data:n===1?false:n===3?view:n===4?data.today:n===10?modal:initial,()=>{}];}};Function('require','module','exports',js)(p=>p==='react'?hooks:p==='../components/sack-performance-chart'?chartModule.exports:require(p),module,module.exports);return renderToStaticMarkup(React.createElement(LanguageContext.Provider,{value:{language,setLanguage:()=>{}}},React.createElement(module.exports.default))); }
 const manager=render('manager','2026'),cashier=render('caisse','1234');
 for(const title of ['La semaine en un regard','Khncha en cours','À surveiller','Bilan du mois','Dépenses du jour']){assert.ok(manager.includes(title),`manager: ${title}`);assert.ok(!cashier.includes(title),`cashier: ${title}`);}
 for(const title of ['Ventes du jour','En espèces','Reste du jour','Dernières ventes'])assert.ok(cashier.includes(title),`retained: ${title}`);
 assert.match(cashier,/cashier-dashboard/);
 assert.ok(!manager.includes('Crédit clients'));assert.ok(!cashier.includes('Crédit du jour'));
 const arabicManager=render('manager','2026','ar'),arabicCashier=render('caisse','1234','ar');
 for(const title of ['نظرة على الأسبوع','الخنشة المفتوحة','خاص المراقبة','حصيلة الشهر','مصاريف النهار']){assert.ok(arabicManager.includes(title),`Arabic manager: ${title}`);assert.ok(!arabicCashier.includes(title),`Arabic cashier: ${title}`);}
 for(const title of ['مبيعات النهار','نقداً','الباقي ديال النهار','آخر المبيعات'])assert.ok(arabicCashier.includes(title),`Arabic retained: ${title}`);
 assert.ok(arabicCashier.includes('العربية'));assert.ok(arabicCashier.includes('FR'));
 const pos=render('caisse','1234','ar','pos');assert.ok(pos.includes('الطلب الحالي'));assert.ok(pos.includes('تأكيد الطلب'));assert.ok(pos.includes('قهوة كحلة'));assert.ok(!pos.includes('كريدي'));assert.ok(!pos.includes('value="credit"'));
 assert.doesNotMatch(pos,/menu-layout|قائمة بالصور/);assert.match(pos,/\/products\/fanta-orange.webp/);assert.ok(pos.includes('فانتا برتقال'));assert.match(pos,/cart panel/);assert.match(pos,/\/products\/coca-cola.webp/);
 const product=render('manager','2026','ar','settings',{type:'product'});assert.ok(product.includes('استهلاك')||product.includes('الاستهلاك'));assert.ok(product.includes('اسم المنتوج'));assert.match(product,/name="price"/);
 const sack=render('manager','2026','ar','sacks',{type:'sack-close',id:1});assert.ok(sack.includes('الخنشة سالات بالكامل'));assert.match(sack,/value="Sac entièrement consommé"/);
 store.action(store.session(store.login('manager','2026')),'sack-open',{});const activeDashboard=render('manager','2026');assert.ok(activeDashboard.includes('1 kg'));assert.ok(activeDashboard.includes('65 éq.'));assert.ok(!activeDashboard.includes('390'));assert.ok(activeDashboard.includes('Rendement par khncha'));assert.ok(!cashier.includes('Rendement par khncha'));
 const responsible=store.session(store.login('manager','2026'));store.action(responsible,'order',{key:'excellent-ui',payment:'cash',lines:[{id:1,qty:75}]});store.action(responsible,'sack-close',{id:store.state(responsible).sacks[0].id,reason:'Sac entièrement consommé'});const results=render('manager','2026','fr','sacks');assert.ok(results.includes('Excellent'));assert.ok(results.includes('Suivi des barmans'));assert.ok(results.includes('Bachir'));const arabicResults=render('manager','2026','ar','sacks');assert.ok(arabicResults.includes('ممتاز'));assert.ok(arabicResults.includes('تتبع مردودية البارمان'));
 const stock=render('manager','2026','ar','stock');assert.ok(stock.includes('سجل الحركات'));assert.ok(!stock.includes('وحدةs'));
 const managerSales=render('manager','2026','ar','sales'),cashierSales=render('caisse','1234','ar','sales');assert.ok(managerSales.includes('sale-actions'));assert.ok(managerSales.includes('حذف'));assert.ok(!cashierSales.includes('sale-actions'));
 const saved=store.state(responsible).orders[0];const editor=render('manager','2026','ar','sales',{type:'order-edit',order:saved,lines:saved.lines,payment:saved.payment});assert.ok(editor.includes('تعديل الطلب'));assert.ok(editor.includes('زيد منتوج'));assert.match(editor,/name="reason"/);

});
