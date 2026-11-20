// Service dates and recorded prices keep historical sales accurate.
export function productSales(orders, products, matches=(_date)=>true, movements=[]) {
 const rows=new Map(products.map(p=>[p.id,{id:p.id,name:p.name,quantity:0,orders:0,revenue:0,tickets:[]}]));
 let orderCount=0;
 for(const order of orders){
  if(order.status!=='confirmed'||!matches(order.date))continue;
  const seen=new Set();
  for(const line of order.lines){
   if(!rows.has(line.id))rows.set(line.id,{id:line.id,name:line.name,quantity:0,orders:0,revenue:0,tickets:[]});
   const row=rows.get(line.id);row.quantity+=line.qty;row.revenue+=line.qty*line.price;
   if(!seen.has(line.id)){row.orders++;row.tickets.push({id:order.id,date:order.date,cashier:order.user_name});seen.add(line.id);}
  }
  if(seen.size)orderCount++;
 }
 const sorted=[...rows.values()].filter(row=>row.quantity>0).sort((a,b)=>b.quantity-a.quantity||a.name.localeCompare(b.name));
 const movementRows=movements.filter(m=>['expense','purchase'].includes(m.kind)&&matches(m.date));
 const expenses=movementRows.filter(m=>m.kind==='expense').reduce((sum,m)=>sum+m.amount,0);
 const purchases=movementRows.filter(m=>m.kind==='purchase').reduce((sum,m)=>sum+m.amount,0);
 return {movementRows,expenses,purchases,rows:sorted,quantity:sorted.reduce((sum,r)=>sum+r.quantity,0),revenue:sorted.reduce((sum,r)=>sum+r.revenue,0),orders:orderCount};
}
