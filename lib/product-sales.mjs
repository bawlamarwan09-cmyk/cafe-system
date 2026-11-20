// Service dates and recorded prices keep historical sales accurate.
export function productSales(orders, products, matches=(_date)=>true) {
 const rows=new Map(products.map(p=>[p.id,{id:p.id,name:p.name,quantity:0,orders:0,revenue:0}]));
 let orderCount=0;
 for(const order of orders){
  if(order.status!=='confirmed'||!matches(order.date))continue;
  const seen=new Set();
  for(const line of order.lines){
   if(!rows.has(line.id))rows.set(line.id,{id:line.id,name:line.name,quantity:0,orders:0,revenue:0});
   const row=rows.get(line.id);row.quantity+=line.qty;row.revenue+=line.qty*line.price;
   if(!seen.has(line.id)){row.orders++;seen.add(line.id);}
  }
  if(seen.size)orderCount++;
 }
 const sorted=[...rows.values()].sort((a,b)=>b.quantity-a.quantity||a.name.localeCompare(b.name));
 return {rows:sorted,quantity:sorted.reduce((sum,r)=>sum+r.quantity,0),revenue:sorted.reduce((sum,r)=>sum+r.revenue,0),orders:orderCount};
}
