import {test} from 'node:test';
import assert from 'node:assert/strict';
import {translate} from '../lib/i18n.mjs';
test('Arabic messages interpolate product and finance values without changing stored objects',()=>{
 assert.equal(translate('Stock insuffisant : Lait.'),'المخزون ما كافيش: الحليب.');
 assert.equal(translate('Après salaires / avances : 150 DH'),'من بعد الأجور / التسبيقات: 150 د.م.');
 assert.equal(translate('Vente #12 (annulée)'),'مبيعة #12 (ملغاة)');
 assert.equal(translate('3 commandes confirmées'),'3 طلبات مؤكدة');
 assert.equal(translate('1 commande confirmée'),'1 طلب مؤكد');
 assert.equal(translate('Lait (litre)'),'الحليب (لتر)');
 assert.equal(translate('المخزون'),'المخزون');
 assert.equal(translate('Café noir','fr'),'Café noir');
 assert.equal(translate('manager / 2026'),'manager / 2026');
 const data={name:'Café noir',price:1000,reason:'Sac entièrement consommé'};assert.equal(translate(data),data);assert.equal(data.reason,'Sac entièrement consommé');
});
