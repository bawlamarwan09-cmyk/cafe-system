import {test} from 'node:test';
import assert from 'node:assert/strict';
import {productSales} from '../lib/product-sales.mjs';
const products=[{id:1,name:'Café renommé'},{id:2,name:'Thé'}];
const orders=[
 {id:1,user_name:'Serveur',date:'2026-11-19',status:'confirmed',lines:[{id:1,name:'Café',qty:2,price:1100},{id:1,name:'Café',qty:1,price:1200},{id:3,name:'Ancien article',qty:1,price:500}]},
 {date:'2026-11-20',status:'confirmed',lines:[{id:1,name:'Café',qty:1,price:1300}]},
 {date:'2026-11-19',status:'cancelled',lines:[{id:2,name:'Thé',qty:9,price:1000}]},
 {date:'2026-10-01',status:'confirmed',lines:[{id:2,name:'Thé',qty:1,price:1000}]}
];
test('daily quantities use historical prices, retain archived products and count distinct orders',()=>{
 const result=productSales(orders,products,date=>date==='2026-11-19');
 assert.deepEqual(result.rows[0],{id:1,name:'Café renommé',quantity:3,orders:1,revenue:3400,tickets:[{id:1,date:'2026-11-19',cashier:'Serveur'}]});
 assert.equal(result.rows.some(row=>row.id===2),false);
 assert.equal(result.rows.find(row=>row.id===3).name,'Ancien article');
 assert.equal(result.orders,1);assert.equal(result.quantity,4);assert.equal(result.revenue,3900);
});
test('monthly totals exclude cancelled and out-of-period orders',()=>{
 const result=productSales(orders,products,date=>date.startsWith('2026-11'));
 assert.equal(result.quantity,5);assert.equal(result.orders,2);assert.equal(result.revenue,5200);
 assert.equal(productSales([],products).quantity,0);
});

test('expenses and purchases are included once, with dates and cashier, even without sales',()=>{
 const movements=[{id:1,date:'2026-11-19',user_name:'Manager',kind:'purchase',label:'Café',amount:5000},{id:2,date:'2026-11-19',kind:'expense',amount:1200},{id:3,date:'2026-11-19',kind:'salary',amount:3000},{id:4,date:'2026-10-01',kind:'expense',amount:900}];
 const report=productSales(orders,products,date=>date==='2026-11-19',movements);
 assert.equal(report.expenses,1200);assert.equal(report.purchases,5000);assert.equal(report.movementRows.length,2);
 assert.equal(report.movementRows[0].user_name,'Manager');
 const empty=productSales([],products,()=>true,movements);assert.equal(empty.rows.length,0);assert.equal(empty.purchases,5000);
});
