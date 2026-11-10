export const COFFEE_TARGETS = Object.freeze({ minimum:65, good:70, excellent:75 });

export function rateCoffeeYield(rate) {
 if(!Number.isFinite(rate)||rate<0)return {key:'unavailable',label:'Non mesurable',tone:'neutral'};
 if(rate<65)return {key:'review',label:'À revoir',tone:'red'};
 if(rate<=70)return {key:'good',label:'Bon',tone:'green'};
 if(rate<75)return {key:'very_good',label:'Très bon',tone:'blue'};
 return {key:'excellent',label:'Excellent',tone:'gold'};
}

export function sackPerformance(sack) {
 const weight=Number(sack.weight_kg),count=Number(sack.equivalents);
 if(sack.status==='active')return {key:'in_progress',label:'Évaluation à la clôture',tone:'neutral',rate:null};
 if(sack.status!=='closed'||sack.reason!=='Sac entièrement consommé'||!Number.isFinite(weight)||weight<=0||!Number.isFinite(count)||count<0)return {...rateCoffeeYield(NaN),rate:null};
 const rate=count/weight;
 return {...rateCoffeeYield(rate),rate};
}

export function baristaPerformance(sacks) {
 const summaries=new Map();
 for(const sack of sacks){
  const performance=sackPerformance(sack);
  if(performance.rate===null||!sack.barista_id)continue;
  const key=sack.barista_id,summary=summaries.get(key)||{id:key,name:sack.barista_name||'Barman',sacks:0,equivalents:0,kg:0,review:0,excellent:0};
  summary.sacks++;summary.equivalents+=Number(sack.equivalents);summary.kg+=Number(sack.weight_kg);
  if(performance.key==='review')summary.review++;
  if(performance.key==='excellent')summary.excellent++;
  summaries.set(key,summary);
 }
 return [...summaries.values()].map(s=>({...s,rate:s.equivalents/s.kg,...rateCoffeeYield(s.equivalents/s.kg)}));
}
