import { menuNameKey, monalisaCategories, monalisaMenu, waterOptions } from './monalisa-menu.mjs';
import { additionalMenuPhotos, catalogProducts, coffeePhotos, juiceCatalog, productImages, stockBottleKeys } from './drink-catalog.mjs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const tracksBottle = product => stockBottleKeys.has(product.catalog_key);
const tracksStock = product => product.equivalent > 0 || tracksBottle(product);
function validProductImage(image) {
 if (typeof image !== 'string') return false;
 if (productImages.has(image)) return true;
 if (image.length > 1_398_130) return false;
 const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
 if (!match) return false;
 const bytes = Buffer.from(match[2], 'base64');
 if (bytes.length > 1_048_576 || bytes.toString('base64') !== match[2]) return false;
 if (match[1] === 'jpeg') return bytes.subarray(0, 3).toString('hex') === 'ffd8ff';
 if (match[1] === 'png') return bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
 return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone:'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date());
const money = v => { const n=Number(v); if(!Number.isFinite(n)||n<0||n>10000000) throw new StoreError('Montant invalide.'); return Math.round(n*100); };
const positive = v => {const n=Number(v);if(!Number.isFinite(n)||n<=0||n>1000000)throw new StoreError('Quantité invalide.');return n;};
const label = v => { const s=String(v||'').trim();if(!s||s.length>240)throw new StoreError('Libellé requis (240 caractères maximum).');return s;};
const date = v => {if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v))||Number.isNaN(Date.parse(v+'T12:00:00Z'))||new Date(v+'T12:00:00Z').toISOString().slice(0,10)!==v)throw new StoreError('Date invalide.');return v;};
const hash = pin => scryptSync(pin,'monalisa-local-v1',64).toString('hex');
const accountPinHash = pin => {
 const salt = randomBytes(16).toString('hex');
 return salt + ':' + scryptSync(pin, salt, 64).toString('hex');
};
const accountPinMatches = (pin, stored) => {
 const [salt, digest] = stored.split(':');
 const expected = Buffer.from(digest ?? salt, 'hex');
 const actual = Buffer.from(digest ? scryptSync(pin, salt, 64).toString('hex') : hash(pin), 'hex');
 return expected.length === actual.length && timingSafeEqual(expected, actual);
};
const validNewAccountPin = pin => /^\d{4,12}$/.test(pin) &&
 (process.env.NODE_ENV !== 'production' || !['2026','1234'].includes(pin));
export class StoreError extends Error {
 constructor(message, status = 400) {
  super(message);
  this.status = status;
 }
}

