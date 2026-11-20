import {test} from 'node:test';
import assert from 'node:assert/strict';
import {waiterSales} from '../lib/waiter-sales.mjs';
const orders=[
 {date:'2026-11-19',waiter_id:1,user_name:'Latifa',status:'confirmed',payment:'cash',total:3300,lines:[{qty:3}]},
 {date:'2026-11-19',waiter_id:1,user_name:'Latifa',status:'confirmed',payment:'card',total:1100},
 {date:'2026-11-19',waiter_id:2,user_name:'Latifa',status:'confirmed',payment:'cash',total:700},
 {date:'2026-11-19',waiter_id:1,user_name:'Latifa',status:'cancelled',payment:'cash',total:9000},
 {date:'2026-11-20',waiter_id:1,user_name:'Latifa',status:'confirmed',payment:'cash',total:1000},
 {date:'2026-10-01',waiter_id:1,user_name:'Latifa',status:'confirmed',payment:'cash',total:2000},
];
test('daily handover counts orders rather than quantities, excludes cancellations, separates cash and waiter IDs',()=>{
 const result=waiterSales(orders,date=>date==='2026-11-19');
 assert.equal(result.rows.length,2);assert.equal(result.rows[0].count,2);assert.equal(result.rows[0].revenue,4400);assert.equal(result.rows[0].cash,3300);
 assert.equal(result.count,3);assert.equal(result.revenue,5100);assert.equal(result.cash,4000);
});
test('monthly handovers keep one row per waiter per service date and retain legacy names',()=>{
 const result=waiterSales(orders,date=>date.startsWith('2026-11'));
 assert.equal(result.rows.length,3);assert.equal(result.count,4);assert.equal(result.cash,5000);
 const legacy=waiterSales([{date:'2026-11-19',user_name:'Ancien employé',status:'confirmed',payment:'cash',total:100}]);
 assert.equal(legacy.rows[0].name,'Ancien employé');assert.equal(waiterSales([]).count,0);
});
