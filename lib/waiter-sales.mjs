// Saved waiter identity and service date keep historical handovers consistent.
export function waiterSales(orders, matches=(_date)=>true) {
 const groups=new Map();
 for(const order of orders){
  if(order.status!=='confirmed'||!matches(order.date))continue;
  const key=JSON.stringify([order.date,order.waiter_id==null?['name',order.user_name]:['id',order.waiter_id]]);
  if(!groups.has(key))groups.set(key,{key,date:order.date,name:order.user_name,count:0,revenue:0,cash:0});
  const row=groups.get(key);row.count++;row.revenue+=order.total;
  if(order.payment==='cash')row.cash+=order.total;
 }
 const rows=[...groups.values()].sort((a,b)=>b.date.localeCompare(a.date)||b.revenue-a.revenue||String(a.name).localeCompare(String(b.name)));
 return {rows,count:rows.reduce((sum,row)=>sum+row.count,0),revenue:rows.reduce((sum,row)=>sum+row.revenue,0),cash:rows.reduce((sum,row)=>sum+row.cash,0)};
}
