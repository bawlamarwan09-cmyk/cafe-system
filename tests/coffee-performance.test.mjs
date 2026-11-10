import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rateCoffeeYield,sackPerformance,baristaPerformance} from '../lib/coffee-performance.mjs';

test('barman ratings use exact thresholds, including milk-coffee half equivalents',()=>{
 for(const [rate,key] of [[0,'review'],[64.5,'review'],[65,'good'],[70,'good'],[70.5,'very_good'],[74.5,'very_good'],[75,'excellent'],[82,'excellent']])assert.equal(rateCoffeeYield(rate).key,key,`rate=${rate}`);
 assert.equal(rateCoffeeYield(NaN).key,'unavailable');
});
test('an open or partially consumed bag is never given a final performance rating',()=>{
 const base={weight_kg:1,reason:'Sac entièrement consommé',status:'closed'};
 assert.equal(sackPerformance({...base,equivalents:64}).key,'review');
 assert.equal(sackPerformance({...base,equivalents:75}).key,'excellent');
 for(const equivalents of [5,65,80]){const result=sackPerformance({...base,status:'active',equivalents});assert.equal(result.key,'in_progress');assert.equal(result.rate,null);}
 assert.equal(sackPerformance({...base,equivalents:80,reason:'Clôture anticipée / reste de café'}).rate,null);
 assert.equal(sackPerformance({...base,weight_kg:6,equivalents:420}).key,'good');
 assert.equal(sackPerformance({...base,weight_kg:6,equivalents:450}).key,'excellent');
});
test('barista averages are weighted by consumed kg and exclude incomplete and unassigned bags',()=>{
 const base={barista_id:1,barista_name:'Bachir',status:'closed',reason:'Sac entièrement consommé'};
 const summaries=baristaPerformance([{...base,weight_kg:6,equivalents:420},{...base,weight_kg:1,equivalents:75},{...base,weight_kg:1,equivalents:3,status:'active'},{...base,weight_kg:1,equivalents:2,reason:'Perte ou renversement'},{...base,barista_id:null,weight_kg:1,equivalents:80}]);
 assert.equal(summaries.length,1);assert.equal(summaries[0].sacks,2);assert.equal(summaries[0].rate,495/7);assert.equal(summaries[0].key,'very_good');assert.equal(summaries[0].excellent,1);assert.equal(summaries[0].review,0);
});