export async function openStore(db = new PrismaClient()) {
 const database = new AsyncLocalStorage();
 const connection = () => database.getStore() ?? db;
 // SQL is defined by this module; all request values are bound as parameters.
 const bindings = sql => {
  let index = 0;
  return sql.replace(/\?/g, () => '$' + ++index);
 };
 const all = async (sql, ...params) => {
  const rows = await connection().$queryRawUnsafe(bindings(sql), ...params);
  for (const row of rows) {
   for (const key of Object.keys(row)) {
    if (typeof row[key] === 'bigint') row[key] = Number(row[key]);
   }
  }
  return rows;
 };
 const get = async (sql, ...params) => (await all(sql, ...params))[0];
 const run = (sql, ...params) => connection().$executeRawUnsafe(bindings(sql), ...params);
 const tx = (scope, operation) => db.$transaction(client => database.run(client, async () => {
  await client.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(52305, CAST(${scope} AS integer))`;
  return operation();
 }), { timeout: 30_000 });
 await tx(0, async () => {
 if(!(await get('SELECT id FROM cafes LIMIT 1'))){
  const managerPin=process.env.MONALISA_MANAGER_PIN;
  const cashierPin=process.env.MONALISA_CASHIER_PIN;
  if(process.env.NODE_ENV==='production'&&(
   !/^\d{8,12}$/.test(managerPin||'')||!/^\d{8,12}$/.test(cashierPin||'')||managerPin===cashierPin
  ))throw new StoreError('Configurez deux codes de production distincts de 8 à 12 chiffres.');
  await run('INSERT INTO cafes VALUES(1,?)','Monalisa Café');
  await run('INSERT INTO users VALUES(1,1,?,?,?,?)','Marouane','manager',hash(managerPin||'2026'),'manager');
  await run('INSERT INTO users VALUES(2,1,?,?,?,?)','Caissier','caisse',hash(cashierPin||'1234'),'cashier');
  await all("SELECT setval(pg_get_serial_sequence('cafes','id'),1) AS value");
  await all("SELECT setval(pg_get_serial_sequence('users','id'),2) AS value");
  const items=[['Khnchas café','sac',24,6,7000],['Eau minérale 50 cl','unité',48,12,250],['Coca-Cola','unité',36,12,450],['Hawaï','unité',24,8,450],['Lait','litre',12,4,950],['Thé','kg',2,0.5,8000],['Sucre','kg',8,2,700],['Oranges','kg',15,3,700]];
  for(const x of items)await run('INSERT INTO inventory(cafe_id,name,unit,quantity,threshold,cost) VALUES(1,?,?,?,?,?)',...x);
  const products=[['Café noir','Cafés',1000,1,{'7':0.008}],['Café au lait','Cafés',1200,0.5,{'5':0.12,'7':0.008}],['Café double','Cafés',1600,2,{'7':0.008}],['Cappuccino','Cafés',1800,1,{'5':0.15,'7':0.008}],['Thé à la menthe','Thés',1000,0,{'6':0.006,'7':0.02}],['Eau minérale','Boissons',700,0,{'2':1}],['Coca-Cola','Boissons',1000,0,{'3':1}],['Hawaï','Boissons',1000,0,{'4':1}],['Jus d’orange','Jus',1500,0,{'8':0.3}],['Lait chaud','Boissons',1000,0,{'5':0.2}]];
  for(const [n,c,p,e,r] of products)await run('INSERT INTO products(cafe_id,name,category,price,equivalent,recipe) VALUES(1,?,?,?,?,?)',n,c,p,e,JSON.stringify(r));
  for(const x of [['Bachir','Barista',19000],['Serveur','Service',15000],['Samira','Entretien',10000]])await run('INSERT INTO employees(cafe_id,name,role,wage) VALUES(1,?,?,?)',...x);
 }
 // Match legacy products once and preserve custom prices and recipes.
  for(const cafe of await all('SELECT id FROM cafes'))for(const item of catalogProducts){
   if(await get('SELECT id FROM products WHERE cafe_id=? AND catalog_key=?',cafe.id,item.key))continue;
   const names=[item.name,...item.aliases];
   const existing=(await all('SELECT * FROM products WHERE cafe_id=? AND catalog_key IS NULL',cafe.id)).find(p=>names.some(n=>n.toLowerCase()===p.name.toLowerCase()));
   if(existing){await run('UPDATE products SET catalog_key=?,image_path=COALESCE(image_path,?) WHERE id=?',item.key,item.image_path,existing.id);continue;}
   if(item.stock_tracked===false){await run("INSERT INTO products(cafe_id,name,category,price,equivalent,recipe,image_path,catalog_key) VALUES(?,?,?,?,0,'{}',?,?)",cafe.id,item.name,item.category,Math.round(item.price*100),item.image_path,item.key);continue;}
   let stock=(await all('SELECT * FROM inventory WHERE cafe_id=?',cafe.id)).find(i=>names.some(n=>n.toLowerCase()===i.name.toLowerCase()));
   if(!stock){const added=await get("INSERT INTO inventory(cafe_id,name,unit,quantity,threshold,cost) VALUES(?,?,?,0,6,0) RETURNING id",cafe.id,item.stock_name||item.name,item.stock_unit||'unité');stock={id:added.id};}
   await run('INSERT INTO products(cafe_id,name,category,price,equivalent,recipe,image_path,catalog_key) VALUES(?,?,?,?,0,?,?,?)',cafe.id,item.name,item.category,Math.round(item.price*100),JSON.stringify({[stock.id]:1}),item.image_path,item.key);
  }
  // Retain historical juice portions and movements, but remove them from active stock.
  for(const product of await all("SELECT * FROM products WHERE catalog_key LIKE 'juice-%'"))for(const id of Object.keys(JSON.parse(product.recipe))){
   if(!(await all('SELECT * FROM products WHERE cafe_id=?',product.cafe_id)).some(p=>tracksStock(p)&&Object.hasOwn(JSON.parse(p.recipe),id)))await run("UPDATE inventory SET archived=1 WHERE cafe_id=? AND id=? AND unit='portion'",product.cafe_id,Number(id));
  }
  for(const cafe of await all('SELECT id FROM cafes'))if(!(await get('SELECT version FROM catalog_migrations WHERE cafe_id=? AND version=1',cafe.id))){
   await run("UPDATE products SET category='Sodas' WHERE cafe_id=? AND catalog_key IN ('coca-cola','hawai-tropical') AND category='Boissons'",cafe.id);
   await run('INSERT INTO catalog_migrations VALUES(?,1)',cafe.id);
  }
  for (const cafe of await all('SELECT id FROM cafes')) {
   if (await get('SELECT version FROM catalog_migrations WHERE cafe_id=? AND version=2', cafe.id)) continue;
   for (const coffee of coffeePhotos) {
    for (const name of [coffee.name, ...coffee.aliases]) {
     await run("UPDATE products SET image_path=? WHERE cafe_id=? AND category='Cafés' AND lower(name)=lower(?) AND COALESCE(image_path,'')=''", coffee.image_path, cafe.id, name);
    }
   }
   await run('INSERT INTO catalog_migrations VALUES(?,2)', cafe.id);
  }
  for (const cafe of await all('SELECT id FROM cafes')) {
   if (await get('SELECT version FROM catalog_migrations WHERE cafe_id=? AND version=3', cafe.id)) continue;
   for (const photo of additionalMenuPhotos) {
    await run("UPDATE products SET image_path=? WHERE cafe_id=? AND category=? AND lower(name)=lower(?) AND COALESCE(image_path,'')=''", photo.image_path, cafe.id, photo.category, photo.name);
   }
   for (const juice of juiceCatalog) {
    await run('UPDATE products SET image_path=? WHERE cafe_id=? AND catalog_key=? AND image_path=?', juice.image_path, cafe.id, juice.key, `/products/${juice.key}.svg`);
   }
   await run('INSERT INTO catalog_migrations VALUES(?,3)', cafe.id);
  }
  for (const cafe of await all('SELECT id FROM cafes')) {
   if (await get('SELECT version FROM catalog_migrations WHERE cafe_id=? AND version=4', cafe.id)) continue;
   for (const juice of juiceCatalog.filter(juice=>juice.image_path.endsWith('.webp'))) {
    await run('UPDATE products SET image_path=? WHERE cafe_id=? AND image_path=?', juice.image_path, cafe.id, `/products/${juice.key}.jpg`);
   }
   await run('INSERT INTO catalog_migrations VALUES(?,4)', cafe.id);
  }
  for (const cafe of await all('SELECT id FROM cafes')) {
   if (await get('SELECT version FROM catalog_migrations WHERE cafe_id=? AND version=5', cafe.id)) continue;
   for (const photo of [...coffeePhotos, ...additionalMenuPhotos].filter(photo=>photo.image_path.endsWith('.webp'))) {
    await run('UPDATE products SET image_path=? WHERE cafe_id=? AND image_path=?', photo.image_path, cafe.id, photo.image_path.replace(/\.webp$/, '.jpg'));
   }
   await run('INSERT INTO catalog_migrations VALUES(?,5)', cafe.id);
  }
  for (const cafe of await all("SELECT id FROM cafes WHERE name='Monalisa Café'")) {
   if (await get('SELECT version FROM catalog_migrations WHERE cafe_id=? AND version=6', cafe.id)) continue;
   const products = await all('SELECT * FROM products WHERE cafe_id=? ORDER BY active DESC, id', cafe.id);
   for (const item of monalisaMenu) {
    const existing = products.find(product => item.catalogKey && product.catalog_key === item.catalogKey)
      ?? products.find(product => item.names.includes(menuNameKey(product.name)));
    if (existing) {
     await run('UPDATE products SET price=? WHERE id=? AND cafe_id=?', item.price, existing.id, cafe.id);
    } else {
     await run("INSERT INTO products(cafe_id,name,category,price,equivalent,recipe) VALUES(?,?,?,?,0,'{}')",
       cafe.id, item.name, item.category, item.price);
    }
   }
   await run('INSERT INTO catalog_migrations VALUES(?,6)', cafe.id);
  }
  for (const cafe of await all("SELECT id FROM cafes WHERE name='Monalisa Café'")) {
   if (await get('SELECT version FROM catalog_migrations WHERE cafe_id=? AND version=7', cafe.id)) continue;
   const categories = {
    'Cafés': 'Boissons chaudes', 'Thés': 'Boissons chaudes', 'Jus': 'Boissons fraîches',
    'Jus en bouteille': 'Boissons fraîches', 'Sodas': 'Soda', 'Eaux': 'Eau minérale',
    'Tajines': 'Tajine', 'Poêles': 'Poêle',
   };
   for (const product of await all('SELECT id, name, category FROM products WHERE cafe_id=?', cafe.id)) {
    let category = categories[product.category];
    if (product.category === 'Boissons') {
     const name = menuNameKey(product.name);
     if (name === 'eauminerale') category = 'Eau minérale';
     if (monalisaMenu.some(item => item.category === 'Boissons' && item.names.includes(name))) {
      category = 'Boissons chaudes';
     }
    }
    if (category) await run('UPDATE products SET category=? WHERE id=? AND cafe_id=?', category, product.id, cafe.id);
   }
   await run('INSERT INTO catalog_migrations VALUES(?,7)', cafe.id);
  }
  for (const cafe of await all("SELECT id FROM cafes WHERE name='Monalisa Café'")) {
   if (await get('SELECT version FROM catalog_migrations WHERE cafe_id=? AND version=8', cafe.id)) continue;
   const products = await all('SELECT * FROM products WHERE cafe_id=? AND active=1 ORDER BY id', cafe.id);
   const water = products.find(product => menuNameKey(product.name).startsWith('aquafina'))
    ?? products.find(product => !product.catalog_key && menuNameKey(product.name)==='eauminerale');
   if (water) {
    const inventory = await all('SELECT * FROM inventory WHERE cafe_id=? AND archived=0 ORDER BY id', cafe.id);
    const existing = inventory.find(item => item.unit==='unité' && menuNameKey(item.name).startsWith('aquafina'))
     ?? inventory.find(item => item.unit==='unité' && menuNameKey(item.name)==='eauminerale50cl');
    const stock = existing ?? await get(
     "INSERT INTO inventory(cafe_id,name,unit,quantity,threshold,cost) VALUES(?,'Aquafina','unité',0,6,0) RETURNING id",
     cafe.id,
    );
    if (existing && menuNameKey(existing.name)==='eauminerale50cl') {
     await run("UPDATE inventory SET name='Aquafina 50 cl' WHERE id=? AND cafe_id=?", stock.id, cafe.id);
    }
    await run("UPDATE products SET name=?,recipe=?,catalog_key='aquafina' WHERE id=? AND cafe_id=?",
     menuNameKey(water.name)==='eauminerale'?'Aquafina':water.name,JSON.stringify({[stock.id]:1}),water.id,cafe.id);
   }
   await run('INSERT INTO catalog_migrations VALUES(?,8)', cafe.id);
  }
  for (const cafe of await all("SELECT id FROM cafes WHERE name='Monalisa Café'")) {
   if (await get('SELECT version FROM catalog_migrations WHERE cafe_id=? AND version=9', cafe.id)) continue;
   const products = await all('SELECT id,name,equivalent FROM products WHERE cafe_id=? AND active=1 ORDER BY id', cafe.id);
   for (const option of waterOptions) {
    const regular = products.find(product => option.regular.some(name => menuNameKey(name) === menuNameKey(product.name)));
    if (!regular?.equivalent) continue;
    for (const variant of products.filter(product => option.without.some(name => menuNameKey(name) === menuNameKey(product.name)))) {
     await run('UPDATE products SET equivalent=? WHERE cafe_id=? AND id=? AND equivalent=0', regular.equivalent, cafe.id, variant.id);
    }
   }
   await run('INSERT INTO catalog_migrations VALUES(?,9)', cafe.id);
  }

  for (const cafe of await all('SELECT id,name FROM cafes')) {
   if (await get('SELECT version FROM catalog_migrations WHERE cafe_id=? AND version=10', cafe.id)) continue;
   const products = await all('SELECT DISTINCT category FROM products WHERE cafe_id=?',cafe.id);
   const categories = new Set([...(cafe.name==='Monalisa Café'?monalisaCategories:[]),...products.map(product=>product.category)]);
   for (const name of categories) {
    if(name)await run('INSERT INTO menu_categories(cafe_id,name) VALUES(?,?) ON CONFLICT DO NOTHING',cafe.id,name);
   }
   await run('INSERT INTO catalog_migrations VALUES(?,10)',cafe.id);
  }

 });
 const scoped=async (table,id,c)=>{const r=await get(`SELECT * FROM ${table} WHERE id=? AND cafe_id=?`,Number(id),c);if(!r)throw new StoreError('Élément introuvable.');return r;};
 const manager=u=>{if(u.role!=='manager')throw new StoreError('Cette action est réservée au manager.',403);};
 const unlocked=async (c,d)=>{if(await get('SELECT id FROM closings WHERE cafe_id=? AND date=?',c,d))throw new StoreError('Cette journée est clôturée.');};
 const moveStock=async (c,id,q,reason,order=null)=>{await scoped('inventory',id,c);await run('UPDATE inventory SET quantity=quantity+? WHERE id=? AND cafe_id=?',q,id,c);await run('INSERT INTO stock_moves(cafe_id,inventory_id,quantity,reason,order_id,created) VALUES(?,?,?,?,?,?)',c,id,q,reason,order,new Date().toISOString());};
 const credit=async (c,id)=>Number((await get(`SELECT COALESCE((SELECT SUM(total) FROM orders WHERE cafe_id=? AND customer_id=? AND payment='credit' AND status='confirmed'),0)-COALESCE((SELECT SUM(amount) FROM movements WHERE cafe_id=? AND customer_id=? AND kind='repayment'),0) balance`,c,id,c,id)).balance);
 const cashExpected=async (c,d,opening)=>opening+Number((await get("SELECT COALESCE(SUM(total),0) n FROM orders WHERE cafe_id=? AND date=? AND payment='cash' AND status='confirmed'",c,d)).n)+Number((await get("SELECT COALESCE(SUM(CASE WHEN kind='repayment' THEN amount ELSE -amount END),0) n FROM movements WHERE cafe_id=? AND date=? AND payment='cash'",c,d)).n);
 const waiterPin=async (c,id)=>await get('SELECT e.id,e.name,p.salt,p.pin_hash FROM employee_order_pins p JOIN employees e ON e.id=p.employee_id AND e.cafe_id=p.cafe_id WHERE p.cafe_id=? AND p.employee_id=?',c,id);
 const pinMatches=(pin,record)=>timingSafeEqual(scryptSync(pin,record.salt,64),Buffer.from(record.pin_hash,'hex'));
 const pinAttemptKey=(c,id)=>`order-pin-v2:${c}:${id}`;
 const pinLocked='Serveur bloqué après 3 PIN incorrects. Seul le manager peut le débloquer avec un nouveau PIN.';
 async function verifyOrderPin(u,waiter,pin){
  const c=u.cafe_id;
  if(await get('SELECT 1 FROM order_pin_locks WHERE cafe_id=? AND employee_id=?',c,waiter.id))throw new StoreError(pinLocked,423);
  const key=pinAttemptKey(c,waiter.id);
  if(pinMatches(pin,waiter)){await run('DELETE FROM attempts WHERE key=?',key);return null;}
  await run('INSERT INTO attempts VALUES(?,1,0) ON CONFLICT(key) DO UPDATE SET count=attempts.count+1',key);
  if((await get('SELECT count FROM attempts WHERE key=?',key)).count<3)return 'PIN du serveur incorrect.';
  await run('INSERT INTO order_pin_locks VALUES(?,?,?,?)',c,waiter.id,new Date().toISOString(),u.name);
  return pinLocked;
 }
 async function login(username,pin,key='local'){
  key=String(key).slice(0,200); const now=Date.now(), a=await get('SELECT * FROM attempts WHERE key=?',key);
  if(a&&a.reset>now&&a.count>=8)throw new StoreError('Trop de tentatives. Réessayez dans 15 minutes.',429);
  const u=await get('SELECT * FROM users WHERE username=?',String(username).toLowerCase());
  if(!u||(process.env.NODE_ENV==='production'&&['2026','1234'].includes(String(pin)))||!accountPinMatches(String(pin),u.pin)){await run('INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN attempts.reset<? THEN 1 ELSE attempts.count+1 END,reset=CASE WHEN attempts.reset<? THEN ? ELSE attempts.reset END',key,now+900000,now,now,now+900000);throw new StoreError('Identifiant ou code incorrect.',401);}
  return tx(u.cafe_id, async () => {
   if ((await get('SELECT pin FROM users WHERE id=?',u.id))?.pin !== u.pin) throw new StoreError('Identifiant ou code incorrect.',401);
   await run('DELETE FROM attempts WHERE key=?',key);
   await run('DELETE FROM sessions WHERE expires<?',now);
   const token=randomBytes(32).toString('hex');
   await run('INSERT INTO sessions VALUES(?,?,?)',token,u.id,now+12*3600000);
   return token;
  });
 }
 async function session(token){return await get('SELECT u.id,u.cafe_id,u.name,u.role,c.name cafe_name FROM sessions s JOIN users u ON s.user_id=u.id JOIN cafes c ON c.id=u.cafe_id WHERE s.token=? AND s.expires>?',token||'',Date.now());}
 async function state(u,selectedDate=today()){
  const day=date(selectedDate), c=u.cafe_id, manager=u.role==='manager';
  const [
   activeSack, products, inventory, sacks, orders, movements, employees,
   workdays, closings, stockMoves, accounts, orderWaiters, locks, events, categories,
  ]=await Promise.all([
   get("SELECT id FROM sacks WHERE cafe_id=? AND status='active'",c),
   all('SELECT * FROM products WHERE cafe_id=? AND active=1 ORDER BY id',c),
   all('SELECT * FROM inventory WHERE cafe_id=? AND archived=0 ORDER BY id',c),
   manager ? all('SELECT * FROM sacks WHERE cafe_id=? ORDER BY id DESC',c) : [],
   all('SELECT * FROM orders WHERE cafe_id=? ORDER BY id DESC',c),
   manager ? all('SELECT * FROM movements WHERE cafe_id=? ORDER BY id DESC',c)
    : all('SELECT date,kind,amount,payment FROM movements WHERE cafe_id=? AND date=? ORDER BY id DESC',c,day),
   manager ? all('SELECT * FROM employees WHERE cafe_id=? ORDER BY id',c) : [],
   manager ? all('SELECT * FROM workdays WHERE cafe_id=?',c) : [],
   manager ? all('SELECT * FROM closings WHERE cafe_id=? ORDER BY date DESC',c) : [],
   manager ? all('SELECT m.*, i.name AS item_name FROM stock_moves m LEFT JOIN inventory i ON i.id=m.inventory_id AND i.cafe_id=m.cafe_id WHERE m.cafe_id=? ORDER BY m.id DESC LIMIT 200',c) : [],
   manager ? all('SELECT id,name,username,role FROM users WHERE cafe_id=?',c) : [],
   all('SELECT e.id,e.name FROM employee_order_pins p JOIN employees e ON e.id=p.employee_id AND e.cafe_id=p.cafe_id WHERE p.cafe_id=? ORDER BY e.name,e.id',c),
   all('SELECT employee_id,reported_at,terminal_user FROM order_pin_locks WHERE cafe_id=?',c),
   manager ? all('SELECT order_id,kind,reason,user_name,created FROM order_events WHERE cafe_id=? ORDER BY id DESC',c) : [],
   all('SELECT id,name FROM menu_categories WHERE cafe_id=? ORDER BY id',c),
  ]);
  const result={
   user:u,today:today(),coffeeReady:!!activeSack,inventory,sacks,customers:[],
   products:products.map(p=>({...p,recipe:JSON.parse(p.recipe)})),
   orders:orders.map(o=>({...o,lines:JSON.parse(o.lines)})),
   movements,employees,workdays,closings,stockMoves,accounts,orderWaiters,categories,
  };
  result.orderWaiters=result.orderWaiters.map(w=>locks.some(l=>l.employee_id===w.id)?{...w,locked:true}:w);
  if(u.role==='manager')result.orderPinAlerts=locks.map(l=>({...l,name:result.orderWaiters.find(w=>w.id===l.employee_id)?.name}));
  result.products=result.products.map(product=>{
   const recipe = tracksBottle(product) ? product.recipe : {};
   const available = (!product.equivalent || result.coffeeReady) && Object.entries(recipe)
    .every(([id,quantity])=>(result.inventory.find(item=>item.id===Number(id))?.quantity||0)+0.000001>=quantity);
   return {...product,recipe,available,stock_tracked:tracksStock(product)};
  });
  if(manager){
   const changesByOrder=new Map();
   for(const event of events){
    if(!changesByOrder.has(event.order_id))changesByOrder.set(event.order_id,[]);
    changesByOrder.get(event.order_id).push(event);
   }
   result.orders=result.orders.map(o=>({...o,changes:changesByOrder.get(o.id)??[]}));
  }else{
   result.inventory=[];
   result.products=result.products.map(({recipe,equivalent,...p})=>p);
  }
  return result;
 }
 async function action(u,type,b){const c=u.cafe_id,d=date(b.date||today()); const result=await tx(c,async ()=>{
  if(type==='order'){
   let waiter = null;
   if (await get('SELECT 1 FROM employee_order_pins WHERE cafe_id=? LIMIT 1', c)) {
    if (!Number.isSafeInteger(b.waiter_id) || !/^\d{4}$/.test(String(b.waiter_pin ?? ''))) {
     throw new StoreError('Choisissez le serveur et saisissez son PIN à 4 chiffres.');
    }
    waiter = (await waiterPin(c,b.waiter_id));
    if (!waiter) throw new StoreError('Choisissez un serveur avec un PIN de commande.');
    const pinError=await verifyOrderPin(u,waiter,String(b.waiter_pin));
    if(pinError)return {pinError};
   }
   const key=label(b.key),existing=await get('SELECT * FROM orders WHERE request_key=?',`${c}:${key}`);if(existing){const original=JSON.parse(existing.lines).map(l=>({id:l.id,qty:l.qty}));const incoming=Array.isArray(b.lines)?b.lines.map(l=>({id:Number(l.id),qty:Number(l.qty)})):[];if((existing.waiter_id??null)!==(waiter?.id??null)||JSON.stringify(original)!==JSON.stringify(incoming)||existing.payment!==b.payment||(existing.customer_id||null)!==(b.payment==='credit'?Number(b.customer_id):null))throw new StoreError('Cette clé correspond à une autre commande. Rechargez le panier avant de réessayer.');return {id:existing.id};}await unlocked(c,d);
   if(!['cash','card'].includes(b.payment))throw new StoreError('Mode de paiement invalide.');
   if(!Array.isArray(b.lines)||!b.lines.length||b.lines.length>100)throw new StoreError('Panier vide ou trop grand.');
   let total=0,equivalents=0;const consumption={};const lines=[];for(const l of b.lines){const p=await scoped('products',l.id,c);if(!p.active)throw new StoreError('Produit désactivé.');const qty=positive(l.qty);if(!Number.isInteger(qty)||qty>100)throw new StoreError('Quantité de commande invalide.');total+=p.price*qty;equivalents+=(tracksStock(p)?p.equivalent:0)*qty;for(const [id,q] of Object.entries(tracksBottle(p)?JSON.parse(p.recipe):{}))consumption[id]=(consumption[id]||0)+q*qty;lines.push({id:p.id,name:p.name,qty,price:p.price,equivalent:tracksStock(p)?p.equivalent:0});}
   if(b.expected_total!==undefined&&(!Number.isSafeInteger(b.expected_total)||b.expected_total!==total))throw new StoreError('Les prix ont changé. Revenez au panier pour vérifier le nouveau total.');
   const sack=await get("SELECT * FROM sacks WHERE cafe_id=? AND status='active'",c);if(equivalents&&!sack)throw new StoreError('Le manager doit ouvrir une khncha avant de vendre du café.');
   for(const [id,q] of Object.entries(consumption)){const i=await scoped('inventory',id,c);if(i.archived||i.quantity+0.000001<q)throw new StoreError(`Stock insuffisant : ${i.name}.`);}
   const customer=null;
   const r=await get('INSERT INTO orders(cafe_id,created,date,user_name,lines,total,payment,customer_id,sack_id,equivalents,request_key,waiter_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id',c,new Date().toISOString(),d,waiter?.name??u.name,JSON.stringify(lines),total,b.payment,customer,equivalents?sack.id:null,equivalents,`${c}:${key}`,waiter?.id??null);const id=r.id;
   for(const [item,q] of Object.entries(consumption))await moveStock(c,Number(item),-q,'Vente',id);
   if(equivalents)await run('UPDATE sacks SET equivalents=equivalents+? WHERE id=?',equivalents,sack.id);return {id};
  }
  if(type==='order-edit'){
   manager(u);const o=await scoped('orders',b.id,c);await unlocked(c,o.date);const reason=label(b.reason);
   if(o.status!=='confirmed')throw new StoreError('Commande déjà annulée.');
   if(!Number.isInteger(b.revision)||b.revision!==o.revision)throw new StoreError('La commande a changé. Rechargez avant de réessayer.');
   if(o.payment==='credit')throw new StoreError('Cette ancienne vente à crédit ne peut pas être modifiée.');
   if(o.sack_id&&(await scoped('sacks',o.sack_id,c)).status!=='active')throw new StoreError('Khncha clôturée : cette commande ne peut plus être modifiée.');
   if(!['cash','card'].includes(b.payment))throw new StoreError('Mode de paiement invalide.');
   if(!Array.isArray(b.lines)||!b.lines.length||b.lines.length>100)throw new StoreError('Panier vide ou trop grand.');
   const previous=JSON.parse(o.lines),seen=new Set(),consumption={};let total=0,equivalents=0;
   const lines=[];
   for(const line of b.lines){
    const p=await scoped('products',line.id,c),old=previous.find(l=>l.id===p.id),qty=positive(line.qty);
    if(seen.has(p.id))throw new StoreError('Produit en double dans la commande.');seen.add(p.id);
    if((!p.active&&!old)||!Number.isInteger(qty)||qty>100)throw new StoreError('Quantité de commande invalide.');
    const price=old?.price??p.price,equivalent=tracksStock(p)?(old?.equivalent??p.equivalent):0;
    total+=price*qty;equivalents+=equivalent*qty;
    for(const [id,q] of Object.entries(tracksBottle(p)?JSON.parse(p.recipe):{}))consumption[id]=(consumption[id]||0)+q*qty;
    lines.push({id:p.id,name:old?.name??p.name,qty,price,equivalent});
   }
   if(!Number.isSafeInteger(b.expected_total)||b.expected_total!==total)throw new StoreError('Les prix ont changé. Revenez au panier pour vérifier le nouveau total.');
   const sack=o.sack_id?await scoped('sacks',o.sack_id,c):await get("SELECT * FROM sacks WHERE cafe_id=? AND status='active'",c);
   if(equivalents&&!sack)throw new StoreError('Le manager doit ouvrir une khncha avant de vendre du café.');
   const originalStock=await all('SELECT inventory_id,SUM(quantity) quantity FROM stock_moves WHERE cafe_id=? AND order_id=? GROUP BY inventory_id',c,o.id);
   for(const stock of originalStock)if(stock.quantity)await moveStock(c,stock.inventory_id,-stock.quantity,'Correction commande',o.id);
   for(const [id,q] of Object.entries(consumption)){const item=await scoped('inventory',id,c);if(item.archived||item.quantity+0.000001<q)throw new StoreError(`Stock insuffisant : ${item.name}.`);}
   for(const [id,q] of Object.entries(consumption))await moveStock(c,Number(id),-q,'Vente',o.id);
   if(o.sack_id)await run('UPDATE sacks SET equivalents=equivalents-? WHERE id=?',o.equivalents,o.sack_id);
   if(equivalents)await run('UPDATE sacks SET equivalents=equivalents+? WHERE id=?',equivalents,sack.id);
   await run('UPDATE orders SET lines=?,total=?,payment=?,sack_id=?,equivalents=?,revision=revision+1 WHERE id=? AND cafe_id=?',JSON.stringify(lines),total,b.payment,equivalents?sack.id:null,equivalents,o.id,c);
   const updated=await scoped('orders',o.id,c);
   await run('INSERT INTO order_events(cafe_id,order_id,kind,reason,user_name,created,before_json,after_json) VALUES(?,?,?,?,?,?,?,?)',c,o.id,'edit',reason,u.name,new Date().toISOString(),JSON.stringify(o),JSON.stringify(updated));
   return {id:o.id};
  }
  if(type==='cancel'){
   manager(u);const o=await scoped('orders',b.id,c);await unlocked(c,o.date);if(o.status!=='confirmed')throw new StoreError('Commande déjà annulée.');if(b.revision!==undefined&&b.revision!==o.revision)throw new StoreError('La commande a changé. Rechargez avant de réessayer.');
   if(o.sack_id&&(await scoped('sacks',o.sack_id,c)).status!=='active')throw new StoreError('Khncha clôturée : correction à examiner avant annulation.');
   if(o.payment==='credit'&&(await credit(c,o.customer_id))<o.total)throw new StoreError('Crédit déjà remboursé : corrigez le remboursement avant annulation.');
   await run("UPDATE orders SET status='cancelled',cancel_reason=?,revision=revision+1 WHERE id=?",label(b.reason),o.id);for(const m of await all('SELECT inventory_id,SUM(quantity) quantity FROM stock_moves WHERE order_id=? AND cafe_id=? GROUP BY inventory_id',o.id,c))await moveStock(c,m.inventory_id,-m.quantity,'Annulation',o.id);
   if(o.sack_id)await run('UPDATE sacks SET equivalents=equivalents-? WHERE id=?',o.equivalents,o.sack_id);await run('INSERT INTO order_events(cafe_id,order_id,kind,reason,user_name,created,before_json,after_json) VALUES(?,?,?,?,?,?,?,?)',c,o.id,'delete',label(b.reason),u.name,new Date().toISOString(),JSON.stringify(o),JSON.stringify(await scoped('orders',o.id,c)));return {};
  }
  if(type==='customer')throw new StoreError('Le module crédit est désactivé.');
  if (type==='employee-order-pin' || type==='change-order-pin') {
   if(type==='employee-order-pin')manager(u);
   const employee = await scoped('employees', b.employee_id, c);
   const pin = String(b.pin ?? '');
   if (!/^\d{4}$/.test(pin)) throw new StoreError('Le PIN de commande doit contenir 4 chiffres.');
   const previous=await waiterPin(c,employee.id);
   if(type==='change-order-pin'){
    const oldPin=String(b.old_pin ?? '');
    if(!previous||!/^\d{4}$/.test(oldPin))throw new StoreError('Saisissez votre ancien PIN à 4 chiffres.');
    const pinError=await verifyOrderPin(u,previous,oldPin);
    if(pinError)return {pinError};
   }
   if(previous&&pinMatches(pin,previous)&&
      (type==='change-order-pin'||(await get('SELECT 1 FROM order_pin_locks WHERE cafe_id=? AND employee_id=?',c,employee.id)))){
    throw new StoreError('Choisissez un PIN différent de l’ancien.');
   }
   const otherPins = await all('SELECT salt,pin_hash FROM employee_order_pins WHERE cafe_id=? AND employee_id<>?', c, employee.id);
   if (otherPins.some(other => pinMatches(pin,other))) {
    throw new StoreError('Ce PIN est déjà utilisé par un autre serveur.');
   }
   const salt = randomBytes(16).toString('hex');
   const pinHash = scryptSync(pin, salt, 64).toString('hex');
   await run('INSERT INTO employee_order_pins VALUES(?,?,?,?) ON CONFLICT(cafe_id,employee_id) DO UPDATE SET salt=excluded.salt,pin_hash=excluded.pin_hash', c, employee.id, salt, pinHash);
   await run('DELETE FROM attempts WHERE key=?',pinAttemptKey(c,employee.id));
   await run('DELETE FROM order_pin_locks WHERE cafe_id=? AND employee_id=?',c,employee.id);
   return {};
  }
  manager(u);
  if(type==='category'){
   const name=label(b.name);
   const duplicate=await get('SELECT id FROM menu_categories WHERE cafe_id=? AND lower(name)=lower(?) AND id<>?',c,name,Number(b.id||0));
   if(duplicate)throw new StoreError('Cette catégorie existe déjà.',409);
   if(b.id){
    const category=await scoped('menu_categories',b.id,c);
    await run('UPDATE menu_categories SET name=? WHERE id=? AND cafe_id=?',name,category.id,c);
    await run('UPDATE products SET category=? WHERE cafe_id=? AND category=?',name,c,category.name);
   }else await run('INSERT INTO menu_categories(cafe_id,name) VALUES(?,?)',c,name);
   return {};
  }
  if(type==='category-delete'){
   const category=await scoped('menu_categories',b.id,c);
   if(await get('SELECT id FROM products WHERE cafe_id=? AND category=? LIMIT 1',c,category.name)){
    const target=await scoped('menu_categories',b.target_id,c);
    if(target.id===category.id)throw new StoreError('Choisissez une autre catégorie.');
    await run('UPDATE products SET category=? WHERE cafe_id=? AND category=?',target.name,c,category.name);
   }
   await run('DELETE FROM menu_categories WHERE id=? AND cafe_id=?',category.id,c);
   return {};
  }
  if(type==='account-pin'){
   const managerAccount=await scoped('users',u.id,c);
   const account=await scoped('users',b.account_id,c);
   if(account.id!==u.id&&account.role!=='cashier')throw new StoreError('Cette action est réservée au titulaire du compte manager.',403);
   const pin=String(b.pin??''),currentPin=String(b.current_pin??'');
   if(!validNewAccountPin(pin)||pin!==String(b.confirm_pin??''))throw new StoreError('Vérifiez le nouveau code et sa confirmation.');
   const key='account-pin:'+u.id,now=Date.now(),attempt=await get('SELECT * FROM attempts WHERE key=?',key);
   if(attempt&&attempt.reset>now&&attempt.count>=8)throw new StoreError('Trop de tentatives. Réessayez dans 15 minutes.',429);
   if(!/^\d{4,12}$/.test(currentPin)||!accountPinMatches(currentPin,managerAccount.pin)){
    await run('INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN attempts.reset<=? THEN 1 ELSE attempts.count+1 END,reset=CASE WHEN attempts.reset<=? THEN ? ELSE attempts.reset END',key,now+900000,now,now,now+900000);
    return {accountPinRejected:true};
   }
   if(accountPinMatches(pin,account.pin))throw new StoreError('Choisissez un code différent de l’ancien.');
   await run('UPDATE users SET pin=? WHERE id=? AND cafe_id=?',accountPinHash(pin),account.id,c);
   await run('DELETE FROM sessions WHERE user_id=?',account.id);
   await run('DELETE FROM attempts WHERE key=? OR key=?',key,account.username);
   return {};
  }
  if(type==='sack-assign'){
   const sack=await scoped('sacks',b.id,c);
   if(sack.status!=='active'||sack.barista_id)throw new StoreError('La khncha doit être ouverte et sans barman attribué.');
   const barista=await scoped('employees',b.barista_id,c);
   await run('UPDATE sacks SET barista_id=?,barista_name=? WHERE id=? AND cafe_id=?',barista.id,barista.name,sack.id,c);
   return {};
  }
  if(type==='account'){const username=label(b.username).toLowerCase();if(!/^[a-z0-9_.-]{3,40}$/.test(username))throw new StoreError('Identifiant : 3 à 40 caractères, lettres sans accents et chiffres.');if(!validNewAccountPin(String(b.pin)))throw new StoreError('Le code doit contenir 4 à 12 chiffres.');if(!['manager','cashier'].includes(b.role))throw new StoreError('Rôle invalide.');await run('INSERT INTO users(cafe_id,name,username,pin,role) VALUES(?,?,?,?,?)',c,label(b.name),username,accountPinHash(String(b.pin)),b.role);return {};}
  if(type==='sack-open'){if(await get("SELECT id FROM sacks WHERE cafe_id=? AND status='active'",c))throw new StoreError('Une khncha est déjà ouverte.');const coffee=await get("SELECT * FROM inventory WHERE cafe_id=? AND unit='sac' AND archived=0 ORDER BY id LIMIT 1",c);if(!coffee||coffee.quantity<1)throw new StoreError('Aucune khncha en stock.');const barista=b.barista_id?await scoped('employees',b.barista_id,c):await get("SELECT * FROM employees WHERE cafe_id=? AND (LOWER(role) IN ('barista','barman') OR role IN ('محضر القهوة','بارمان')) ORDER BY id LIMIT 1",c);if(!barista)throw new StoreError('Sélectionnez le barman responsable.');await moveStock(c,coffee.id,-1,'Ouverture khncha');await run("INSERT INTO sacks(cafe_id,opened,opened_by,status,weight_kg,barista_id,barista_name) VALUES(?,?,?,'active',1,?,?)",c,new Date().toISOString(),u.name,barista.id,barista.name);return {};}
  if(type==='sack-close'){const s=await scoped('sacks',b.id,c);if(s.status!=='active')throw new StoreError('Khncha déjà clôturée.');await run("UPDATE sacks SET closed=?,closed_by=?,status='closed',reason=? WHERE id=?",new Date().toISOString(),u.name,label(b.reason),s.id);return {};}
  if(type==='inventory-delete'){
   const item=await scoped('inventory',b.id,c);
   if(item.unit==='sac'||(await all('SELECT catalog_key, recipe FROM products WHERE cafe_id=? AND active=1',c))
    .some(product=>tracksBottle(product)&&Object.hasOwn(JSON.parse(product.recipe),item.id))){
    throw new StoreError('Cet article est lié au suivi café ou à une recette.');
   }
   await run('UPDATE inventory SET archived=1 WHERE id=? AND cafe_id=?',item.id,c);
   return {};
  }
  if(type==='inventory'){
   const name=label(b.name),threshold=positive(b.threshold),cost=money(b.cost);
   if(b.id){
    const item=await scoped('inventory',b.id,c);
    if(item.archived)throw new StoreError('Cet article ne fait plus partie du stock actif.');
    await run('UPDATE inventory SET name=?,threshold=?,cost=? WHERE id=? AND cafe_id=?',item.unit==='sac'?item.name:name,threshold,cost,item.id,c);
   }else{
    const unit=label(b.unit);
    if(!['unité','kg','litre','sac'].includes(unit))throw new StoreError('Unité de stock invalide.');
    await run('INSERT INTO inventory(cafe_id,name,unit,quantity,threshold,cost) VALUES(?,?,?,?,?,?)',c,name,unit,0,threshold,cost);
   }
   return {};
  }
  if(type==='product-delete'){
   const product=await scoped('products',b.id,c);
   await run('UPDATE products SET active=0 WHERE id=? AND cafe_id=?',product.id,c);
   return {};
  }
  if(type==='product'){const existing=b.id?await scoped('products',b.id,c):null;const image=b.image_path===undefined?(existing?.image_path??null):(b.image_path||null);if(image&&image!==existing?.image_path&&!validProductImage(image))throw new StoreError('Photo de produit invalide.');const recipe=b.recipe===undefined&&existing?JSON.parse(existing.recipe):{};for(const [id,q]of Object.entries(b.recipe||{})){if((await scoped('inventory',id,c)).archived)throw new StoreError('Cet article ne fait plus partie du stock actif.');recipe[id]=positive(q);}const category=label(b.category);await run('INSERT INTO menu_categories(cafe_id,name) VALUES(?,?) ON CONFLICT DO NOTHING',c,category);const price=money(b.price),e=Number(b.equivalent||0);if(!Number.isFinite(e)||e<0||e>10)throw new StoreError('Équivalent café invalide.');
   if(existing){await run('UPDATE products SET name=?,category=?,price=?,equivalent=?,recipe=?,image_path=? WHERE id=? AND cafe_id=?',label(b.name),label(b.category),price,e,JSON.stringify(recipe),image,b.id,c);}else await run('INSERT INTO products(cafe_id,name,category,price,equivalent,recipe,image_path) VALUES(?,?,?,?,?,?,?)',c,label(b.name),label(b.category),price,e,JSON.stringify(recipe),image);return {};}
  if(type==='employee'){await run('INSERT INTO employees(cafe_id,name,role,wage) VALUES(?,?,?,?)',c,label(b.name),label(b.role),money(b.wage));return {};}
  if(type==='workday'){const e=await scoped('employees',b.employee_id,c);await unlocked(c,d);await run('INSERT INTO workdays(cafe_id,employee_id,date,wage) VALUES(?,?,?,?)',c,e.id,d,e.wage);return {};}
  if(type==='movement'){
   await unlocked(c,d);const kinds=['expense','purchase','salary','advance','withdrawal','adjustment'];if(!kinds.includes(b.kind))throw new StoreError('Type invalide.');if(!['cash','card','bank'].includes(b.payment))throw new StoreError('Mode de paiement invalide.');
   const amount=money(b.amount);if(!amount&&b.kind!=='adjustment')throw new StoreError('Le montant doit être supérieur à zéro.');
   const customer=null;const employee=['salary','advance'].includes(b.kind)?(await scoped('employees',b.employee_id,c)).id:null;
   let inventory=null,q=null;if(['purchase','adjustment'].includes(b.kind)){inventory=(await scoped('inventory',b.inventory_id,c)).id;q=positive(b.quantity);const item=await scoped('inventory',inventory,c);if(item.archived)throw new StoreError('Cet article ne fait plus partie du stock actif.');if(b.purchase_unit&&b.purchase_unit!=='unit'&&b.purchase_unit!=='pack6')throw new StoreError('Conditionnement invalide.');if(b.purchase_unit==='pack6'){if(!Number.isInteger(q))throw new StoreError('Le nombre de lots doit être entier.');if(b.kind!=='purchase'||item.unit!=='sac'||item.name!=='Khnchas café')throw new StoreError('Le lot de 6 est réservé aux khnchas café de 1 kg.');q*=6;}if(item.unit==='sac'&&!Number.isInteger(q))throw new StoreError('Le nombre de khnchas doit être entier.');if(b.kind==='adjustment'&&b.direction==='out')q=-q;const i=await scoped('inventory',inventory,c);if(i.quantity+q<0)throw new StoreError('Le stock ne peut pas devenir négatif.');await moveStock(c,inventory,q,b.kind==='purchase'?'Achat':'Ajustement : '+label(b.label));if(b.kind==='purchase')await run('UPDATE inventory SET cost=? WHERE id=?',Math.round(amount/q),inventory);}
   await run('INSERT INTO movements(cafe_id,date,kind,category,label,amount,payment,customer_id,employee_id,inventory_id,quantity,user_name,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',c,d,b.kind,label(b.category||b.kind),label(b.label),amount,b.payment,customer,employee,inventory,q,u.name,new Date().toISOString());return {};
  }
  if(type==='close'){await unlocked(c,d);const opening=money(b.opening),counted=money(b.counted);await run('INSERT INTO closings(cafe_id,date,opening,counted,expected,user_name,created) VALUES(?,?,?,?,?,?,?)',c,d,opening,counted,await cashExpected(c,d,opening),u.name,new Date().toISOString());return {};}
  throw new StoreError('Action inconnue.');
 });
 if(result.accountPinRejected)throw new StoreError('Code manager incorrect.',403);
 if(result.pinError)throw new StoreError(result.pinError,result.pinError===pinLocked?423:400);
 return result;
 }
 return {db,state,action,session,login,logout:async token=>await run('DELETE FROM sessions WHERE token=?',token),cashExpected,credit,close:()=>db.$disconnect()};
}
let singleton;export const store=()=>singleton??=openStore().catch(error=>{singleton=undefined;throw error;});
