import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dailyBalance} from '../lib/daily-balance.mjs';
test('daily net groups service dates, excludes cancelled sales and separates withdrawals from expenses',()=>{
 const state={today:'2026-11-20',orders:[{date:'2026-11-19',status:'confirmed',total:10000,payment:'cash'},{date:'2026-11-19',status:'cancelled',total:5000,payment:'cash'},{date:'2026-11-19',status:'confirmed',total:2000,payment:'credit'},{date:'2026-10-01',status:'confirmed',total:500,payment:'cash'}],movements:[{date:'2026-11-19',kind:'purchase',amount:2000},{date:'2026-11-19',kind:'expense',amount:500},{date:'2026-11-19',kind:'salary',amount:1000},{date:'2026-11-19',kind:'advance',amount:500},{date:'2026-11-19',kind:'withdrawal',amount:3000},{date:'2026-11-19',kind:'repayment',amount:1000}]};
 const result=dailyBalance(state,date=>date.startsWith('2026-11'));
 assert.equal(result.rows.length,2);assert.equal(result.total.sales,12000);assert.equal(result.total.income,11000);assert.equal(result.total.spending,4000);assert.equal(result.total.net,7000);assert.equal(result.total.withdrawals,3000);
 assert.equal(dailyBalance(state,date=>date==='2026-10-01').total.net,500);
 assert.equal(dailyBalance(state,date=>date==='2026-11-20').total.net,0);
});
