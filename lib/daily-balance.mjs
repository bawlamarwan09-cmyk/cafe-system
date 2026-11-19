// All amounts are integer centimes. Withdrawals move cash, not operating profit.
export function dailyBalance(state, matches=(_date)=>true) {
 const days=new Map();
 const row=date=>{if(!days.has(date))days.set(date,{date,sales:0,repayments:0,income:0,purchases:0,expenses:0,payroll:0,spending:0,net:0,withdrawals:0,count:0});return days.get(date);};
 for(const order of state.orders){
  if(order.status!=='confirmed'||!matches(order.date))continue;
  const day=row(order.date);day.sales+=order.total;day.count++;
  if(order.payment!=='credit')day.income+=order.total;
 }
 for(const movement of state.movements){
  if(!matches(movement.date))continue;
  const day=row(movement.date),amount=movement.amount;
  if(movement.kind==='repayment'){day.income+=amount;day.repayments+=amount;}
  if(movement.kind==='purchase')day.purchases+=amount;
  if(movement.kind==='expense')day.expenses+=amount;
  if(['salary','advance'].includes(movement.kind))day.payroll+=amount;
  if(movement.kind==='withdrawal')day.withdrawals+=amount;
 }
 for(const closing of state.closings||[])if(matches(closing.date))row(closing.date);
 if(state.today&&matches(state.today))row(state.today);
 const rows=[...days.values()].sort((a,b)=>b.date.localeCompare(a.date));
 const total={sales:0,repayments:0,income:0,purchases:0,expenses:0,payroll:0,spending:0,net:0,withdrawals:0,count:0};
 for(const day of rows){day.spending=day.purchases+day.expenses+day.payroll;day.net=day.income-day.spending;for(const key of Object.keys(total))total[key]+=day[key];}
 return {rows,total};
}
