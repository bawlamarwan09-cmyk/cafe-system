import { additionalMenuPhotos, catalogProducts, coffeePhotos, juiceCatalog, productImages } from './drink-catalog.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const tracksStock = product => product.category!=='Jus'&&!String(product.catalog_key||'').startsWith('juice-');
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone:'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date());
const money = v => { const n=Number(v); if(!Number.isFinite(n)||n<0||n>10000000) throw Error('Montant invalide.'); return Math.round(n*100); };
const positive = v => {const n=Number(v);if(!Number.isFinite(n)||n<=0||n>1000000)throw Error('Quantité invalide.');return n;};
const label = v => { const s=String(v||'').trim();if(!s||s.length>240)throw Error('Libellé requis (240 caractères maximum).');return s;};
const date = v => {if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v))||Number.isNaN(Date.parse(v+'T12:00:00Z'))||new Date(v+'T12:00:00Z').toISOString().slice(0,10)!==v)throw Error('Date invalide.');return v;};
const hash = pin => scryptSync(pin,'monalisa-local-v1',64).toString('hex');
export function openStore(path = process.env.MONALISA_DB || join(process.cwd(),'data','monalisa.sqlite')) {
 mkdirSync(dirname(path),{recursive:true}); const db=new DatabaseSync(path);
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS cafes(id INTEGER PRIMARY KEY,name TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,cafe_id INTEGER NOT NULL,name TEXT,username TEXT UNIQUE,pin TEXT,role TEXT);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER,expires INTEGER);
 CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY,count INTEGER,reset INTEGER);
 CREATE TABLE IF NOT EXISTS inventory(id INTEGER PRIMARY KEY,cafe_id INTEGER,name TEXT,unit TEXT,quantity REAL,threshold REAL,cost INTEGER);
 CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY,cafe_id INTEGER,name TEXT,category TEXT,price INTEGER,equivalent REAL,recipe TEXT,active INTEGER DEFAULT 1);
 CREATE TABLE IF NOT EXISTS sacks(id INTEGER PRIMARY KEY,cafe_id INTEGER,opened TEXT,closed TEXT,opened_by TEXT,closed_by TEXT,equivalents REAL DEFAULT 0,status TEXT,reason TEXT,weight_kg REAL NOT NULL DEFAULT 1);
 CREATE UNIQUE INDEX IF NOT EXISTS one_active_sack ON sacks(cafe_id) WHERE status='active';
 CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY,cafe_id INTEGER,name TEXT,phone TEXT);
 CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY,cafe_id INTEGER,created TEXT,date TEXT,user_name TEXT,lines TEXT,total INTEGER,payment TEXT,customer_id INTEGER,sack_id INTEGER,equivalents REAL,status TEXT DEFAULT 'confirmed',request_key TEXT UNIQUE,cancel_reason TEXT);
 CREATE TABLE IF NOT EXISTS movements(id INTEGER PRIMARY KEY,cafe_id INTEGER,date TEXT,kind TEXT,category TEXT,label TEXT,amount INTEGER,payment TEXT,customer_id INTEGER,employee_id INTEGER,inventory_id INTEGER,quantity REAL,user_name TEXT,created TEXT);
 CREATE TABLE IF NOT EXISTS stock_moves(id INTEGER PRIMARY KEY,cafe_id INTEGER,inventory_id INTEGER,quantity REAL,reason TEXT,order_id INTEGER,created TEXT);
 CREATE TABLE IF NOT EXISTS employees(id INTEGER PRIMARY KEY,cafe_id INTEGER,name TEXT,role TEXT,wage INTEGER);
 CREATE TABLE IF NOT EXISTS employee_order_pins(cafe_id INTEGER NOT NULL,employee_id INTEGER NOT NULL,salt TEXT NOT NULL,pin_hash TEXT NOT NULL,PRIMARY KEY(cafe_id,employee_id));
 CREATE TABLE IF NOT EXISTS order_pin_locks(cafe_id INTEGER NOT NULL,employee_id INTEGER NOT NULL,reported_at TEXT NOT NULL,terminal_user TEXT NOT NULL,PRIMARY KEY(cafe_id,employee_id));
 CREATE TABLE IF NOT EXISTS workdays(id INTEGER PRIMARY KEY,cafe_id INTEGER,employee_id INTEGER,date TEXT,wage INTEGER,UNIQUE(cafe_id,employee_id,date));
 CREATE TABLE IF NOT EXISTS closings(id INTEGER PRIMARY KEY,cafe_id INTEGER,date TEXT,opening INTEGER,counted INTEGER,expected INTEGER,user_name TEXT,created TEXT,UNIQUE(cafe_id,date));`);
 const all=(s,...p)=>db.prepare(s).all(...p); const get=(s,...p)=>db.prepare(s).get(...p);const run=(s,...p)=>db.prepare(s).run(...p);
 const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
 if(!all('PRAGMA table_info(orders)').some(x=>x.name==='waiter_id'))db.exec('ALTER TABLE orders ADD COLUMN waiter_id INTEGER');
 if(!all('PRAGMA table_info(orders)').some(x=>x.name==='revision'))db.exec('ALTER TABLE orders ADD COLUMN revision INTEGER NOT NULL DEFAULT 0');
 db.exec('CREATE TABLE IF NOT EXISTS order_events(id INTEGER PRIMARY KEY,cafe_id INTEGER,order_id INTEGER,kind TEXT,reason TEXT,user_name TEXT,created TEXT,before_json TEXT,after_json TEXT)');
 // Legacy bags were recorded as 6 kg. Convert sealed inventory into 1 kg bags
 // once, while preserving the original weight of historical/open bags.
 if(!all('PRAGMA table_info(sacks)').some(column=>column.name==='weight_kg'))tx(()=>{
  db.exec('ALTER TABLE sacks ADD COLUMN weight_kg REAL NOT NULL DEFAULT 6');
  for(const coffee of all("SELECT * FROM inventory WHERE name='Khnchas café' AND unit='sac'")){
   run('UPDATE inventory SET quantity=quantity*6,threshold=threshold*6,cost=ROUND(cost/6.0) WHERE id=?',coffee.id);
   run('UPDATE stock_moves SET quantity=quantity*6 WHERE inventory_id=? AND cafe_id=?',coffee.id,coffee.cafe_id);
   run('UPDATE movements SET quantity=quantity*6 WHERE inventory_id=? AND cafe_id=?',coffee.id,coffee.cafe_id);
  }
 });
 // Preserve unassigned historical sacks; never infer a barman from the manager.
 tx(()=>{
  const columns=all('PRAGMA table_info(sacks)');
  if(!columns.some(column=>column.name==='barista_id'))db.exec('ALTER TABLE sacks ADD COLUMN barista_id INTEGER');
  if(!columns.some(column=>column.name==='barista_name'))db.exec('ALTER TABLE sacks ADD COLUMN barista_name TEXT');
 });
 if(!get('SELECT id FROM cafes LIMIT 1'))tx(()=>{
  const managerPin=process.env.MONALISA_MANAGER_PIN;
  const cashierPin=process.env.MONALISA_CASHIER_PIN;
  if(process.env.NODE_ENV==='production'&&(
   !/^\d{8,12}$/.test(managerPin||'')||!/^\d{8,12}$/.test(cashierPin||'')||managerPin===cashierPin
  ))throw Error('Configurez deux codes de production distincts de 8 à 12 chiffres.');
  run('INSERT INTO cafes VALUES(1,?)','Monalisa Café');
  run('INSERT INTO users VALUES(1,1,?,?,?,?)','Marouane','manager',hash(managerPin||'2026'),'manager');
  run('INSERT INTO users VALUES(2,1,?,?,?,?)','Caissier','caisse',hash(cashierPin||'1234'),'cashier');
  const items=[['Khnchas café','sac',24,6,7000],['Eau minérale 50 cl','unité',48,12,250],['Coca-Cola','unité',36,12,450],['Hawaï','unité',24,8,450],['Lait','litre',12,4,950],['Thé','kg',2,0.5,8000],['Sucre','kg',8,2,700],['Oranges','kg',15,3,700]];
  items.forEach(x=>run('INSERT INTO inventory(cafe_id,name,unit,quantity,threshold,cost) VALUES(1,?,?,?,?,?)',...x));
  const products=[['Café noir','Cafés',1000,1,{'7':0.008}],['Café au lait','Cafés',1200,0.5,{'5':0.12,'7':0.008}],['Café double','Cafés',1600,2,{'7':0.008}],['Cappuccino','Cafés',1800,1,{'5':0.15,'7':0.008}],['Thé à la menthe','Thés',1000,0,{'6':0.006,'7':0.02}],['Eau minérale','Boissons',700,0,{'2':1}],['Coca-Cola','Boissons',1000,0,{'3':1}],['Hawaï','Boissons',1000,0,{'4':1}],['Jus d’orange','Jus',1500,0,{'8':0.3}],['Lait chaud','Boissons',1000,0,{'5':0.2}]];
  products.forEach(([n,c,p,e,r])=>run('INSERT INTO products(cafe_id,name,category,price,equivalent,recipe) VALUES(1,?,?,?,?,?)',n,c,p,e,JSON.stringify(r)));
  [['Bachir','Barista',19000],['Serveur','Service',15000],['Samira','Entretien',10000]].forEach(x=>run('INSERT INTO employees(cafe_id,name,role,wage) VALUES(1,?,?,?)',...x));
 });
 // Match legacy products once; catalog keys survive renames and preserve custom prices/recipes.
 tx(()=>{
  if(!all('PRAGMA table_info(inventory)').some(x=>x.name==='archived'))db.exec('ALTER TABLE inventory ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
  const columns=all('PRAGMA table_info(products)');
  if(!columns.some(x=>x.name==='image_path'))db.exec('ALTER TABLE products ADD COLUMN image_path TEXT');
  if(!columns.some(x=>x.name==='catalog_key'))db.exec('ALTER TABLE products ADD COLUMN catalog_key TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS product_catalog_key ON products(cafe_id,catalog_key) WHERE catalog_key IS NOT NULL');
  db.exec('CREATE TABLE IF NOT EXISTS catalog_migrations(cafe_id INTEGER,version INTEGER,PRIMARY KEY(cafe_id,version))');
  for(const cafe of all('SELECT id FROM cafes'))for(const item of catalogProducts){
   if(get('SELECT id FROM products WHERE cafe_id=? AND catalog_key=?',cafe.id,item.key))continue;
   const names=[item.name,...item.aliases];
   const existing=all('SELECT * FROM products WHERE cafe_id=? AND catalog_key IS NULL',cafe.id).find(p=>names.some(n=>n.toLowerCase()===p.name.toLowerCase()));
   if(existing){run('UPDATE products SET catalog_key=?,image_path=COALESCE(image_path,?) WHERE id=?',item.key,item.image_path,existing.id);continue;}
   if(item.stock_tracked===false){run("INSERT INTO products(cafe_id,name,category,price,equivalent,recipe,image_path,catalog_key) VALUES(?,?,?,?,0,'{}',?,?)",cafe.id,item.name,item.category,Math.round(item.price*100),item.image_path,item.key);continue;}
   let stock=all('SELECT * FROM inventory WHERE cafe_id=?',cafe.id).find(i=>names.some(n=>n.toLowerCase()===i.name.toLowerCase()));
   if(!stock){const added=run("INSERT INTO inventory(cafe_id,name,unit,quantity,threshold,cost) VALUES(?,?,?,0,6,0)",cafe.id,item.stock_name||item.name,item.stock_unit||'unité');stock={id:Number(added.lastInsertRowid)};}
   run('INSERT INTO products(cafe_id,name,category,price,equivalent,recipe,image_path,catalog_key) VALUES(?,?,?,?,0,?,?,?)',cafe.id,item.name,item.category,Math.round(item.price*100),JSON.stringify({[stock.id]:1}),item.image_path,item.key);
  }
  // Retain historical juice portions and movements, but remove them from active stock.
  for(const product of all("SELECT * FROM products WHERE catalog_key LIKE 'juice-%'"))for(const id of Object.keys(JSON.parse(product.recipe))){
   if(!all('SELECT * FROM products WHERE cafe_id=?',product.cafe_id).some(p=>tracksStock(p)&&Object.hasOwn(JSON.parse(p.recipe),id)))run("UPDATE inventory SET archived=1 WHERE cafe_id=? AND id=? AND unit='portion'",product.cafe_id,Number(id));
  }
  for(const cafe of all('SELECT id FROM cafes'))if(!get('SELECT version FROM catalog_migrations WHERE cafe_id=? AND version=1',cafe.id)){
   run("UPDATE products SET category='Sodas' WHERE cafe_id=? AND catalog_key IN ('coca-cola','hawai-tropical') AND category='Boissons'",cafe.id);
   run('INSERT INTO catalog_migrations VALUES(?,1)',cafe.id);
  }
  for (const cafe of all('SELECT id FROM cafes')) {
   if (get('SELECT version FROM catalog_migrations WHERE cafe_id=? AND version=2', cafe.id)) continue;
   for (const coffee of coffeePhotos) {
    for (const name of [coffee.name, ...coffee.aliases]) {
     run("UPDATE products SET image_path=? WHERE cafe_id=? AND category='Cafés' AND name=? COLLATE NOCASE AND COALESCE(image_path,'')=''", coffee.image_path, cafe.id, name);
    }
   }
   run('INSERT INTO catalog_migrations VALUES(?,2)', cafe.id);
  }
  for (const cafe of all('SELECT id FROM cafes')) {
   if (get('SELECT version FROM catalog_migrations WHERE cafe_id=? AND version=3', cafe.id)) continue;
   for (const photo of additionalMenuPhotos) {
    run("UPDATE products SET image_path=? WHERE cafe_id=? AND category=? AND name=? COLLATE NOCASE AND COALESCE(image_path,'')=''", photo.image_path, cafe.id, photo.category, photo.name);
   }
   for (const juice of juiceCatalog) {
    run('UPDATE products SET image_path=? WHERE cafe_id=? AND catalog_key=? AND image_path=?', juice.image_path, cafe.id, juice.key, `/products/${juice.key}.svg`);
   }
   run('INSERT INTO catalog_migrations VALUES(?,3)', cafe.id);
  }
  for (const cafe of all('SELECT id FROM cafes')) {
   if (get('SELECT version FROM catalog_migrations WHERE cafe_id=? AND version=4', cafe.id)) continue;
   for (const juice of juiceCatalog.filter(juice=>juice.image_path.endsWith('.webp'))) {
    run('UPDATE products SET image_path=? WHERE cafe_id=? AND image_path=?', juice.image_path, cafe.id, `/products/${juice.key}.jpg`);
   }
   run('INSERT INTO catalog_migrations VALUES(?,4)', cafe.id);
  }
  for (const cafe of all('SELECT id FROM cafes')) {
   if (get('SELECT version FROM catalog_migrations WHERE cafe_id=? AND version=5', cafe.id)) continue;
   for (const photo of [...coffeePhotos, ...additionalMenuPhotos].filter(photo=>photo.image_path.endsWith('.webp'))) {
    run('UPDATE products SET image_path=? WHERE cafe_id=? AND image_path=?', photo.image_path, cafe.id, photo.image_path.replace(/\.webp$/, '.jpg'));
   }
   run('INSERT INTO catalog_migrations VALUES(?,5)', cafe.id);
  }
 });
 const scoped=(table,id,c)=>{const r=get(`SELECT * FROM ${table} WHERE id=? AND cafe_id=?`,Number(id),c);if(!r)throw Error('Élément introuvable.');return r;};
 const manager=u=>{if(u.role!=='manager')throw Error('Cette action est réservée au manager.');};
 const unlocked=(c,d)=>{if(get('SELECT id FROM closings WHERE cafe_id=? AND date=?',c,d))throw Error('Cette journée est clôturée.');};
 const moveStock=(c,id,q,reason,order=null)=>{scoped('inventory',id,c);run('UPDATE inventory SET quantity=quantity+? WHERE id=? AND cafe_id=?',q,id,c);run('INSERT INTO stock_moves(cafe_id,inventory_id,quantity,reason,order_id,created) VALUES(?,?,?,?,?,?)',c,id,q,reason,order,new Date().toISOString());};
 const credit=(c,id)=>Number(get(`SELECT COALESCE((SELECT SUM(total) FROM orders WHERE cafe_id=? AND customer_id=? AND payment='credit' AND status='confirmed'),0)-COALESCE((SELECT SUM(amount) FROM movements WHERE cafe_id=? AND customer_id=? AND kind='repayment'),0) balance`,c,id,c,id).balance);
 const sum=(c,d,kind)=>Number(get('SELECT COALESCE(SUM(amount),0) n FROM movements WHERE cafe_id=? AND date=? AND kind=?',c,d,kind).n);
 const cashExpected=(c,d,opening)=>opening+Number(get("SELECT COALESCE(SUM(total),0) n FROM orders WHERE cafe_id=? AND date=? AND payment='cash' AND status='confirmed'",c,d).n)+Number(get("SELECT COALESCE(SUM(CASE WHEN kind='repayment' THEN amount ELSE -amount END),0) n FROM movements WHERE cafe_id=? AND date=? AND payment='cash'",c,d).n);
 const waiterPin=(c,id)=>get('SELECT e.id,e.name,p.salt,p.pin_hash FROM employee_order_pins p JOIN employees e ON e.id=p.employee_id AND e.cafe_id=p.cafe_id WHERE p.cafe_id=? AND p.employee_id=?',c,id);
 const pinMatches=(pin,record)=>timingSafeEqual(scryptSync(pin,record.salt,64),Buffer.from(record.pin_hash,'hex'));
 const pinAttemptKey=(c,id)=>`order-pin-v2:${c}:${id}`;
 const pinLocked='Serveur bloqué après 3 PIN incorrects. Seul le manager peut le débloquer avec un nouveau PIN.';
 function verifyOrderPin(u,waiter,pin){
  const c=u.cafe_id;
  if(get('SELECT 1 FROM order_pin_locks WHERE cafe_id=? AND employee_id=?',c,waiter.id))throw Error(pinLocked);
  const key=pinAttemptKey(c,waiter.id);
  if(pinMatches(pin,waiter)){run('DELETE FROM attempts WHERE key=?',key);return null;}
  run('INSERT INTO attempts VALUES(?,1,0) ON CONFLICT(key) DO UPDATE SET count=count+1',key);
  if(get('SELECT count FROM attempts WHERE key=?',key).count<3)return 'PIN du serveur incorrect.';
  run('INSERT INTO order_pin_locks VALUES(?,?,?,?)',c,waiter.id,new Date().toISOString(),u.name);
  return pinLocked;
 }
 function login(username,pin,key='local'){
  key=String(key).slice(0,200); const now=Date.now(), a=get('SELECT * FROM attempts WHERE key=?',key);
  if(a&&a.reset>now&&a.count>=8)throw Error('Trop de tentatives. Réessayez dans 15 minutes.');
  const u=get('SELECT * FROM users WHERE username=?',String(username).toLowerCase());const candidate=Buffer.from(hash(String(pin)),'hex');
  if(!u||(process.env.NODE_ENV==='production'&&['2026','1234'].includes(String(pin)))||!timingSafeEqual(Buffer.from(u.pin,'hex'),candidate)){run('INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset<? THEN 1 ELSE count+1 END,reset=CASE WHEN reset<? THEN ? ELSE reset END',key,now+900000,now,now,now+900000);throw Error('Identifiant ou code incorrect.');}
  run('DELETE FROM attempts WHERE key=?',key);run('DELETE FROM sessions WHERE expires<?',now);const token=randomBytes(32).toString('hex');run('INSERT INTO sessions VALUES(?,?,?)',token,u.id,now+12*3600000);return token;
 }
 function session(token){return get('SELECT u.id,u.cafe_id,u.name,u.role,c.name cafe_name FROM sessions s JOIN users u ON s.user_id=u.id JOIN cafes c ON c.id=u.cafe_id WHERE s.token=? AND s.expires>?',token||'',Date.now());}
 function state(u,selectedDate=today()){const day=date(selectedDate);const c=u.cafe_id;const customers=[];
  const result={user:u,today:today(),coffeeReady:!!get("SELECT id FROM sacks WHERE cafe_id=? AND status='active'",c),products:all('SELECT * FROM products WHERE cafe_id=? AND active=1',c).map(x=>({...x,recipe:JSON.parse(x.recipe)})),inventory:all('SELECT * FROM inventory WHERE cafe_id=? AND archived=0',c),sacks:all('SELECT * FROM sacks WHERE cafe_id=? ORDER BY id DESC',c),customers,orders:all('SELECT * FROM orders WHERE cafe_id=? ORDER BY id DESC',c).map(x=>({...x,lines:JSON.parse(x.lines)})),movements:all('SELECT * FROM movements WHERE cafe_id=? ORDER BY id DESC',c),employees:all('SELECT * FROM employees WHERE cafe_id=?',c),workdays:all('SELECT * FROM workdays WHERE cafe_id=?',c),closings:all('SELECT * FROM closings WHERE cafe_id=? ORDER BY date DESC',c),stockMoves:all('SELECT * FROM stock_moves WHERE cafe_id=? ORDER BY id DESC LIMIT 200',c),accounts:u.role==='manager'?all('SELECT id,name,username,role FROM users WHERE cafe_id=?',c):[]};
  result.orderWaiters=all('SELECT e.id,e.name FROM employee_order_pins p JOIN employees e ON e.id=p.employee_id AND e.cafe_id=p.cafe_id WHERE p.cafe_id=? ORDER BY e.name,e.id',c);
  const locks=all('SELECT employee_id,reported_at,terminal_user FROM order_pin_locks WHERE cafe_id=?',c);
  result.orderWaiters=result.orderWaiters.map(w=>locks.some(l=>l.employee_id===w.id)?{...w,locked:true}:w);
  if(u.role==='manager')result.orderPinAlerts=locks.map(l=>({...l,name:result.orderWaiters.find(w=>w.id===l.employee_id)?.name}));
  result.products=result.products.map(p=>tracksStock(p)?({...p,stock_tracked:true,available:(!p.equivalent||result.coffeeReady)&&Object.entries(p.recipe).every(([id,q])=>(result.inventory.find(i=>i.id===Number(id))?.quantity||0)+0.000001>=q)}):({...p,recipe:{},equivalent:0,stock_tracked:false,available:true}));
  if(u.role==='manager'){const events=all('SELECT order_id,kind,reason,user_name,created FROM order_events WHERE cafe_id=? ORDER BY id DESC',c);result.orders=result.orders.map(o=>({...o,changes:events.filter(e=>e.order_id===o.id)}));}
  if(u.role!=='manager'){for(const key of ['inventory','sacks','stockMoves','employees','workdays','closings'])result[key]=[];result.products=result.products.map(({recipe,equivalent,...p})=>p);result.movements=result.movements.filter(m=>m.date===day).map(({date,kind,amount,payment})=>({date,kind,amount,payment}));}
  return result;
 }
 function action(u,type,b){const c=u.cafe_id,d=date(b.date||today()); const result=tx(()=>{
  if(type==='order'){
   let waiter = null;
   if (get('SELECT 1 FROM employee_order_pins WHERE cafe_id=? LIMIT 1', c)) {
    if (!Number.isSafeInteger(b.waiter_id) || !/^\d{4}$/.test(String(b.waiter_pin ?? ''))) {
     throw Error('Choisissez le serveur et saisissez son PIN à 4 chiffres.');
    }
    waiter = waiterPin(c,b.waiter_id);
    if (!waiter) throw Error('Choisissez un serveur avec un PIN de commande.');
    const pinError=verifyOrderPin(u,waiter,String(b.waiter_pin));
    if(pinError)return {pinError};
   }
   const key=label(b.key),existing=get('SELECT * FROM orders WHERE request_key=?',`${c}:${key}`);if(existing){const original=JSON.parse(existing.lines).map(l=>({id:l.id,qty:l.qty}));const incoming=Array.isArray(b.lines)?b.lines.map(l=>({id:Number(l.id),qty:Number(l.qty)})):[];if((existing.waiter_id??null)!==(waiter?.id??null)||JSON.stringify(original)!==JSON.stringify(incoming)||existing.payment!==b.payment||(existing.customer_id||null)!==(b.payment==='credit'?Number(b.customer_id):null))throw Error('Cette clé correspond à une autre commande. Rechargez le panier avant de réessayer.');return {id:existing.id};}unlocked(c,d);
   if(!['cash','card'].includes(b.payment))throw Error('Mode de paiement invalide.');
   if(!Array.isArray(b.lines)||!b.lines.length||b.lines.length>100)throw Error('Panier vide ou trop grand.');
   let total=0,equivalents=0;const consumption={};const lines=b.lines.map(l=>{const p=scoped('products',l.id,c);if(!p.active)throw Error('Produit désactivé.');const qty=positive(l.qty);if(!Number.isInteger(qty)||qty>100)throw Error('Quantité de commande invalide.');total+=p.price*qty;equivalents+=(tracksStock(p)?p.equivalent:0)*qty;for(const [id,q] of Object.entries(tracksStock(p)?JSON.parse(p.recipe):{}))consumption[id]=(consumption[id]||0)+q*qty;return {id:p.id,name:p.name,qty,price:p.price,equivalent:tracksStock(p)?p.equivalent:0};});
   if(b.expected_total!==undefined&&(!Number.isSafeInteger(b.expected_total)||b.expected_total!==total))throw Error('Les prix ont changé. Revenez au panier pour vérifier le nouveau total.');
   const sack=get("SELECT * FROM sacks WHERE cafe_id=? AND status='active'",c);if(equivalents&&!sack)throw Error('Le manager doit ouvrir une khncha avant de vendre du café.');
   for(const [id,q] of Object.entries(consumption)){const i=scoped('inventory',id,c);if(i.quantity+0.000001<q)throw Error(`Stock insuffisant : ${i.name}.`);}
   const customer=null;
   const r=run('INSERT INTO orders(cafe_id,created,date,user_name,lines,total,payment,customer_id,sack_id,equivalents,request_key,waiter_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',c,new Date().toISOString(),d,waiter?.name??u.name,JSON.stringify(lines),total,b.payment,customer,equivalents?sack.id:null,equivalents,`${c}:${key}`,waiter?.id??null);const id=Number(r.lastInsertRowid);
   for(const [item,q] of Object.entries(consumption))moveStock(c,Number(item),-q,'Vente',id);
   if(equivalents)run('UPDATE sacks SET equivalents=equivalents+? WHERE id=?',equivalents,sack.id);return {id};
  }
  if(type==='order-edit'){
   manager(u);const o=scoped('orders',b.id,c);unlocked(c,o.date);const reason=label(b.reason);
   if(o.status!=='confirmed')throw Error('Commande déjà annulée.');
   if(!Number.isInteger(b.revision)||b.revision!==o.revision)throw Error('La commande a changé. Rechargez avant de réessayer.');
   if(o.payment==='credit')throw Error('Cette ancienne vente à crédit ne peut pas être modifiée.');
   if(o.sack_id&&scoped('sacks',o.sack_id,c).status!=='active')throw Error('Khncha clôturée : cette commande ne peut plus être modifiée.');
   if(!['cash','card'].includes(b.payment))throw Error('Mode de paiement invalide.');
   if(!Array.isArray(b.lines)||!b.lines.length||b.lines.length>100)throw Error('Panier vide ou trop grand.');
   const previous=JSON.parse(o.lines),seen=new Set(),consumption={};let total=0,equivalents=0;
   const lines=b.lines.map(line=>{
    const p=scoped('products',line.id,c),old=previous.find(l=>l.id===p.id),qty=positive(line.qty);
    if(seen.has(p.id))throw Error('Produit en double dans la commande.');seen.add(p.id);
    if(!p.active||!Number.isInteger(qty)||qty>100)throw Error('Quantité de commande invalide.');
    const price=old?.price??p.price,equivalent=tracksStock(p)?(old?.equivalent??p.equivalent):0;
    total+=price*qty;equivalents+=equivalent*qty;
    for(const [id,q] of Object.entries(tracksStock(p)?JSON.parse(p.recipe):{}))consumption[id]=(consumption[id]||0)+q*qty;
    return {id:p.id,name:old?.name??p.name,qty,price,equivalent};
   });
   if(!Number.isSafeInteger(b.expected_total)||b.expected_total!==total)throw Error('Les prix ont changé. Revenez au panier pour vérifier le nouveau total.');
   const sack=o.sack_id?scoped('sacks',o.sack_id,c):get("SELECT * FROM sacks WHERE cafe_id=? AND status='active'",c);
   if(equivalents&&!sack)throw Error('Le manager doit ouvrir une khncha avant de vendre du café.');
   const originalStock=all('SELECT inventory_id,SUM(quantity) quantity FROM stock_moves WHERE cafe_id=? AND order_id=? GROUP BY inventory_id',c,o.id);
   for(const stock of originalStock)if(stock.quantity)moveStock(c,stock.inventory_id,-stock.quantity,'Correction commande',o.id);
   for(const [id,q] of Object.entries(consumption)){const item=scoped('inventory',id,c);if(item.archived||item.quantity+0.000001<q)throw Error(`Stock insuffisant : ${item.name}.`);}
   for(const [id,q] of Object.entries(consumption))moveStock(c,Number(id),-q,'Vente',o.id);
   if(o.sack_id)run('UPDATE sacks SET equivalents=equivalents-? WHERE id=?',o.equivalents,o.sack_id);
   if(equivalents)run('UPDATE sacks SET equivalents=equivalents+? WHERE id=?',equivalents,sack.id);
   run('UPDATE orders SET lines=?,total=?,payment=?,sack_id=?,equivalents=?,revision=revision+1 WHERE id=? AND cafe_id=?',JSON.stringify(lines),total,b.payment,equivalents?sack.id:null,equivalents,o.id,c);
   const updated=scoped('orders',o.id,c);
   run('INSERT INTO order_events(cafe_id,order_id,kind,reason,user_name,created,before_json,after_json) VALUES(?,?,?,?,?,?,?,?)',c,o.id,'edit',reason,u.name,new Date().toISOString(),JSON.stringify(o),JSON.stringify(updated));
   return {id:o.id};
  }
  if(type==='cancel'){
   manager(u);const o=scoped('orders',b.id,c);unlocked(c,o.date);if(o.status!=='confirmed')throw Error('Commande déjà annulée.');if(b.revision!==undefined&&b.revision!==o.revision)throw Error('La commande a changé. Rechargez avant de réessayer.');
   if(o.sack_id&&scoped('sacks',o.sack_id,c).status!=='active')throw Error('Khncha clôturée : correction à examiner avant annulation.');
   if(o.payment==='credit'&&credit(c,o.customer_id)<o.total)throw Error('Crédit déjà remboursé : corrigez le remboursement avant annulation.');
   run("UPDATE orders SET status='cancelled',cancel_reason=?,revision=revision+1 WHERE id=?",label(b.reason),o.id);for(const m of all('SELECT inventory_id,SUM(quantity) quantity FROM stock_moves WHERE order_id=? AND cafe_id=? GROUP BY inventory_id',o.id,c))moveStock(c,m.inventory_id,-m.quantity,'Annulation',o.id);
   if(o.sack_id)run('UPDATE sacks SET equivalents=equivalents-? WHERE id=?',o.equivalents,o.sack_id);run('INSERT INTO order_events(cafe_id,order_id,kind,reason,user_name,created,before_json,after_json) VALUES(?,?,?,?,?,?,?,?)',c,o.id,'delete',label(b.reason),u.name,new Date().toISOString(),JSON.stringify(o),JSON.stringify(scoped('orders',o.id,c)));return {};
  }
  if(type==='customer')throw Error('Le module crédit est désactivé.');
  if (type==='employee-order-pin' || type==='change-order-pin') {
   if(type==='employee-order-pin')manager(u);
   const employee = scoped('employees', b.employee_id, c);
   const pin = String(b.pin ?? '');
   if (!/^\d{4}$/.test(pin)) throw Error('Le PIN de commande doit contenir 4 chiffres.');
   const previous=waiterPin(c,employee.id);
   if(type==='change-order-pin'){
    const oldPin=String(b.old_pin ?? '');
    if(!previous||!/^\d{4}$/.test(oldPin))throw Error('Saisissez votre ancien PIN à 4 chiffres.');
    const pinError=verifyOrderPin(u,previous,oldPin);
    if(pinError)return {pinError};
   }
   if(previous&&pinMatches(pin,previous)&&
      (type==='change-order-pin'||get('SELECT 1 FROM order_pin_locks WHERE cafe_id=? AND employee_id=?',c,employee.id))){
    throw Error('Choisissez un PIN différent de l’ancien.');
   }
   const otherPins = all('SELECT salt,pin_hash FROM employee_order_pins WHERE cafe_id=? AND employee_id<>?', c, employee.id);
   if (otherPins.some(other => pinMatches(pin,other))) {
    throw Error('Ce PIN est déjà utilisé par un autre serveur.');
   }
   const salt = randomBytes(16).toString('hex');
   const pinHash = scryptSync(pin, salt, 64).toString('hex');
   run('INSERT INTO employee_order_pins VALUES(?,?,?,?) ON CONFLICT(cafe_id,employee_id) DO UPDATE SET salt=excluded.salt,pin_hash=excluded.pin_hash', c, employee.id, salt, pinHash);
   run('DELETE FROM attempts WHERE key=?',pinAttemptKey(c,employee.id));
   run('DELETE FROM order_pin_locks WHERE cafe_id=? AND employee_id=?',c,employee.id);
   return {};
  }
  manager(u);
  if(type==='sack-assign'){
   const sack=scoped('sacks',b.id,c);
   if(sack.status!=='active'||sack.barista_id)throw Error('La khncha doit être ouverte et sans barman attribué.');
   const barista=scoped('employees',b.barista_id,c);
   run('UPDATE sacks SET barista_id=?,barista_name=? WHERE id=? AND cafe_id=?',barista.id,barista.name,sack.id,c);
   return {};
  }
  if(type==='account'){const username=label(b.username).toLowerCase();if(!/^[a-z0-9_.-]{3,40}$/.test(username))throw Error('Identifiant : 3 à 40 caractères, lettres sans accents et chiffres.');if(!/^\d{4,12}$/.test(String(b.pin)))throw Error('Le code doit contenir 4 à 12 chiffres.');if(!['manager','cashier'].includes(b.role))throw Error('Rôle invalide.');run('INSERT INTO users(cafe_id,name,username,pin,role) VALUES(?,?,?,?,?)',c,label(b.name),username,hash(String(b.pin)),b.role);return {};}
  if(type==='sack-open'){if(get("SELECT id FROM sacks WHERE cafe_id=? AND status='active'",c))throw Error('Une khncha est déjà ouverte.');const coffee=get("SELECT * FROM inventory WHERE cafe_id=? AND unit='sac' ORDER BY id LIMIT 1",c);if(!coffee||coffee.quantity<1)throw Error('Aucune khncha en stock.');const barista=b.barista_id?scoped('employees',b.barista_id,c):get("SELECT * FROM employees WHERE cafe_id=? AND (LOWER(role) IN ('barista','barman') OR role IN ('محضر القهوة','بارمان')) ORDER BY id LIMIT 1",c);if(!barista)throw Error('Sélectionnez le barman responsable.');moveStock(c,coffee.id,-1,'Ouverture khncha');run("INSERT INTO sacks(cafe_id,opened,opened_by,status,weight_kg,barista_id,barista_name) VALUES(?,?,?,'active',1,?,?)",c,new Date().toISOString(),u.name,barista.id,barista.name);return {};}
  if(type==='sack-close'){const s=scoped('sacks',b.id,c);if(s.status!=='active')throw Error('Khncha déjà clôturée.');run("UPDATE sacks SET closed=?,closed_by=?,status='closed',reason=? WHERE id=?",new Date().toISOString(),u.name,label(b.reason),s.id);return {};}
  if(type==='inventory'){run('INSERT INTO inventory(cafe_id,name,unit,quantity,threshold,cost) VALUES(?,?,?,?,?,?)',c,label(b.name),label(b.unit),0,positive(b.threshold),money(b.cost));return {};}
  if(type==='product'){const image=b.image_path===undefined?(b.id?scoped('products',b.id,c).image_path:null):(b.image_path||null);if(image&&!productImages.has(image))throw Error('Photo de produit invalide.');const recipe={};for(const [id,q]of Object.entries(b.recipe||{})){if(scoped('inventory',id,c).archived)throw Error('Cet article ne fait plus partie du stock actif.');recipe[id]=positive(q);}const price=money(b.price),e=Number(b.equivalent||0);if(!Number.isFinite(e)||e<0||e>10)throw Error('Équivalent café invalide.');
   if(b.id){scoped('products',b.id,c);run('UPDATE products SET name=?,category=?,price=?,equivalent=?,recipe=?,image_path=? WHERE id=? AND cafe_id=?',label(b.name),label(b.category),price,e,JSON.stringify(recipe),image,b.id,c);}else run('INSERT INTO products(cafe_id,name,category,price,equivalent,recipe,image_path) VALUES(?,?,?,?,?,?,?)',c,label(b.name),label(b.category),price,e,JSON.stringify(recipe),image);return {};}
  if(type==='employee'){run('INSERT INTO employees(cafe_id,name,role,wage) VALUES(?,?,?,?)',c,label(b.name),label(b.role),money(b.wage));return {};}
  if(type==='workday'){const e=scoped('employees',b.employee_id,c);unlocked(c,d);run('INSERT INTO workdays(cafe_id,employee_id,date,wage) VALUES(?,?,?,?)',c,e.id,d,e.wage);return {};}
  if(type==='movement'){
   unlocked(c,d);const kinds=['expense','purchase','salary','advance','withdrawal','adjustment'];if(!kinds.includes(b.kind))throw Error('Type invalide.');if(!['cash','card','bank'].includes(b.payment))throw Error('Mode de paiement invalide.');
   const amount=money(b.amount);if(!amount&&b.kind!=='adjustment')throw Error('Le montant doit être supérieur à zéro.');
   const customer=null;const employee=['salary','advance'].includes(b.kind)?scoped('employees',b.employee_id,c).id:null;
   let inventory=null,q=null;if(['purchase','adjustment'].includes(b.kind)){inventory=scoped('inventory',b.inventory_id,c).id;q=positive(b.quantity);const item=scoped('inventory',inventory,c);if(item.archived)throw Error('Cet article ne fait plus partie du stock actif.');if(b.purchase_unit&&b.purchase_unit!=='unit'&&b.purchase_unit!=='pack6')throw Error('Conditionnement invalide.');if(b.purchase_unit==='pack6'){if(!Number.isInteger(q))throw Error('Le nombre de lots doit être entier.');if(b.kind!=='purchase'||item.unit!=='sac'||item.name!=='Khnchas café')throw Error('Le lot de 6 est réservé aux khnchas café de 1 kg.');q*=6;}if(item.unit==='sac'&&!Number.isInteger(q))throw Error('Le nombre de khnchas doit être entier.');if(b.kind==='adjustment'&&b.direction==='out')q=-q;const i=scoped('inventory',inventory,c);if(i.quantity+q<0)throw Error('Le stock ne peut pas devenir négatif.');moveStock(c,inventory,q,b.kind==='purchase'?'Achat':'Ajustement : '+label(b.label));if(b.kind==='purchase')run('UPDATE inventory SET cost=? WHERE id=?',Math.round(amount/q),inventory);}
   run('INSERT INTO movements(cafe_id,date,kind,category,label,amount,payment,customer_id,employee_id,inventory_id,quantity,user_name,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',c,d,b.kind,label(b.category||b.kind),label(b.label),amount,b.payment,customer,employee,inventory,q,u.name,new Date().toISOString());return {};
  }
  if(type==='close'){unlocked(c,d);const opening=money(b.opening),counted=money(b.counted);run('INSERT INTO closings(cafe_id,date,opening,counted,expected,user_name,created) VALUES(?,?,?,?,?,?,?)',c,d,opening,counted,cashExpected(c,d,opening),u.name,new Date().toISOString());return {};}
  throw Error('Action inconnue.');
 });
 if(result.pinError)throw Error(result.pinError);
 return result;
 }
 return {db,state,action,session,login,logout:token=>run('DELETE FROM sessions WHERE token=?',token),cashExpected,credit,close:()=>db.close()};
}
let singleton;export const store=()=>singleton??=openStore();
