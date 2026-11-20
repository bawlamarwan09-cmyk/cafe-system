'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useTranslation, LanguageSwitcher } from '../lib/i18n.mjs';
import { additionalMenuPhotos, catalogProducts, coffeePhotos, stockBottleKeys } from '../lib/drink-catalog.mjs';
import { menuNameKey, waterOptions } from '../lib/monalisa-menu.mjs';
import {productSales} from '../lib/product-sales.mjs';
import {dailyBalance} from '../lib/daily-balance.mjs';
import SackPerformanceChart from '../components/sack-performance-chart';
import { sackPerformance, baristaPerformance, coffeePackSize, currentCoffeePack } from '../lib/coffee-performance.mjs';
import { Coffee, LayoutDashboard, ShoppingBag, Package, Wallet, Users, BarChart3, Settings, Bell, ChevronRight, Plus, Search, ArrowUpRight, ArrowDownRight, X, LogOut, Menu, Check, Printer, Download, Minus, Trash2, CalendarDays, CircleAlert, Banknote, ReceiptText, Wheat, LoaderCircle, Pencil, SlidersHorizontal, RotateCcw } from 'lucide-react';
type Row = Record<string, any>;
type State = {
    user: Row;
    receiptSettings?: Row;
    today: string;
    products: Row[];
    categories: {id:number;name:string}[];
    inventory: Row[];
    sacks: Row[];
    customers: Row[];
    orders: Row[];
    movements: Row[];
    employees: Row[];
    workdays: Row[];
    closings: Row[];
    stockMoves: Row[];
    accounts: Row[];
    coffeeReady: boolean;
    orderWaiters: {id:number;name:string;locked?:boolean}[];
    orderPinAlerts?: {employee_id:number;name:string;reported_at:string;terminal_user:string}[];
};
const nav = [['dashboard', 'Tableau de bord', LayoutDashboard], ['pos', 'Caisse / POS', ShoppingBag], ['sales', 'Ventes', BarChart3], ['stock', 'Stock', Package], ['sacks', 'Khnchas café', Wheat], ['purchases', 'Achats', ShoppingBag], ['expenses', 'Dépenses', Wallet], ['employees', 'Employés', Users], ['balance', 'Bilan journalier', Wallet], ['reports', 'Rapports', ReceiptText], ['receipts', 'Reçus', Printer], ['settings', 'Paramètres', Settings]] as const;
const orderPinLocked = 'Serveur bloqué après 3 PIN incorrects. Seul le manager peut le débloquer avec un nouveau PIN.';
const requestErrors: Record<number, string> = {
    400: 'Requête invalide. Vérifiez les informations saisies.',
    401: 'Votre session a expiré. Reconnectez-vous.',
    403: 'Vous n’avez pas les droits pour cette opération.',
    404: 'Élément introuvable. Rechargez la page.',
    409: 'Les données ont changé ou cette valeur existe déjà. Rechargez la page.',
    413: 'La photo est trop volumineuse. Choisissez une image plus petite.',
    423: orderPinLocked,
    429: 'Trop de tentatives. Réessayez dans 15 minutes.',
    500: 'Une erreur est survenue sur le serveur. Réessayez dans un instant.',
    502: 'Le serveur est momentanément inaccessible. Réessayez dans un instant.',
    503: 'Connexion au serveur impossible. Vérifiez votre connexion et réessayez.',
    504: 'Le serveur met trop de temps à répondre. Vérifiez le résultat avant de réessayer.',
};
class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
const errorNumber = (error: unknown) => error instanceof ApiError ? String(error.status) : error instanceof Error && /^\d{3}$/.test(error.message) ? error.message : '503';
const errorMessage = (error: unknown) => error instanceof ApiError ? error.message : requestErrors[Number(errorNumber(error))] ?? requestErrors[503];
const kindName: Record<string, string> = { expense: 'Dépense', purchase: 'Achat', salary: 'Salaire', advance: 'Avance', repayment: 'Remboursement', withdrawal: 'Retrait', adjustment: 'Ajustement' };
// Base64 adds a third to the file size. Leave space for the rest of the JSON request.
const productPhotoBudget = 700 * 1024;

async function productPhotoData(file: File) {
    let photo: Blob = file;
    if (file.size > productPhotoBudget) {
        const url = URL.createObjectURL(file);
        try {
            const image = new Image();
            image.src = url;
            await image.decode();

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) throw new Error('400');
            for (const limit of [768, 384]) {
                const scale = Math.min(1, limit / Math.max(image.naturalWidth, image.naturalHeight));
                canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
                canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                const compressed = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.9));
                if (compressed && compressed.size <= productPhotoBudget) {
                    photo = compressed;
                    break;
                }
            }
            if (photo === file) throw new Error('413');
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(photo);
    });
}
function ProductPicture({product}:{product:Row}) {
    const {t}=useTranslation();
    if (product.image_path) {
        const photo = <img className="product-photo" src={product.image_path} alt={t(product.name)} loading="lazy" decoding="async"/>;
        if (['/products/cafe-double.jpg', '/products/cafe-double.webp'].includes(product.image_path)) {
            return <span className="double-coffee-photo">{photo}<span aria-hidden="true">2×</span></span>;
        }
        return photo;
    }
    return null;
}
function StockAlert({low, paused}: {low: Row[]; paused: boolean}) {
    const {t, number} = useTranslation();
    const dialog = useRef<HTMLDialogElement>(null);
    const [pending, setPending] = useState<Row[]>(low);
    const acknowledged = useRef(new Map<number, boolean>());

    useEffect(() => {
        const current = new Map(low.map(item => [item.id, item]));
        for (const id of acknowledged.current.keys()) {
            if (!current.has(id)) acknowledged.current.delete(id);
        }
        const unacknowledged = low.filter(item => !acknowledged.current.has(item.id) ||
            (item.quantity <= 0 && !acknowledged.current.get(item.id)));
        setPending(previous => {
            const next = new Map(previous.map(item => [item.id, item]));
            for (const item of unacknowledged) next.set(item.id, item);
            return [...next.values()];
        });
    }, [low]);

    const visible = pending.length > 0 && !paused;
    useEffect(() => {
        const element = dialog.current;
        if (visible && element && !element.open) element.showModal();
        return () => { if (element?.open) element.close(); };
    }, [visible]);

    if (!pending.length) return null;
    return (
        <dialog ref={dialog} className="modal stock-alert-dialog" aria-labelledby="stock-alert-title"
            onCancel={event => event.preventDefault()}>
            <div className="modal-heading">
                <h2 id="stock-alert-title"><CircleAlert size={20} aria-hidden="true"/> {t('Alerte de stock')}</h2>
            </div>
            <ul className="stock-alert-list">
                {pending.map(item => (
                    <li key={item.id}>
                        <strong>{t(item.name)}</strong>
                        <span>
                            {item.quantity <= 0 ? t('Rupture de stock') : t('Stock faible')}
                            {' · '}{number(item.quantity)} {t(item.unit)}
                        </span>
                    </li>
                ))}
            </ul>
            <div className="modal-actions">
                <button type="button" className="button gold" onClick={() => {
                    for (const item of pending) {
                        if (low.some(current => current.id === item.id)) {
                            acknowledged.current.set(item.id, item.quantity <= 0);
                        }
                    }
                    setPending([]);
                }}>OK</button>
            </div>
        </dialog>
    );
}

function StockPicture({item,products}:{item:Row;products:Row[]}) {
    if(item.image_path)return <div className="stock-picture"><ProductPicture product={item}/></div>;
    if(item.unit==='sac')return <div className="stock-picture"><ProductPicture product={{...item,image_path:'/stock/coffee.svg'}}/></div>;
    // Only a one-to-one recipe identifies the same stock item.
    const product=products.find(p=>stockBottleKeys.has(p.catalog_key)&&p.image_path&&Object.keys(p.recipe||{}).length===1&&Number(p.recipe?.[item.id])===1);
    return product ? <div className="stock-picture"><ProductPicture product={product}/></div> : null;
}
const totals = (s: State, date: string, month = false) => {
    const match = (d: string) => month ? d.startsWith(date.slice(0, 7)) : d === date;
    const orders = s.orders.filter(o => o.status === 'confirmed' && match(o.date)), movements = s.movements.filter(m => match(m.date));
    const sum = (kind: string) => movements.filter(m => m.kind === kind).reduce((a, m) => a + m.amount, 0);
    const sales = orders.reduce((a, o) => a + o.total, 0), credit = orders.filter(o => o.payment === 'credit').reduce((a, o) => a + o.total, 0), salary = sum('salary') + sum('advance'), expenses = sum('expense'), purchases = sum('purchase'), repayments = sum('repayment');
    return { sales, credit, salary, expenses, purchases, repayments, cash: orders.filter(o => o.payment === 'cash').reduce((a, o) => a + o.total, 0), card: orders.filter(o => o.payment === 'card').reduce((a, o) => a + o.total, 0), remainder: sales - credit - expenses - salary + repayments, result: sales - credit - expenses - salary - purchases + repayments, orders, movements, withdrawals: sum('withdrawal') };
};
async function api(path: string, body?: Row) {
    const url = '/api/' + path;
    const method = body ? 'POST' : 'GET';
    const started = performance.now();
    let status: number | undefined;
    try {
        const response = await fetch(url, body
            ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
            : { cache: 'no-store' });
        status = response.status;
        if (!response.ok) {
            const details = await response.json().catch(() => null);
            const message = typeof details?.message === 'string' && details.message.trim() && !/^\d+$/.test(details.message.trim())
                ? details.message : requestErrors[status] ?? requestErrors[500];
            throw new ApiError(status, message);
        }
        const data = await response.json();
        const durationMs = Math.round(performance.now() - started);
        if (durationMs >= 1000) console.info('[Monalisa API] Slow response', { method, url, status, durationMs });
        return data;
    } catch (error) {
        if (!(path.split('?')[0] === 'state' && status === 401)) {
            console.warn('[Monalisa API] Request failed', {
                method, url, status, durationMs: Math.round(performance.now() - started),
                reason: status === undefined ? 'No HTTP response' : status < 400 ? 'Invalid response body' : 'HTTP error',
            });
        }
        throw error;
    }
}
function Brand() { const { t } = useTranslation(); return <div className="brand"><div className="brand-mark"><Coffee size={37} strokeWidth={1.2}/><span /></div><strong>{t("MONALISA")}</strong><div className="brand-bottom"><i />{t("CAF\u00C9")}<i /></div></div>; }
function Empty({ text = 'Aucun mouvement pour le moment.', action }: {
    text?: string;
    action?: () => void;
}) { const { t } = useTranslation(); return <div className="empty"><ReceiptText size={30} strokeWidth={1}/><p>{t(text)}</p>{t(action && <button className="text-button" onClick={action}>{t("Commencer ")}<ChevronRight size={14}/></button>)}</div>; }
function Badge({ children, tone = 'green' }: {
    children: React.ReactNode;
    tone?: string;
}) { const { t } = useTranslation(); return <span className={'badge ' + tone}>{t(children)}</span>; }
function SackProgress({sack}:{sack:Row}) {
    const {t,number}=useTranslation();
    const minimum=sack.weight_kg*65,excellent=sack.weight_kg*75;
    const count=Number(sack.equivalents);
    const message=count<minimum?t('Encore {count} équivalents pour le minimum').replace('{count}',number(minimum-count)):count<excellent?t('Minimum atteint — suivi en cours'):t('Seuil excellent atteint — à confirmer à la clôture');
    return <div className="sack-progress"><div className="yield-targets"><span>{t('Minimum')} <b>{number(minimum)} {t('éq.')}</b></span><span>{t('Excellent')} <b>{number(excellent)} {t('éq.')}</b></span></div><div className="progress" role="progressbar" aria-label={t('Progression de la khncha')} aria-valuemin={0} aria-valuemax={excellent} aria-valuenow={Math.min(count,excellent)}><i style={{width:Math.min(count/excellent*100,100)+'%'}}/></div><p className="yield-message">{message}</p><Badge tone="neutral">{t('Évaluation à la clôture')}</Badge></div>;
}
function CoffeePackProgress({sacks, stock}: {sacks: Row[]; stock: number}) {
    const {t, number} = useTranslation();
    const pack = currentCoffeePack(sacks);
    const active = sacks.find(sack => sack.status === 'active' && Number(sack.weight_kg) === 1);
    const metrics = [
        {label: 'Stock total fermé', value: number(stock), unit: 'kg'},
        {label: 'Khnchas ouvertes dans le lot', value: number(pack?.opened ?? 0), unit: `/ ${coffeePackSize}`},
        {label: 'Khnchas à ouvrir dans le lot', value: number(pack?.unopened ?? coffeePackSize), unit: `/ ${coffeePackSize}`},
        {label: 'Quantité entièrement consommée', value: number(pack?.consumed ?? 0), unit: 'kg'},
        ...(active ? [{label: 'Équivalents de la khncha en cours', value: number(active.equivalents), unit: 'éq.'}] : []),
        {label: 'Équivalents du lot', value: number(pack?.equivalents ?? 0), unit: 'éq.'},
    ];
    return <section className="panel coffee-pack-panel">
        <div className="panel-heading"><h2>{t('Suivi du lot de 6 kg')}</h2>{pack && <Badge tone="neutral">#{pack.number}</Badge>}</div>
        <dl className="coffee-pack-metrics">
            {metrics.map(metric => <div key={metric.label}><dt>{t(metric.label)}</dt><dd>{metric.value}<small>{t(metric.unit)}</small></dd></div>)}
        </dl>
        <p className="micro-note">{t('Les ouvertures de khnchas de 1 kg sont groupées par six dans leur ordre d’ouverture.')}</p>
    </section>;
}
function YieldBadge({sack}:{sack:Row}) {
    const {t}=useTranslation(),performance=sackPerformance(sack);
    return <Badge tone={performance.tone}>{t(performance.label)}</Badge>;
}
function BaristaSummary({sacks}:{sacks:Row[]}) {
    const {t,number}=useTranslation(),summaries=baristaPerformance(sacks);
    return <section className="panel space-top barista-summary"><div className="panel-heading"><h2>{t('Suivi des barmans')}</h2></div><p className="panel-note">{t('Moyenne pondérée des khnchas entièrement consommées. Les khnchas en cours et les clôtures anticipées sont exclues.')}</p>{summaries.length?<div className="table-wrap"><table><thead><tr><th>{t('Barman')}</th><th>{t('Khnchas terminées')}</th><th>{t('Rendement moyen')}</th><th>{t('Évaluation')}</th><th>{t('À revoir')}</th><th>{t('Excellentes')}</th></tr></thead><tbody>{summaries.map(summary=><tr key={summary.id}><td className="strong">{summary.name}</td><td>{summary.sacks}</td><td>{number(summary.rate)} {t('éq./kg')}</td><td><Badge tone={summary.tone}>{t(summary.label)}</Badge></td><td>{summary.review}</td><td>{summary.excellent}</td></tr>)}</tbody></table></div>:<Empty text={t('Les résultats apparaîtront après la première khncha terminée et attribuée à un barman.')}/>}</section>;
}
function Chart({ data }: {
    data: {
        label: string;
        value: number;
    }[];
}) { const { t, money: euro, number } = useTranslation(); const max = Math.max(...data.map(d => d.value), 10000); const points = data.map((d, i) => [48 + i * 83, 180 - d.value / max * 135]); return <div className="chart"><svg viewBox="0 0 585 220" role="img" aria-label={t("Ventes des sept derniers jours")}><defs><linearGradient id="gold-area" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#b38d37" stopOpacity=".19"/><stop offset="1" stopColor="#b38d37" stopOpacity="0"/></linearGradient></defs>{t([0, 1, 2, 3].map(i => <g key={i}><line x1="48" x2="555" y1={45 + i * 45} y2={45 + i * 45} stroke="#eee9df" strokeDasharray="3 4"/><text x="0" y={49 + i * 45} fontSize="10" fill="#9a9488">{t(number(max * (3 - i) / 300))}</text></g>))}<path d={`M ${points[0][0]},180 L ${points.map(p => p.join(',')).join(' L ')} L ${points.at(-1)![0]},180 Z`} fill="url(#gold-area)"/><polyline points={points.map(p => p.join(',')).join(' ')} fill="none" stroke="#ad8732" strokeWidth="2.5" strokeLinejoin="round"/>{t(points.map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r="4" fill="white" stroke="#ad8732" strokeWidth="2"/><text x={x} y="207" textAnchor="middle" fontSize="11" fill="#8b8478">{t(data[i].label)}</text><title>{t(euro(data[i].value))}</title></g>))}</svg></div>; }
const Field = ({ name, title, type = 'text', value, options, required = true, step, min, onChange }: {
    name: string;
    title: string;
    type?: string;
    value?: any;
    options?: {
        value: any;
        label: string;
    }[];
    required?: boolean;
    step?: string;
    min?: string;
    onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
}) => { const { t } = useTranslation(); return <label>{t(title)}{t(options ? <select name={name} defaultValue={value ?? ''} required={required} onChange={onChange}><option value="" disabled>{t("Choisir\u2026")}</option>{t(options.map(o => <option value={o.value} key={o.value}>{t(o.label)}</option>))}</select> : <input name={name} type={type} defaultValue={value} required={required} step={step || (type === 'number' ? '0.01' : undefined)} min={min ?? (type === 'number' ? '0' : undefined)}/>)}</label>; };
function ProductSalesReport({orders,products,movements,date,onDateChange,onTicket}:{orders:Row[];products:Row[];movements:Row[];date:string;onDateChange:(date:string)=>void;onTicket:(id:number)=>void}) {
    const {t,number,money:euro,locale}=useTranslation();
    const [period,setPeriod]=useState('day');
    const report=productSales(orders,products,(day:string)=>period==='day'?day===date:day.startsWith(date.slice(0,7)),movements);
    const formatDate=(day:string)=>new Date(day+'T12:00:00').toLocaleDateString(locale);
    const values=(tickets:Row[],field:string)=>[...new Set(tickets.map(ticket=>ticket[field]))].filter(Boolean);
    return <section className="panel product-sales-report"><div className="product-sales-heading"><div><h2>{t('Ventes par article')}</h2><p className="micro-note">{t('Articles vendus, tickets, achats et dépenses de la période. Les ventes annulées sont exclues.')}</p></div><div className="product-sales-filters"><label>{t('Période')}<select value={period} onChange={e=>setPeriod(e.target.value)}><option value="day">{t('Par jour')}</option><option value="month">{t('Par mois')}</option></select></label><label>{t(period==='day'?'Date':'Mois')}<input type={period==='day'?'date':'month'} value={period==='day'?date:date.slice(0,7)} onChange={e=>{if(e.target.value)onDateChange(period==='day'?e.target.value:e.target.value+'-01');}}/></label></div></div>
        <div className="table-wrap sales-ledger"><table><thead><tr>{['Article','Date','Caissier','N° ticket','Quantité vendue','Nombre de commandes','Chiffre d’affaires','Dépenses','Achats'].map(label=><th key={label}>{t(label)}</th>)}</tr></thead><tbody>{report.rows.map((row:Row)=><tr key={'article-'+row.id}><td className="strong">{t(row.name)}</td><td>{values(row.tickets,'date').map(day=><div key={String(day)}>{formatDate(String(day))}</div>)}</td><td>{values(row.tickets,'cashier').map(name=><div key={String(name)}>{name}</div>)}</td><td><details className="report-tickets" open={row.orders===1}><summary>#{String(row.tickets[0].id).padStart(5,'0')}{row.orders>1&&<> · {number(row.orders)} {t('tickets')}</>}</summary>{row.tickets.map((ticket:Row)=><div key={ticket.id}><button type="button" className="ticket-link" onClick={()=>onTicket(ticket.id)}>#{String(ticket.id).padStart(5,'0')}</button><small>{formatDate(ticket.date)} · {ticket.cashier}</small></div>)}</details></td><td>{number(row.quantity)}</td><td>{number(row.orders)}</td><td>{euro(row.revenue)}</td><td>—</td><td>—</td></tr>)}
        {report.movementRows.map((movement:Row)=><tr key={'movement-'+movement.id}><td className="strong"><Badge tone="neutral">{t(movement.kind==='purchase'?'Achat':'Dépense')}</Badge><div>{movement.label}</div></td><td>{formatDate(movement.date)}</td><td>{movement.user_name}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>{movement.kind==='expense'?euro(movement.amount):'—'}</td><td>{movement.kind==='purchase'?euro(movement.amount):'—'}</td></tr>)}</tbody><tfoot><tr><th colSpan={4}>{t('Total')}</th><td>{number(report.quantity)}</td><td>{number(report.orders)} <small>{t('commandes distinctes')}</small></td><td>{euro(report.revenue)}</td><td>{euro(report.expenses)}</td><td>{euro(report.purchases)}</td></tr></tfoot></table></div>
        {!report.rows.length&&!report.movementRows.length&&<Empty text={t('Aucune opération pour cette période.')}/>}
    </section>;
}
function DailyBalance({state,onClose,busy}:{state:State;onClose:()=>void;busy:boolean}) {
    const {t,money:euro,locale}=useTranslation();
    const [mode,setMode]=useState('month'),[month,setMonth]=useState(state.today.slice(0,7)),[from,setFrom]=useState(state.today),[to,setTo]=useState(state.today);
    const {rows,total}=dailyBalance(state,(day:string)=>mode==='month'?day.startsWith(month):day>=from&&day<=to);
    return <><div className="panel balance-toolbar"><div className="balance-filters"><label>{t('Filtrer par')}<select value={mode} onChange={e=>setMode(e.target.value)}><option value="month">{t('Mois')}</option><option value="dates">{t('Dates')}</option></select></label>{mode==='month'?<label>{t('Mois')}<input type="month" required value={month} onChange={e=>{if(e.target.value)setMonth(e.target.value);}}/></label>:<><label>{t('Du')}<input type="date" value={from} onChange={e=>setFrom(e.target.value)} max={to}/></label><label>{t('Au')}<input type="date" value={to} onChange={e=>setTo(e.target.value)} min={from}/></label></>}</div><div className="service-day"><span>{t('Journée en cours')} <strong>{new Date(state.today+'T12:00:00').toLocaleDateString(locale)}</strong></span><button className="button gold" disabled={busy} onClick={onClose}>{t('Clôturer la journée')}</button></div></div>
    <section className="panel balance-table"><div className="table-wrap"><table><thead><tr>{['Date','Encaissements','Dépenses totales','Net de gestion'].map(title=><th key={title}>{t(title)}</th>)}</tr></thead><tbody>{rows.map((row:Row)=><tr key={row.date}><td className="strong">{new Date(row.date+'T12:00:00').toLocaleDateString(locale)}{row.date===state.today&&<small>{t('En cours')}</small>}</td><td>{euro(row.income)}</td><td>{euro(row.spending)}</td><td className={row.net<0?'balance-negative':'balance-positive'}>{euro(row.net)}</td></tr>)}</tbody><tfoot><tr><th>{t('Total')}</th><td>{euro(total.income)}</td><td>{euro(total.spending)}</td><td className={total.net<0?'balance-negative':'balance-positive'}>{euro(total.net)}</td></tr></tfoot></table></div>{!rows.length&&<Empty text={t('Aucune opération pour cette période.')}/>}</section>
    <section className="panel balance-breakdown"><h2>{t('Détail des totaux')}</h2><dl>{[['Ventes',total.sales],['Achats',total.purchases],['Dépenses',total.expenses],['Salaires & avances',total.payroll],['Retraits de caisse',total.withdrawals]].map(([label,value])=><div key={String(label)}><dt>{t(String(label))}</dt><dd>{euro(Number(value))}</dd></div>)}</dl><p className="micro-note">{t('Net de gestion = encaissements − achats − dépenses − salaires / avances. Les retraits de caisse ne sont pas des charges.')}</p></section></>;
}
function ReceiptPreview({settings, cafeName, order}: {settings:Row; cafeName:string; order:Row}) {
    const {t,money:euro}=useTranslation();
    return <div className="receipt-preview"><Coffee size={30}/><h3>{settings.title || cafeName}</h3>
        {settings.address && <p className="receipt-copy-text">{settings.address}</p>}{settings.phone && <p>{settings.phone}</p>}
        <p>{t('Ticket #')}{String(order.id).padStart(5,'0')} · {order.date}{settings.showServer!==false && <><br/>{order.user_name}</>}</p>
        <div className="receipt-lines">{order.lines.map((line:Row)=><div key={line.id}><span>{line.qty} × {t(line.name)}</span><b>{euro(line.price*line.qty)}</b></div>)}</div>
        <div className="receipt-total"><span>{t('Total')}</span><b>{euro(order.total)}</b></div>
        <Badge tone={order.status==='cancelled'?'red':'neutral'}>{t(order.status==='cancelled'?'Commande annulée':order.payment==='credit'?'Paiement historique':order.payment==='card'?'Carte':'Espèces')}</Badge>
        <p className="receipt-copy-text">{settings.footer ?? t('Merci et à bientôt !')}</p>
    </div>;
}
function ReceiptSettings({settings,cafeName,busy,error,onSave}: {settings:Row;cafeName:string;busy:boolean;error:string;onSave:(settings:Row)=>Promise<unknown>}) {
    const {t}=useTranslation();
    const [draft,setDraft]=useState<Row>({title:settings.title ?? cafeName,address:settings.address ?? '',phone:settings.phone ?? '',footer:settings.footer ?? t('Merci et à bientôt !'),showServer:settings.showServer!==false});
    return <div className="receipt-settings-layout"><section className="panel receipt-settings-form"><h2>{t('Contenu du reçu')}</h2><form onSubmit={e=>{e.preventDefault();void onSave(draft);}}>
        {([['title','Nom sur le reçu',120],['address','Adresse',240],['phone','Téléphone',80],['footer','Message en bas du reçu',500]] as const).map(([key,title,max])=><label key={key}>{t(title)}{key==='address'||key==='footer'?<textarea maxLength={max} rows={3} value={draft[key]} disabled={busy} onChange={e=>setDraft({...draft,[key]:e.target.value})}/>:<input maxLength={max} value={draft[key]} disabled={busy} onChange={e=>setDraft({...draft,[key]:e.target.value})}/>}</label>)}
        <label className="receipt-checkbox"><input type="checkbox" checked={draft.showServer} disabled={busy} onChange={e=>setDraft({...draft,showServer:e.target.checked})}/>{t('Afficher le serveur sur le reçu')}</label>
        {error&&<div className="form-error" role="alert">{t(error)}</div>}<button className="button gold" disabled={busy}>{busy?<LoaderCircle size={17} className="spin"/>:<Check size={17}/>} {t('Enregistrer')}</button>
    </form></section><section className="panel receipt-settings-preview"><h2>{t('Aperçu du reçu')}</h2><p className="micro-note">{t('Exemple · les deux copies utilisent ces informations.')}</p><ReceiptPreview settings={draft} cafeName={cafeName} order={{id:1,date:new Date().toLocaleDateString(),user_name:t('Serveur'),lines:[{id:1,name:'Café',qty:1,price:1100}],total:1100,payment:'cash'}}/></section></div>;
}
export default function App() {
    const { t, locale, language, money: euro, number } = useTranslation();
    const prettyDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
    const [s, setS] = useState<State | null>(null), [loading, setLoading] = useState(true), [loginError, setLoginError] = useState(''), [view, setView] = useState('dashboard'), [date, setDate] = useState(''), [query, setQuery] = useState(''), [category, setCategory] = useState(''), [cart, setCart] = useState<Record<number, number>>({}), [customer, setCustomer] = useState(''), [modal, setModal] = useState<Row | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [toast, setToast] = useState(''), [menu, setMenu] = useState(false), [orderKey, setOrderKey] = useState(''), [filter, setFilter] = useState('all');
    const submittingOrder = useRef(false);
    const [printTarget,setPrintTarget]=useState('both');
    const refresh = async () => { try {
        const j = await api('state' + (date ? '?date=' + date : ''));
        setS(j);
        setDate(d => d || j.today);
    }
    catch (error) {
        if (errorNumber(error) === '401') setS(null);
        else if (s) setError(errorMessage(error));
        else setLoginError(errorMessage(error));
    }
    finally {
        setLoading(false);
    } };
    useEffect(() => { refresh(); }, []);
    useEffect(() => { if (!s?.user.id)
        return; const timer = setInterval(() => { if (document.visibilityState === 'visible')
        api('state' + (date ? '?date=' + date : '')).then(setS).catch(() => { }); }, 15000); return () => clearInterval(timer); }, [s?.user.id, date]);
    useEffect(() => { if (s && date && !manager)
        api('state?date=' + date).then(setS).catch(() => { }); }, [date, s?.user.id]);
    useEffect(() => { if (!modal)
        return; const previous = document.activeElement as HTMLElement; const frame = requestAnimationFrame(() => { const d = document.querySelector<HTMLElement>('[role=dialog]'); d?.querySelector<HTMLElement>('input,select,button')?.focus(); }); const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy)
        setModal(null); if (e.key === 'Tab') {
        const nodes = Array.from(document.querySelectorAll<HTMLElement>('[role=dialog] button:not(:disabled),[role=dialog] input,[role=dialog] select'));
        const first = nodes[0], last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
        }
        else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
        }
    } }; document.addEventListener('keydown', onKey); return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', onKey); previous?.focus(); }; }, [modal?.type, busy]);
    useEffect(() => { if (toast) {
        const toastTimer = setTimeout(() => setToast(''), 4500);
        return () => clearTimeout(toastTimer);
    } }, [toast]);
    const manager = s?.user.role === 'manager';
    useEffect(()=>{if(s&&!manager)setDate(s.today);},[s?.today,manager]);
    const navigate = (v: string) => { setView(v); setQuery(''); setFilter('all'); setMenu(false); };
    const show = (type: string, extra: Row = {}) => { setError(''); setModal({ type, ...extra }); };
    const mutate = async (type: string, body: Row, close = true) => { setBusy(true); setError(''); try {
        const result = await api(type, body);
        if(type==='order' && result.order){
            setS(current=>current?{...current,orders:[result.order,...current.orders.filter(order=>order.id!==result.order.id)]}:current);
            void refresh();
        } else await refresh();
        if(type==='close' && result.businessDate)setDate(result.businessDate);
        if (close)
            setModal(null);
        setToast(type === 'order' ? 'Commande enregistrée.' : type === 'change-order-pin' ? 'Votre PIN a été changé.' : 'Opération enregistrée.');
        return result;
    }
    catch (e) {
        if (errorNumber(e) === '423') await refresh();
        setError(errorMessage(e));
        return null;
    }
    finally {
        setBusy(false);
    } };
    const metrics = useMemo(() => s ? totals(s, date) : null, [s, date]);
    const month = useMemo(() => s ? totals(s, date, true) : null, [s, date]);
    const low = useMemo(() => {
        if (!s || !manager) return [];
        const trackedIds = new Set(s.products
            .filter(product => stockBottleKeys.has(product.catalog_key))
            .flatMap(product => Object.keys(product.recipe ?? {}).map(Number)));
        const coffee = s.inventory.find(item => item.unit === 'sac');
        if (coffee) trackedIds.add(coffee.id);
        return s.inventory.filter(item => trackedIds.has(item.id) && item.quantity <= item.threshold);
    }, [s, manager]);
    if (loading)
        return <div className="loading"><Brand /><LoaderCircle className="spin"/><p>{t("Ouverture de votre caf\u00E9\u2026")}</p></div>;
    if (!s)
        return <main className="login-page"><div className="login-story"><span className="eyebrow">{t("LE SENS DU D\u00C9TAIL")}</span><h1>{t("Un bon caf\u00E9.")}<br />{t("Une gestion")}<br /><em>{t("en toute clart\u00E9.")}</em></h1><p>{t("Votre caisse, votre \u00E9quipe et vos comptes.")}<br />{t("Tout simplement, au m\u00EAme endroit.")}</p><div className="login-cup"><Coffee size={160} strokeWidth={.7}/></div><small>{t("MONALISA CAF\u00C9 \u00B7 VOTRE ESPACE DE GESTION")}</small></div><div className="login-panel"><div className="login-language"><LanguageSwitcher /></div><Brand /><h2>{t("Bienvenue au caf\u00E9")}</h2><p>{t("Connectez-vous \u00E0 votre espace.")}</p><form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setLoginError(''); const f = new FormData(e.currentTarget); try {
            await api('login', Object.fromEntries(f));
            await refresh();
        }
        catch (err) {
            setLoginError(errorMessage(err));
        }
        finally {
            setBusy(false);
        } }}><label>{t("Identifiant")}<input name="username" placeholder={t("manager")} autoComplete="username" required/></label><label>{t("Code d\u2019acc\u00E8s")}<input name="pin" type="password" placeholder={t("\u2022\u2022\u2022\u2022")} autoComplete="current-password" required/></label>{t(loginError && <div className="form-error">{t(loginError)}</div>)}<button className="button gold full" disabled={busy}>{t(busy ? <LoaderCircle className="spin" size={18}/> : <>{t("Ouvrir mon espace ")}<ArrowUpRight size={17}/></>)}</button></form>{process.env.NODE_ENV !== 'production' && <div className="demo-note"><span className="dot"/>{t("Version locale de d\u00E9monstration")}<br /><span>{t("Manager : ")}<b>{t("manager / 2026")}</b><br />{t("Caisse : ")}<b>{t("caisse / 1234")}</b></span></div>}</div></main>;
    const m = metrics!, mo = month!, active = s.sacks.find(x => x.status === 'active'), selectedTitle = nav.find(n => n[0] === view)?.[1] || 'Tableau de bord';
    const withoutWaterByProduct = new Map<number, Row>();
    const withWaterByVariant = new Map<number, Row>();
    if (s.user.cafe_name === 'Monalisa Café') {
        for (const option of waterOptions) {
            const regular = s.products.filter(p => option.regular.some(name => menuNameKey(name) === menuNameKey(p.name)));
            const variants = option.without.flatMap(name => s.products.filter(p => menuNameKey(name) === menuNameKey(p.name)));
            if (!regular.length || !variants.length) continue;
            for (const product of regular) withoutWaterByProduct.set(product.id, variants[0]);
            for (const variant of variants) withWaterByVariant.set(variant.id, regular[0]);
        }
    }
    const menuCategories = s.categories.map(category => category.name);
    const activeCategory = menuCategories.includes(category) ? category : menuCategories[0] || '';
    const categoryOptions = menuCategories.map(name => ({value: name, label: name}));
    const products = s.products.filter(p => !withWaterByVariant.has(p.id) && p.category === activeCategory && (p.name + ' ' + t(p.name)).toLowerCase().includes(query.toLowerCase()));
    const cartLines: Row[] = Object.entries(cart).flatMap(([id, qty]) => { const p = s.products.find(p => p.id === Number(id)); return p ? [{ ...p, qty }] : []; });
    const cartTotal = cartLines.reduce((a, p) => a + p.price * p.qty, 0);
    const add = (id: number, delta = 1) => { setOrderKey(''); setCart(old => { const copy = { ...old, [id]: Math.min(100, (old[id] || 0) + delta) }; if (copy[id] <= 0)
        delete copy[id]; return copy; }); };
    const switchWaterOption = (from: number, to: number) => {
        setOrderKey('');
        setCart(current => {
            if (!current[from] || (current[to] ?? 0) >= 100) return current;
            const next = { ...current, [from]: current[from] - 1, [to]: (current[to] ?? 0) + 1 };
            if (!next[from]) delete next[from];
            return next;
        });
    };
    const reviewOrder = () => {
        if (busy || !cartLines.length) return;
        show('confirm-order', {key:orderKey || crypto.randomUUID(), payment:'cash'});
    };
    const selectedWaiter = s.orderWaiters?.find(waiter => waiter.id === Number(modal?.waiterId));
    const submitOrder = async () => {
        if (busy || submittingOrder.current || modal?.type!=='confirm-order' || !cartLines.length || (s.orderWaiters?.length && !selectedWaiter)) return;
        submittingOrder.current=true;
        try {
            const key=modal.key;
            setOrderKey(key);
            const waiter = s.orderWaiters?.length
                ? {waiter_id: Number(modal.waiterId)}
                : {};
            const r=await mutate('order',{...waiter,key,lines:cartLines.map((p:Row)=>({id:p.id,qty:p.qty})),payment:modal.payment,expected_total:cartTotal},false);
            if(r){setCart({});setCustomer('');setOrderKey('');show('receipt',{id:r.id});if(typeof window!=='undefined'&&r.order){try{printReceipt(r.order);}catch{setToast('Commande enregistrée. Relancez l’impression depuis le reçu.');}}}
        } finally { submittingOrder.current=false; }
    };
    const listOrders = s.orders.filter(o => (view === 'reports' ? o.date.startsWith(date.slice(0, 7)) : o.date === date) && (filter === 'all' || o.payment === filter) && (`${o.id} ${o.user_name} ${o.lines.map((l: Row) => l.name).join(' ')}`).toLowerCase().includes(query.toLowerCase()));
    const exportCsv = (rows: Row[], name: string) => { if (!rows.length) {
        setToast('Aucune donnée à exporter pour cette période.');
        return;
    } const keys = Object.keys(rows[0]); const escape = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""').replace(/^[=+@-]/, "'") + '"'; const content = '\ufeff' + [keys.map(k => t(k)), ...rows.map(r => keys.map(k => r[k]))].map(r => r.map(escape).join(';')).join('\r\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' })); a.download = name + '.csv'; a.click(); URL.revokeObjectURL(a.href); };
    const exportOrders = () => exportCsv(listOrders.map(o => ({ Ticket: o.id, Date: o.date, Caissier: o.user_name, Total_DH: o.total / 100, Paiement: t(o.payment === 'credit' ? 'Paiement historique' : o.payment === 'card' ? 'Carte' : 'Espèces'), Statut: t(o.status === 'cancelled' ? 'Annulée' : 'Confirmée') })), `ventes-${date}`);
    const editOrder=(o:Row)=>show('order-edit',{order:o,lines:o.lines.map((l:Row)=>({...s.products.find(p=>p.id===l.id),...l})),payment:o.payment});
    function SalesTable({ orders, compact = false }: {
        orders: Row[];
        compact?: boolean;
    }) { return orders.length ? <div className="table-wrap sales-ledger"><table><thead><tr><th>{t("N\u00B0 ticket")}</th><th>{t("Commande")}</th>{t(!compact && <th>{t("Caissier")}</th>)}<th>{t("Paiement")}</th><th className="right">{t("Montant")}</th><th /></tr></thead><tbody>{t(orders.map(o => <tr key={o.id}><td><button className="ticket-link" onClick={() => show('receipt', { id: o.id })}>{t("#")}{t(String(o.id).padStart(5, '0'))}</button><small>{t(new Date(o.created).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Casablanca' }))}</small></td><td><span className="truncate">{t(o.lines.map((l: Row) => `${l.qty} × ${t(l.name)}`).join(', '))}</span>{t(o.status === 'cancelled' && <Badge tone="red">{t("Annul\u00E9e")}</Badge>)}</td>{t(!compact && <td>{t(o.user_name)}</td>)}<td><Badge tone={o.payment === 'credit' ? 'purple' : o.payment === 'card' ? 'blue' : 'green'}>{t(o.payment === 'credit' ? 'Paiement historique' : o.payment === 'card' ? 'Carte' : 'Espèces')}</Badge></td><td className="right strong">{t(euro(o.total))}</td><td><button className="icon-button" title={t("Voir le ticket")} onClick={() => show('receipt', { id: o.id })}><ChevronRight size={16}/></button>{manager&&!compact&&o.status==='confirmed'&&<span className="sale-actions"><button className="button small" onClick={()=>editOrder(o)}><Pencil size={15}/>{t("Modifier")}</button><button className="button small danger" onClick={()=>show('cancel',{id:o.id,revision:o.revision})}><Trash2 size={15}/>{t("Supprimer")}</button></span>}</td></tr>))}</tbody></table></div> : <Empty text={t("Les prochaines commandes appara\u00EEtront ici.")} action={() => navigate('pos')}/>; }
    function MovementTable({ rows }: {
        rows: Row[];
    }) { const showRecipient=rows.some(r=>['salary','advance'].includes(r.kind));const canEditPurchases=manager&&rows.some(row=>row.kind==='purchase');return rows.length ? <div className="table-wrap"><table><thead><tr><th>{t("Date")}</th><th>{t("Libell\u00E9")}</th><th>{t("Cat\u00E9gorie")}</th>{showRecipient&&<th>{t("Bénéficiaire")}</th>}<th>{t("Enregistr\u00E9 par")}</th><th className="right">{t("Montant")}</th>{canEditPurchases&&<th/>}</tr></thead><tbody>{t(rows.map(r => <tr key={r.id}><td>{t(r.date)}</td><td className="strong">{t(r.label)}{t(r.inventory_id && <small>{t(number(r.quantity))} {t(s!.inventory.find(i => i.id === r.inventory_id)?.unit)}</small>)}</td><td><Badge tone="neutral">{t(kindName[r.category]||r.category)}</Badge></td>{showRecipient&&<td className="strong">{r.employee_id?t(s!.employees.find(employee=>employee.id===r.employee_id)?.name||'Employé introuvable'):'—'}</td>}<td>{t(r.user_name)}<small>{t(r.payment === 'cash' ? 'Espèces' : r.payment === 'bank' ? 'Virement' : 'Carte')}</small></td><td className="right strong">{t(euro(r.amount))}</td>{canEditPurchases&&<td>{r.kind==='purchase'&&<div className="inline-buttons"><button className="button small" onClick={()=>show('purchase-edit',{purchase:r})}>{t('Modifier')}</button><button className="button small danger" onClick={()=>show('purchase-delete',{purchase:r})}>{t('Supprimer')}</button></div>}</td>}</tr>))}</tbody></table></div> : <Empty />; }
    const paymentOptions = [{ value: 'cash', label: 'Espèces' }, { value: 'card', label: 'Carte' }, { value: 'bank', label: 'Virement' }];
    const inventoryOptions = s.inventory.map(i => ({ value: i.id, label: `${i.name} (${i.unit})` }));
    const employeeOptions = s.employees.map(i => ({ value: i.id, label: i.name }));
    const printReceipt = (o: Row) => { const frame = document.createElement('iframe'); frame.style.cssText = 'position:fixed;width:0;height:0;border:0'; document.body.append(frame); const doc = frame.contentDocument!; doc.open(); doc.write('<!doctype html><html><head><title>Ticket</title><style>@page{size:80mm auto;margin:4mm}body{font:12px monospace;width:70mm;margin:0;color:#000;overflow-wrap:anywhere}h2{text-align:center;font-size:19px}p{text-align:center}table{width:100%;border-collapse:collapse}td{padding:5px 0}td:last-child{text-align:end}td:only-child{text-align:start;font-size:15px;font-weight:bold}.cut{border-top:1px dashed;margin:18px 0;break-after:page}.cut:last-child{break-after:auto}small{font-size:10px}</style></head><body></body></html>'); doc.close(); doc.documentElement.lang = language; doc.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'; doc.title = t('Ticket'); doc.body.style.fontFamily = language === 'ar' ? 'Tahoma, Arial, sans-serif' : 'monospace'; for (const copy of (printTarget==='client'?['COPIE CLIENT']:printTarget==='barman'?['COPIE BARMAN']:['COPIE CLIENT','COPIE BARMAN'])) {
        const section = doc.createElement('section');
        const title = doc.createElement('h2');
        title.textContent = s.receiptSettings?.title || s.user.cafe_name;
        section.append(title);
        for (const text of [s.receiptSettings?.address,s.receiptSettings?.phone]) {
            if(text){const contact=doc.createElement('p');contact.textContent=text;contact.style.whiteSpace='pre-line';section.append(contact);}
        }
        const p = doc.createElement('p');
        p.textContent = `${t(copy)}\n${t('Ticket')} #${o.id} · ${o.date}${s.receiptSettings?.showServer===false&&copy!=='COPIE BARMAN'?'':'\n'+o.user_name}`;
        p.style.whiteSpace = 'pre-line';
        section.append(p);
        const table = doc.createElement('table');
        for (const l of o.lines) {
            const tr = doc.createElement('tr');
            for (const text of (copy==='COPIE BARMAN'?[`${l.qty} × ${t(l.name)}`]:[`${l.qty} × ${t(l.name)}`, euro(l.qty * l.price)])) {
                const td = doc.createElement('td');
                td.textContent = t(text);
                tr.append(td);
            }
            table.append(tr);
        }
        section.append(table);
        const total = doc.createElement('p');
        total.textContent = `${t('TOTAL')} : ${euro(o.total)} · ${t(o.payment === 'credit' ? 'Paiement historique' : o.payment === 'card' ? 'CARTE' : 'ESPÈCES')}`;
        if(copy!=='COPIE BARMAN')section.append(total);
        const thanks = doc.createElement('p');
        thanks.textContent = s.receiptSettings?.footer ?? t('Merci et à bientôt !');
        thanks.style.whiteSpace = 'pre-line';
        section.append(thanks);
        section.className = 'cut';
        doc.body.append(section);
    } setTimeout(() => { try{frame.contentWindow?.focus();frame.contentWindow?.print();}catch{setToast('Commande enregistrée. Relancez l’impression depuis le reçu.');} }, 200); setTimeout(() => frame.remove(), 120000); };
    return <div className="app-shell"><aside className={'sidebar ' + (menu ? 'open' : '')}><Brand /><div className="workspace"><span className="status-dot"/>{t(" Votre caf\u00E9, en direct")}</div><nav>{t(nav.filter(n => manager || ['dashboard', 'pos', 'sales'].includes(n[0])).map(([key, name, Icon]) => <button key={key} onClick={() => navigate(key)} className={view === key ? 'active' : ''}><Icon size={19} strokeWidth={1.6}/><span>{t(name)}</span>{t(key === 'stock' && low.length > 0 && <b className="nav-count">{t(low.length)}</b>)}</button>))}</nav><div className="sidebar-bottom"><div className="mini-coffee"><Coffee size={21}/></div><p>{t("Le go\u00FBt du travail bien fait.")}<small>{t("MONALISA \u00B7 GESTION CAF\u00C9")}</small></p><button className="logout" onClick={async () => { await api('logout', {}); setS(null); setCart({}); setView('dashboard'); setModal(null); }}><LogOut size={16}/>{t(" D\u00E9connexion")}</button></div></aside>{t(menu && <div className="sidebar-overlay" onClick={() => setMenu(false)}/>)}
 <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" onClick={() => setMenu(!menu)} aria-label={t("Menu")}><Menu size={22}/></button><span>{t("Monalisa Caf\u00E9")}</span><ChevronRight size={13}/><strong>{t(selectedTitle)}</strong></div><div className="topbar-right"><LanguageSwitcher /><span className="local-badge"><span className="dot"/>{t(" D\u00E9monstration locale")}</span>{t(manager && <button className="notification icon-button" aria-label={t("Alertes stock")} onClick={() => { navigate('stock'); setToast(low.length ? `${low.length} article(s) en stock faible.` : 'Votre stock est à jour.'); }}><Bell size={19}/>{t(low.length > 0 && <i />)}</button>)}{s.orderWaiters?.length > 0 && <button className="button small" onClick={() => show('change-order-pin')}>{t('Mon PIN')}</button>}<div className="user-avatar">{t(s.user.name[0])}</div><div className="user-info"><strong>{t(s.user.name)}</strong><small>{t(manager ? 'Manager' : 'Caissier')}</small></div></div></header>
 <main className={'main-content ' + (view === 'pos' ? 'pos-main' : view === 'sacks' ? 'sacks-page' : '')}>
 {manager && <StockAlert key={s.user.id} low={low} paused={!!modal || busy}/>}
 {manager && s.orderPinAlerts?.map(alert => <section className="pin-alert" role="alert" key={alert.employee_id}>
    <CircleAlert size={20}/><div><strong>{t('Tentative suspecte sur le PIN de commande')} · {alert.name}</strong>
    <p>{t('Trois PIN incorrects ont bloqué les commandes pour ce serveur.')}</p>
    <small>{t('Session utilisée')} · {alert.terminal_user} · {new Date(alert.reported_at).toLocaleString(locale, {timeZone:'Africa/Casablanca'})}</small></div>
    <button className="button" onClick={() => show('employee-order-pin', {employee_id:alert.employee_id, employeeName:alert.name})}>{t('Débloquer avec un nouveau PIN')}</button>
 </section>)}<div className="page-heading"><div><div className="eyebrow">{t(view === 'dashboard' ? 'CHAQUE JOUR COMPTE' : 'MONALISA CAFÉ')}</div><h1>{t(selectedTitle)}<span className="title-dot">{t(".")}</span></h1><p>{t(({ dashboard: 'Un regard sur votre café, l’esprit tranquille.', pos: 'Prenez la commande. On s’occupe des comptes.', sales: 'Chaque commande, chaque détail.', stock: 'Les bons produits, toujours disponibles.', sacks: 'De l’ouverture au dernier café.', purchases: 'Vos approvisionnements, bien organisés.', expenses: 'Gardez une vue claire sur vos sorties.', employees: 'Votre équipe, au cœur du café.', credit: 'Un suivi simple des comptes clients.', balance: 'Vos encaissements et vos charges, jour par jour.', reports: 'Prenez du recul sur votre activité.', receipts: 'Personnalisez les tickets de vos commandes.', settings: 'Un café qui vous ressemble.' } as Record<string, string>)[view])}</p></div><div className="heading-actions">{t(!['pos','balance','receipts'].includes(view) && <label className="date-picker"><CalendarDays size={16}/><input type="date" value={date} onChange={e => setDate(e.target.value || s.today)} aria-label={t("Date de consultation")}/></label>)}{t(view === 'dashboard' && <button className="button gold" onClick={() => navigate('pos')}><Plus size={16}/>{t(" Nouvelle vente")}</button>)}{t(view === 'sales' && <button className="button" onClick={exportOrders}><Download size={16}/>{t(" Exporter")}</button>)}</div></div>
 {t(view === 'dashboard' && <><div className={'metric-grid'+(!manager?' cashier-metrics':'')}>{t([{ title: 'Ventes du jour', value: m.sales, icon: ShoppingBag, note: `${m.orders.length} commande${m.orders.length !== 1 ? 's' : ''} confirmée${m.orders.length !== 1 ? 's' : ''}` }, { title: 'Dépenses du jour', value: m.expenses, icon: Wallet, note: 'Hors achats et salaires' }, { title: 'En espèces', value: m.cash, icon: Banknote, note: 'Paiements reçus en espèces' }, { title: 'Reste du jour', value: m.remainder, icon: Banknote, note: `Après salaires / avances : ${euro(m.salary)}`, gold: true }].filter(metric=>manager||metric.title!=='Dépenses du jour').map(({ title, value, icon: Icon, note, gold }) => <section key={title} className={'metric-card ' + (gold ? 'highlight' : '')}><div className="metric-top"><span>{t(title)}</span><div className="metric-icon"><Icon size={19} strokeWidth={1.5}/></div></div><strong>{t(euro(value))}</strong><small>{t(note)}</small></section>))}</div>
 {t(manager && <div className="dashboard-middle"><section className="panel sales-chart"><div className="panel-heading"><div><span className="eyebrow">{t("VOTRE ACTIVIT\u00C9")}</span><h2>{t("La semaine en un regard")}</h2></div><Badge tone="neutral">{t("7 derniers jours")}</Badge></div><div className="chart-total">{t(euro(Array.from({ length: 7 }, (_, i) => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() - 6 + i); return totals(s, d.toISOString().slice(0, 10)).sales; }).reduce((a, v) => a + v, 0)))}<span><span className="legend-dot"/>{t(" Ventes")}</span></div><Chart data={Array.from({ length: 7 }, (_, i) => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() - 6 + i); return { label: d.toLocaleDateString(locale, { weekday: 'short' }), value: totals(s, d.toISOString().slice(0, 10)).sales }; })}/></section>
 <section className="panel sack-card"><div className="panel-heading"><div><span className="eyebrow">{t("LE C\u0152UR DU CAF\u00C9")}</span><h2>{t("Khncha en cours")}</h2></div><div className="sack-symbol"><Wheat size={34} strokeWidth={1.2}/></div></div>{t(active ? <><div className="sack-count">{t(number(active.equivalents))}<span>{t("\u00E9quivalents vendus")}</span></div><SackProgress sack={active}/><p className="sack-responsible">{t("Barman responsable")} : <b>{active.barista_name||t("Non attribué")}</b></p><div className="sack-details"><span>{t("Ouverte le ")}<b>{t(new Date(active.opened).toLocaleDateString(locale))}</b></span><span>{t("Poids initial ")}<b>{t(`${active.weight_kg} kg`)}</b></span></div><p className="micro-note">{t("Rep\u00E8re th\u00E9orique \u00B7 aucun poids restant mesur\u00E9.")}</p>{active.weight_kg!==1&&<p className="micro-note">{t('Ancien format conservé pour cet historique. Les nouvelles khnchas font 1 kg.')}</p>}</> : <div className="sack-empty"><Coffee size={42} strokeWidth={1}/><h3>{t("Une nouvelle journ\u00E9e se pr\u00E9pare")}</h3><p>{t("Ouvrez une khncha pour commencer")}<br />{t("\u00E0 enregistrer les caf\u00E9s.")}</p></div>)}<button className="button full" onClick={() => manager && !active ? show('sack-open') : navigate('sacks')}>{t(active ? 'Voir le suivi' : manager ? 'Ouvrir une khncha' : 'En attente du manager')}<ChevronRight size={16}/></button></section></div>)}
 {manager&&<SackPerformanceChart sacks={s.sacks}/>}
 <div className={'dashboard-bottom' + (!manager ? ' cashier-dashboard' : '')}>{t(manager && <section className="panel monthly"><div className="panel-heading"><h2>{t("Bilan du mois")}</h2><span className="muted">{t(new Date(date + 'T12:00:00').toLocaleDateString(locale, { month: 'long' }))}</span></div>{t([['Ventes', mo.sales], ['Marchandises', mo.purchases], ['Salaires & avances', mo.salary], ['Dépenses & charges', mo.expenses], ...(mo.repayments !== mo.credit ? [['Ajustement historique', mo.repayments - mo.credit]] : [])].map(([name, value]) => <div className="bilan-row" key={name}><span>{t(name)}</span><strong>{t(euro(Number(value)))}</strong></div>))}<div className="bilan-result"><span>{t("Reste de gestion")}<small>{t("Selon les entr\u00E9es du mois")}</small></span><strong>{t(euro(mo.result))}</strong></div><button className="text-button" onClick={() => navigate('reports')}>{t("Comprendre le bilan ")}<ChevronRight size={14}/></button></section>)}<section className="panel recent-sales"><div className="panel-heading"><h2>{t("Derni\u00E8res ventes")}</h2><button className="text-button" onClick={() => navigate('sales')}>{t("Tout voir ")}<ArrowUpRight size={15}/></button></div><SalesTable orders={m.orders.slice(0, 4)} compact/></section>{t(manager && <section className="panel alerts"><div className="panel-heading"><h2><CircleAlert size={18}/>{t(" \u00C0 surveiller")}</h2></div>{t(low.length ? low.slice(0, 3).map(i => <div className="alert-row" key={i.id}><div className="alert-icon"><Package size={18}/></div><div><strong>{t(i.name)}</strong><small>{t(number(i.quantity))} {t(i.unit)}{t(i.quantity > 1 && language !== 'ar' ? 's' : '')}{t(" restant(es)")}</small></div><span className="alert-dot"/></div>) : <div className="all-good"><div><Check size={23}/></div><strong>{t("Tout est en ordre")}</strong><p>{t("Aucun stock sous le seuil.")}</p></div>)}<button className="text-button" onClick={() => navigate('stock')}>{t("Consulter le stock ")}<ChevronRight size={14}/></button></section>)}</div><div className="dashboard-foot"><Coffee size={14}/>{t(" Les chiffres se mettent \u00E0 jour apr\u00E8s chaque op\u00E9ration.")}<span>{t(prettyDate(date))}</span></div></>)}
 {t(view === 'pos' && <div className="pos-layout"><section><div className="pos-service-day"><span>{t('Journée en cours')} <strong>{new Date(s.today+'T12:00:00').toLocaleDateString(locale)}</strong></span>{manager&&<button className="text-button" onClick={()=>show('close',{date:s.today})}>{t('Clôturer la journée')}</button>}</div><div className="search-field"><Search size={18}/><input placeholder={t("Rechercher un produit\u2026")} value={query} onChange={e => setQuery(e.target.value)}/><span>{t("MENU")}</span></div><div className="pos-category-cards" role="group" aria-label={t('Catégorie')}>{menuCategories.map(name=><button type="button" key={name} className={'pos-category-card'+(activeCategory===name?' selected':'')} aria-pressed={activeCategory===name} onClick={()=>setCategory(name)}>{t(name)}</button>)}</div>{t(!s.coffeeReady && <div className="inline-warning"><CircleAlert size={18}/><span>{t("Aucune khncha ouverte. ")}{t(manager ? <button className="text-button" onClick={() => show('sack-open')}>{t("Ouvrir maintenant")}</button> : 'Le manager doit en ouvrir une avant de vendre du café.')}</span></div>)}<div className="product-grid">{t(products.map(p => <button type="button" className={"product-card"+(!p.image_path?" without-photo":"")+(cart[p.id]?" in-cart":"")+(p.available===false?" unavailable":"")} key={p.id} disabled={p.available===false} onClick={() => add(p.id)}>{p.image_path && <span className="product-art"><ProductPicture product={p}/></span>}<span className="product-category">{t(p.category)}</span><strong>{t(p.name)}</strong><div><b>{t(euro(p.price))}</b><span className="product-plus">{p.available===false?<X size={20}/>:<Plus size={22}/>}</span></div>{p.available===false&&<span className="product-unavailable">{t('Indisponible')}</span>}{t(cart[p.id] > 0 && <span className="product-qty">{t(cart[p.id])}</span>)}</button>))}</div>{t(!products.length && <Empty text={t("Aucun produit trouv\u00E9.")}/>)}</section><button type="button" className="pos-cart-button" aria-haspopup="dialog" disabled={busy || !cartLines.length} onClick={reviewOrder}><ShoppingBag size={22}/><span>{t('Commande en cours')}</span><b>{number(cartLines.reduce((total,p)=>total+p.qty,0))}</b><strong>{euro(cartTotal)}</strong></button></div>)}
 {t(view === 'sales' && <><div className="mini-stats"><div><span>{t("Ventes confirm\u00E9es")}</span><strong>{t(euro(m.sales))}</strong></div><div><span>{t("En esp\u00E8ces")}</span><strong>{t(euro(m.cash))}</strong></div><div><span>{t("Par carte")}</span><strong>{t(euro(m.card))}</strong></div></div><section className="panel"><div className="table-toolbar"><div className="search-field"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Ticket, produit, caissier\u2026")}/></div><select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">{t("Tous les paiements")}</option><option value="cash">{t("Esp\u00E8ces")}</option><option value="card">{t("Carte")}</option></select></div><SalesTable orders={listOrders}/></section></>)}
 {t(view === 'stock' && <><div className="section-actions"><span className="muted">{t(s.inventory.length)}{t(" articles \u00B7 ")}{t(low.length)}{t(" sous le seuil")}</span>{t(manager && <div><button className="button" onClick={() => show('inventory')}><Plus size={16}/>{t(" Nouvel article")}</button><button className="button gold" onClick={() => show('movement', { kind: 'adjustment' })}><SlidersHorizontal size={16}/>{t(" Ajuster le stock")}</button></div>)}</div><div className="stock-grid">{t(s.inventory.map(i => <section className="panel stock-card" key={i.id}><div className="panel-heading"><span className="stock-unit-label">{t(i.unit)}</span><Badge tone={i.quantity <= i.threshold ? 'red' : 'green'}>{t(i.quantity <= i.threshold ? 'Stock faible' : 'Disponible')}</Badge></div><StockPicture item={i} products={s.products}/><h3>{t(i.name)}</h3><div className="stock-number">{t(number(i.quantity))}<span>{t(i.unit)}{t(i.quantity > 1 && language !== 'ar' ? 's' : '')}</span></div><div className="progress"><i style={{ width: Math.min(i.quantity / Math.max(i.threshold * 4, 1) * 100, 100) + '%' }}/></div><small>{t("Seuil d\u2019alerte : ")}{t(number(i.threshold))} {t(i.unit)}{t(" \u00B7 Dernier co\u00FBt : ")}{t(euro(i.cost))}</small>{t(manager && <div className="inline-buttons"><button className="button small" onClick={() => show('inventory', {item:i})}>{t("Modifier")}</button><button className="button small danger" onClick={() => show('inventory-delete', {item:i})}>{t("Supprimer")}</button></div>)}{t(manager && <button className="text-button" onClick={() => show('movement', { kind: 'purchase', inventory_id: i.id })}>{t("Approvisionner ")}<Plus size={14}/></button>)}</section>))}</div><section className="panel space-top"><div className="panel-heading"><h2>{t("Historique des mouvements")}</h2></div>{t(s.stockMoves.length ? <div className="table-wrap"><table><thead><tr><th>{t("Date")}</th><th>{t("Article")}</th><th>{t("Motif")}</th><th className="right">{t("Quantit\u00E9")}</th></tr></thead><tbody>{t(s.stockMoves.map(i => <tr key={i.id}><td>{t(new Date(i.created).toLocaleString(locale))}</td><td>{t(i.item_name)}</td><td>{t(i.reason)}{t(i.order_id && ` #${i.order_id}`)}</td><td className="right"><Badge tone={i.quantity > 0 ? 'green' : 'neutral'}>{t(i.quantity > 0 ? '+' : '')}{t(number(i.quantity))}</Badge></td></tr>))}</tbody></table></div> : <Empty />)}</section></>)}
 {t(view === 'sacks' && <><div className="section-actions"><p className="muted">{t("1 khncha = 1 kg \u00B7 R\u00E9f\u00E9rence : 65 \u00E9quivalents / kg")}</p>{t(manager && <button className="button gold" disabled={!!active} onClick={() => show('sack-open')}><Plus size={16}/>{t(" Ouvrir une khncha")}</button>)}</div>{manager&&<CoffeePackProgress sacks={s.sacks} stock={Number(s.inventory.find(item=>item.unit==='sac')?.quantity ?? 0)}/>} {manager&&<SackPerformanceChart sacks={s.sacks}/>} {t(active && <section className="panel active-sack-detail"><div><span className="eyebrow">{t("KHNCHA #")}{t(active.id)}{t(" \u00B7 EN COURS")}</span><h2>{t(number(active.equivalents))}{t(" \u00E9quivalents vendus")}</h2><p>{t("Barman responsable")} : <strong>{active.barista_name||t("Non attribué")}</strong></p><p>{t("Ouverte par ")}{t(active.opened_by)}{t(" le ")}{t(new Date(active.opened).toLocaleString(locale))}</p><SackProgress sack={active}/><small>{t("Consommation th\u00E9orique : ")}{t(number(active.equivalents / 65))}{t(" kg \u00B7 Restant th\u00E9orique : ")}{t(number(Math.max(0, active.weight_kg - active.equivalents / 65)))}{t(" kg")}</small><p className="micro-note">{t("Estimation bas\u00E9e sur les ventes. Aucun poids physique n\u2019est mesur\u00E9.")}</p></div><div className="sack-big">{manager&&!active.barista_id&&<button className="button" onClick={()=>show('sack-assign',{id:active.id})}>{t('Attribuer un barman')}</button>}<Wheat size={65} strokeWidth={1}/>{t(manager && <button className="button" onClick={() => show('sack-close', { id: active.id })}>{t("Cl\u00F4turer la khncha")}</button>)}</div></section>)}<section className="panel yield-guide"><h2>{t("Repères de rendement par kg")}</h2><div className="yield-legend"><Badge tone="red">{t("Moins de 65 : à revoir")}</Badge><Badge tone="green">{t("65 à 70 : bon")}</Badge><Badge tone="blue">{t("Plus de 70, moins de 75 : très bon")}</Badge><Badge tone="gold">{t("75 et plus : excellent")}</Badge></div><p className="micro-note">{t("Le bilan final exige un kilogramme entièrement consommé. Un écart invite à vérifier les ventes, les pertes et les doses.")}</p></section><section className="panel space-top"><div className="panel-heading"><h2>{t("Historique des khnchas")}</h2></div>{t(s.sacks.length ? <div className="table-wrap"><table><thead><tr><th>{t("Khncha")}</th><th>{t("Barman")}</th><th>{t("Ouverture")}</th><th>{t("\u00C9quivalents")}</th><th>{t("Rendement final")}</th><th>{t("Évaluation")}</th><th>{t("Statut / cl\u00F4ture")}</th></tr></thead><tbody>{t(s.sacks.map(k => <tr key={k.id}><td className="strong">{t("#")}{t(k.id)}<small>{t(k.opened_by)}</small></td><td>{k.barista_name||t("Non attribué")}</td><td>{t(new Date(k.opened).toLocaleDateString(locale))}</td><td>{t(number(k.equivalents))}</td><td>{t(k.status === 'closed' && k.reason === 'Sac entièrement consommé' ? `${number(k.equivalents / k.weight_kg)} éq./kg` : 'Non mesurable')}{t(k.status === 'closed' && k.reason === 'Sac entièrement consommé' && k.equivalents < k.weight_kg * 65 && <small>{t("\u00C9cart \u00E0 examiner")}</small>)}</td><td><YieldBadge sack={k}/></td><td><Badge tone={k.status === 'active' ? 'green' : 'neutral'}>{t(k.status === 'active' ? 'En cours' : 'Clôturée')}</Badge><small>{t(k.reason)}</small></td></tr>))}</tbody></table></div> : <Empty text={t("Aucune khncha ouverte pour le moment.")}/>)}</section>{manager&&<BaristaSummary sacks={s.sacks}/>}</>)}
 {t((view === 'expenses' || view === 'purchases') && <><div className="mini-stats"><div><span>{t(view === 'expenses' ? 'Dépenses du mois' : 'Achats du mois')}</span><strong>{t(euro(view === 'expenses' ? mo.expenses : mo.purchases))}</strong></div><div><span>{t("P\u00E9riode")}</span><strong className="smaller">{t(new Date(date + 'T12:00:00').toLocaleDateString(locale, { month: 'long', year: 'numeric' }))}</strong></div><div><span>{t("Op\u00E9rations")}</span><strong>{t(s.movements.filter(x => x.kind === (view === 'expenses' ? 'expense' : 'purchase') && x.date.startsWith(date.slice(0, 7))).length)}</strong></div></div><section className="panel"><div className="panel-heading"><h2>{t(view === 'expenses' ? 'Dépenses & charges' : 'Marchandises & fournisseurs')}</h2>{t(manager && <button className="button gold" onClick={() => show('movement', { kind: view === 'expenses' ? 'expense' : 'purchase' })}><Plus size={16}/>{t(view === 'expenses' ? 'Ajouter une dépense' : 'Enregistrer un achat')}</button>)}</div>{t(view === 'purchases' && <p className="panel-note">{t("Saisissez les quantit\u00E9s en unit\u00E9s de stock : un carton de 24 bouteilles = 24 unit\u00E9s.")}</p>)}<MovementTable rows={s.movements.filter(x => x.kind === (view === 'expenses' ? 'expense' : 'purchase') && x.date.startsWith(date.slice(0, 7)))}/></section></>)}
 {t(view === 'employees' && <><div className="section-actions"><span className="muted">{t("Pr\u00E9sences, salaires et avances au m\u00EAme endroit.")}</span><button className="button gold" onClick={() => show('employee')}><Plus size={16}/>{t(" Ajouter un employ\u00E9")}</button></div><div className="employee-grid">{t(s.employees.map(e => { const days = s.workdays.filter(w => w.employee_id === e.id && w.date.startsWith(date.slice(0, 7))), earned = days.reduce((a, w) => a + w.wage, 0), paid = s.movements.filter(w => w.employee_id === e.id && w.date.startsWith(date.slice(0, 7)) && ['salary', 'advance'].includes(w.kind)).reduce((a, w) => a + w.amount, 0), globalBalance = s.workdays.filter(w => w.employee_id === e.id).reduce((a, w) => a + w.wage, 0) - s.movements.filter(w => w.employee_id === e.id && ['salary', 'advance'].includes(w.kind)).reduce((a, w) => a + w.amount, 0); return <section className="panel employee-card" key={e.id}><div className="employee-avatar">{t(e.name[0])}</div><h2>{t(e.name)}</h2><p>{t(e.role)}{t(" \u00B7 ")}{t(euro(e.wage))}{t(" / jour")}</p><div className="employee-numbers"><div><span>{t("Pr\u00E9sences")}</span><strong>{t(days.length)}{t(" j")}</strong></div><div><span>{t("Acquis")}</span><strong>{t(euro(earned))}</strong></div></div><div className="bilan-row"><span>{t("Pay\u00E9 / avanc\u00E9 ce mois")}</span><strong>{t(euro(paid))}</strong></div><div className="bilan-row"><span>{t("Solde global restant")}</span><strong>{t(euro(globalBalance))}</strong></div><div className="employee-buttons"><button className="button" onClick={() => show('employee-order-pin', {employee_id:e.id, employeeName:e.name})}>{t(s.orderWaiters?.some(waiter=>waiter.id===e.id) ? 'Changer le PIN de commande' : 'Définir le PIN de commande')}</button><button className="button" disabled={s.workdays.some(w => w.employee_id === e.id && w.date === date) || busy} onClick={() => mutate('workday', { employee_id: e.id, date }, false)}><Check size={15}/>{t(" Pr\u00E9sent le ")}{t(date.slice(8))}</button><button className="button gold" onClick={() => show('movement', { kind: 'advance', employee_id: e.id })}><Plus size={15}/>{t(" Paiement")}</button></div></section>; }))}</div><section className="panel space-top"><div className="panel-heading"><h2>{t("Historique des paiements")}</h2></div><MovementTable rows={s.movements.filter(x => ['salary', 'advance'].includes(x.kind) && x.date.startsWith(date.slice(0, 7)))}/></section></>)}
 {t(view === 'reports' && <><div className="report-banner"><div><span className="eyebrow">{t("VOTRE MOIS EN CHIFFRES")}</span><h2>{t(new Date(date + 'T12:00:00').toLocaleDateString(locale, { month: 'long', year: 'numeric' }))}</h2><p>{t("Reste = ventes \u2212 achats \u2212 d\u00E9penses \u2212 salaires / avances.")}</p><small>{t("Indicateur de gestion selon votre Excel. Les achats sont d\u00E9duits \u00E0 leur date de paiement ; ce n\u2019est pas un b\u00E9n\u00E9fice comptable.")}</small></div><strong>{t(euro(mo.result))}</strong></div>{manager&&<ProductSalesReport orders={s.orders} products={s.products} movements={s.movements} date={date} onDateChange={setDate} onTicket={id=>show('receipt',{id})}/>}</>)}
 {manager && view==='balance' && <DailyBalance state={s} busy={busy} onClose={()=>show('close',{date:s.today})}/>}
 {manager && view==='receipts' && <ReceiptSettings key={JSON.stringify(s.receiptSettings)} settings={s.receiptSettings||{}} cafeName={s.user.cafe_name} busy={busy} error={error} onSave={body=>mutate('receipt-settings',body,false)}/>}
 {t(view === 'settings' && manager && <><section className="panel accounts-panel"><div className="panel-heading"><h2>{t('Catégories du menu')}</h2><button className="button gold" onClick={()=>show('category')}><Plus size={16}/>{t('Ajouter une catégorie')}</button></div>
 <div className="table-wrap"><table><thead><tr><th>{t('Catégorie')}</th><th>{t('Produits')}</th><th/></tr></thead><tbody>
 {s.categories.map(category=><tr key={category.id}><td className="strong">{t(category.name)}</td><td>{number(s.products.filter(product=>product.category===category.name).length)}</td><td><div className="inline-buttons">
 <button className="button small" onClick={()=>show('category',{category})}>{t('Modifier')}</button>
 <button className="button small danger" onClick={()=>show('category-delete',{category})}>{t('Supprimer')}</button>
 </div></td></tr>)}</tbody></table></div></section><section className="panel accounts-panel"><div className="panel-heading"><h2>{t("Acc\u00E8s \u00E0 votre caf\u00E9")}</h2><button className="button gold" onClick={() => show('account')}><Plus size={16}/>{t(" Nouvel acc\u00E8s")}</button></div><div className="accounts-list">{t(s.accounts.map(a => <div key={a.id}><span className="user-avatar">{t(a.name[0])}</span><div><strong>{t(a.name)}</strong><small>{t(a.username)}</small></div><Badge tone={a.role === 'manager' ? 'neutral' : 'green'}>{t(a.role === 'manager' ? 'Manager' : 'Caissier')}</Badge>{(a.id===s.user.id||a.role==='cashier')&&<button className="button small" onClick={()=>show('account-pin',{account:a})}>{t(a.id===s.user.id?'Changer mon code':'Réinitialiser le code')}</button>}</div>))}</div></section><section className="panel"><div className="panel-heading"><div><h2>{t("Carte & recettes")}</h2><p className="muted">{t("Prix, \u00E9quivalents caf\u00E9 et consommation de stock.")}</p></div><button className="button gold" onClick={() => show('product')}><Plus size={16}/>{t(" Nouveau produit")}</button></div><div className="table-wrap"><table><thead><tr><th>{t("Produit")}</th><th>{t("Cat\u00E9gorie")}</th><th>{t("Prix")}</th><th>{t("\u00C9quivalent caf\u00E9")}</th><th>{t("Recette / stock")}</th><th /></tr></thead><tbody>{t(s.products.map(p => <tr key={p.id}><td className="strong"><span className="catalog-product">{p.image_path && <span className="cart-picture"><ProductPicture product={p}/></span>}{t(p.name)}</span></td><td>{t(p.category)}</td><td>{t(euro(p.price))}</td><td>{t(p.equivalent)}</td><td>{t(p.stock_tracked===false?t('Sans suivi de stock'):Object.entries(p.recipe).map(([id, q]) => `${number(Number(q))} ${t(s.inventory.find(i => i.id === Number(id))?.unit)} ${t(s.inventory.find(i => i.id === Number(id))?.name)}`).join(' · ') || '—')}</td><td><button className="button small" onClick={() => show('product', { product: p })}>{t("Modifier")}</button> <button className="button small danger" onClick={() => show('product-delete', { product: p })}>{t("Supprimer")}</button></td></tr>))}</tbody></table></div></section></>)}
 </main><footer className="app-footer"><span>{t("MONALISA CAF\u00C9")}</span><span>{t("Fait pour les journ\u00E9es bien remplies.")}</span><span>{t("Version \u00B7 0.1")}</span></footer></div>
 {t(toast && <div className="toast" role="status"><Check size={18}/>{t(toast)}<button onClick={() => setToast('')} aria-label={t("Fermer")}><X size={15}/></button></div>)}{t(error && !modal && view !== 'pos' && <div className="error-toast" role="alert">{t(error)}<button onClick={() => setError('')}><X size={15}/></button></div>)}
 {t(modal && <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy)
            setModal(null); }}><section className={'modal ' + (['product','order-edit'].includes(modal.type)?'wide':'')} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><span className="eyebrow">{t("MONALISA CAF\u00C9")}</span><h2 id="modal-title">{t(({ customer: 'Nouveau client', 'customer-detail': 'Compte client', employee: 'Nouvel employé', 'employee-order-pin': 'PIN de commande', 'change-order-pin': 'Mon PIN', inventory: modal.item ? 'Modifier l’article' : 'Nouvel article', 'inventory-delete': 'Supprimer l’article', 'product-delete': 'Supprimer le produit', product: modal.product ? 'Modifier le produit' : 'Nouveau produit', movement: modal.kind === 'salary' || modal.kind === 'advance' ? 'Paiement employé' : kindName[modal.kind], 'sack-assign': 'Attribuer un barman', 'sack-open': 'Ouvrir une khncha', 'sack-close': 'Clôturer la khncha', 'confirm-order': 'Vérifier la commande', receipt: 'Ticket de commande', 'order-edit':'Modifier la commande', cancel: 'Supprimer la commande', close: 'Clôturer la caisse', category: modal.category ? 'Modifier la catégorie' : 'Ajouter une catégorie', 'category-delete': 'Supprimer la catégorie', 'purchase-edit':'Modifier l’achat','purchase-delete':'Supprimer l’achat', account: 'Nouvel accès au café', 'account-pin': 'Modifier le code d’accès' } as Row)[modal.type])}</h2></div><button className="icon-button" onClick={() => !busy && setModal(null)} aria-label={t("Fermer")}><X size={20}/></button></div>
 {t(modal.type === 'confirm-order' ? <><p className="confirmation-intro">{t('Vérifiez les produits et le paiement avant d’enregistrer cette commande.')}</p><div className="cart-lines review-cart-lines">{t(cartLines.length ? cartLines.map(p => {
    const withWater = withWaterByVariant.get(p.id);
    const alternative = withWater ?? withoutWaterByProduct.get(p.id);
    const waterLabel = withWater ? 'Avec eau' : 'Sans eau';
    return <div className="cart-line" key={p.id}>{p.image_path && <span className="cart-picture"><ProductPicture product={p}/></span>}<div><strong>{t(p.name)}</strong><small>{t(euro(p.price))}</small><div className="quantity"><button type="button" disabled={busy} onClick={() => add(p.id, -1)} aria-label={t('Retirer un ' + p.name)}><Minus size={12}/></button><b>{t(p.qty)}</b><button type="button" disabled={busy} onClick={() => add(p.id)} aria-label={t('Ajouter un ' + p.name)}><Plus size={12}/></button></div>{alternative && <button type="button" className="water-variant-button"
    disabled={busy || alternative.available===false || (cart[alternative.id] ?? 0) >= 100}
    onClick={() => switchWaterOption(p.id, alternative.id)}>
    <span className={'water-variant-picture' + (withWater ? '' : ' water-variant-no-water')} aria-hidden="true"><img src="/products/eau-minerale.jpg" alt="" loading="lazy"/></span>
    <span>{p.qty > 1 && '1 × '}{t(waterLabel)}</span><strong>{euro(alternative.price)}</strong>
</button>}</div><strong>{t(euro(p.price * p.qty))}</strong></div>; }) : <Empty text={t("S\u00E9lectionnez les produits \u00E0 gauche.")}/>)}</div><div className="confirmation-payment"><span>{t('Mode de paiement')}</span><Badge tone={modal.payment==='card'?'blue':'green'}>{t(modal.payment==='card'?'Carte':'Espèces')}</Badge></div><div className="confirmation-total"><span>{t('Total')}</span><strong>{euro(cartTotal)}</strong></div><fieldset className="cart-print-options"><legend><Printer size={16}/>{t('Impression automatique')}</legend><div>{[['client','Client'],['barman','Barman'],['both','Client + barman']].map(([value,label])=><label key={value}><input type="radio" name="cart-print-target" value={value} checked={printTarget===value} disabled={busy} onChange={()=>setPrintTarget(value)}/><span>{t(label)}</span></label>)}</div></fieldset><p className="micro-note">{t('La vente et le stock seront mis à jour uniquement après la confirmation finale.')}</p>{error&&<div className="form-error" role="alert">{t(error)}</div>}{s.orderWaiters?.length > 0 && <fieldset className="waiter-picker" disabled={busy}><legend>{t('Serveur de la commande')}</legend><div className="waiter-options">
    {s.orderWaiters.map(waiter=><button type="button" key={waiter.id} className={'waiter-option '+(Number(modal.waiterId)===waiter.id?'is-selected':'')} aria-pressed={Number(modal.waiterId)===waiter.id} onClick={()=>{setError('');setModal({...modal,waiterId:String(waiter.id)});}}>
        <span className="waiter-icon"><Users size={25}/></span><strong>{waiter.name}</strong>{Number(modal.waiterId)===waiter.id?<Check size={16}/>:null}
    </button>)}
</div></fieldset>}
<div className="modal-actions"><button type="button" className="button" disabled={busy} onClick={()=>setModal(null)}>{t('Modifier le panier')}</button><button type="button" className="button gold" disabled={busy || !cartLines.length || (!!s.orderWaiters?.length && !selectedWaiter)} onClick={submitOrder}>{busy?<LoaderCircle className="spin" size={17}/>:<Check size={17}/>} {t('Confirmer et enregistrer')}</button></div></> : modal.type === 'receipt' ? (() => { const o = s.orders.find(x => x.id === modal.id); return o ? <><ReceiptPreview settings={s.receiptSettings||{}} cafeName={s.user.cafe_name} order={o}/><div className="inline-info"><Printer size={17}/>{t("Impression selon le destinataire choisi · format 80 mm")}</div><label className="print-target">{t('Destinataire du reçu')}<select value={printTarget} onChange={e=>setPrintTarget(e.target.value)}><option value="client">{t('Client')}</option><option value="barman">{t('Barman')}</option><option value="both">{t('Client + barman')}</option></select></label><button className="button gold full" onClick={() => printReceipt(o)}><Printer size={17}/>{t(" Imprimer le reçu")}</button>{manager&&o.changes?.length>0&&<div className="order-change-log">{o.changes.map((change:Row,index:number)=><p key={index}><b>{t(change.kind==='edit'?'Modification':'Suppression')} · {change.user_name}</b><br/>{change.reason}<small>{new Date(change.created).toLocaleString(locale)}</small></p>)}</div>}{manager&&o.status==='confirmed'&&<button className="button full" onClick={()=>editOrder(o)}><Pencil size={17}/>{t('Modifier la commande')}</button>}{t(manager && o.status === 'confirmed' && <button className="text-button danger full center" onClick={() => show('cancel', { id: o.id, revision:o.revision })}><RotateCcw size={14}/>{t(" Annuler cette vente avec un motif")}</button>)}</> : <Empty />; })()  : <form onSubmit={async (e) => {
                    e.preventDefault();
                    const f = Object.fromEntries(new FormData(e.currentTarget));
                    let body: Row = { ...f };
                    let type = modal.type;
                    if (type === 'movement') {
                        body.kind = f.kind || modal.kind;
                        if(body.kind==='purchase'){body.payment='cash';body.purchase_unit=f.purchase_unit || 'unit';}
                        if (modal.kind === 'adjustment')
                            body.amount = 0;
                    }
                    if(type==='order-edit'){body.id=modal.order.id;body.revision=modal.order.revision;body.lines=modal.lines.map((l:Row)=>({id:l.id,qty:l.qty}));body.payment=modal.payment;body.expected_total=modal.lines.reduce((total:number,l:Row)=>total+l.price*l.qty,0);}
                    if(type==='purchase-edit'||type==='purchase-delete'){
                        body.id=modal.purchase.id;
                        body.expected=Object.fromEntries(['date','label','quantity','amount','payment','inventory_id'].map(field=>[field,modal.purchase[field]]));
                    }
                    if(type==='cancel')body.revision=modal.revision;
                    if(type==='employee-order-pin')body.employee_id=modal.employee_id;
                    if(type==='account-pin')body.account_id=modal.account.id;
                    if(type==='category'||type==='category-delete')body.id=modal.category?.id;
                    if (type === 'inventory' && modal.item) {
                        body.id = modal.item.id;
                        if (modal.item.unit === 'sac') body.name = modal.item.name;
                    }
                    if (type === 'inventory-delete') body = { id: modal.item.id };
                    if (type === 'product-delete') body = { id: modal.product.id };
                    if (type === 'product' || type === 'inventory') {
                        delete body.photo;
                        const photo = f.photo;
                        if (photo instanceof File && photo.size) {
                            if (!['image/jpeg','image/png','image/webp'].includes(photo.type)) {
                                setError('Choisissez une photo JPG, PNG ou WebP valide.');
                                return;
                            }
                            try {
                                body.image_path = await productPhotoData(photo);
                            } catch (error) {
                                setError(errorNumber(error) === '413' ? requestErrors[413] : 'Impossible de lire la photo. Choisissez une autre image.');
                                return;
                            }
                        }
                        if (body.image_path === 'keep') delete body.image_path;
                        body.id = type === 'product' ? modal.product?.id : modal.item?.id;
                    }
                    if (type === 'sack-close' || type === 'sack-assign' || type === 'cancel')
                        body.id = modal.id;
                    await mutate(type, body);
                }}>
 {modal.type === 'change-order-pin' && <>
    <Field name="employee_id" title={t('Serveur de la commande')} options={s.orderWaiters.filter(w=>!w.locked).map(w=>({value:w.id,label:w.name}))}/>
    <label>{t('Ancien PIN')}<input name="old_pin" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="current-password" required/></label>
    <label>{t('Nouveau PIN')}<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="new-password" required/></label>
 </>}
 {modal.type === 'employee-order-pin' && <>
    <p className="muted">{modal.employeeName}</p>
    <label>{t('PIN de commande à 4 chiffres')}
        <input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="new-password" required/>
    </label>
 </>}
 {['purchase-edit','purchase-delete'].includes(modal.type)&&<>
 <p><strong>{modal.purchase.label}</strong> · {euro(modal.purchase.amount)}</p>
 {modal.type==='purchase-edit'?<>
 <Field name="date" title={t('Date')} type="date" value={modal.purchase.date}/>
 <Field name="label" title={t('Fournisseur / description de l’achat')} value={modal.purchase.label}/>
 <Field name="quantity" title={t('Quantité en unités de stock')} type="number" min="0.001" step="0.001" value={modal.purchase.quantity}/>
 <Field name="amount" title={t('Montant total (DH)')} type="number" min="0.01" value={modal.purchase.amount/100}/>
 </>:<p>{t('Supprimer cet achat et retirer sa quantité du stock ?')}</p>}
 <p className="micro-note">{t('Le stock et les montants du rapport seront corrigés à l’enregistrement.')}</p>
 </>}
 {modal.type==='category'&&<Field name="name" title={t('Nom de la catégorie')} value={modal.category?.name}/>}
 {modal.type==='category-delete'&&<>
 <p>{t('Supprimer la catégorie')} <strong>{t(modal.category.name)}</strong> ?</p>
 <Field name="target_id" title={t('Déplacer les produits vers')} required={false} options={s.categories.filter(category=>category.id!==modal.category.id).map(category=>({value:category.id,label:category.name}))}/>
 <p className="micro-note">{t('Choisissez une destination si la catégorie contient des produits.')}</p>
 </>}
 {modal.type==='account-pin'&&<>
    <p><strong>{modal.account.name}</strong> · {modal.account.username}</p>
    <label>{t('Code manager actuel')}<input name="current_pin" type="password" inputMode="numeric" pattern="[0-9]{4,12}" maxLength={12} autoComplete="current-password" required/></label>
    <label>{t('Nouveau code d’accès')}<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,12}" maxLength={12} autoComplete="new-password" required/></label>
    <label>{t('Confirmer le nouveau code')}<input name="confirm_pin" type="password" inputMode="numeric" pattern="[0-9]{4,12}" maxLength={12} autoComplete="new-password" required/></label>
    <p className="micro-note">{t('Le compte devra se reconnecter après le changement.')}</p>
 </>}
 {t(modal.type === 'account' && <><Field name="name" title={t("Nom de la personne")}/><Field name="username" title={t("Identifiant (unique)")}/><Field name="pin" title={t("Code d\u2019acc\u00E8s (4 \u00E0 12 chiffres)")} type="password"/><Field name="role" title={t("R\u00F4le")} value="cashier" options={[{ value: 'cashier', label: 'Caissier' }, { value: 'manager', label: 'Manager' }]}/><p className="micro-note">{t("Ce compte sera rattach\u00E9 uniquement \u00E0 ")}{t(s.user.cafe_name)}{t(".")}</p></>)}{t(modal.type === 'employee' && <><Field name="name" title={t("Nom de l\u2019employ\u00E9")}/><Field name="role" title={t("Fonction")}/><Field name="wage" title={t("Salaire journalier (DH)")} type="number"/>
 <Field name="username" title={t("Identifiant (unique)")}/>
 <label>{t('Code d’accès (4 à 12 chiffres)')}<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,12}" maxLength={12} autoComplete="new-password" required/></label>
 <p className="micro-note">{t('Un compte caissier sera créé automatiquement pour cet employé.')}</p>
 </>)}
 {modal.type === 'inventory-delete' && <p>{t('Retirer cet article du stock ?')} <strong>{modal.item.name}</strong></p>}
 {modal.type === 'inventory' && <>
    {modal.item?.unit === 'sac' ? <p><strong>{t(modal.item.name)}</strong></p> : <Field name="name" title={t('Nom de l’article')} value={modal.item?.name}/>}
    {modal.item ? <p>{t('Unité de stock')} · {t(modal.item.unit)}</p> : <Field name="unit" title={t('Unité de stock')} options={['unité','kg','litre','sac'].map(value=>({value,label:value}))}/>}
    <Field name="threshold" title={t('Seuil d’alerte')} type="number" min="0.01" value={modal.item?.threshold}/>
    <Field name="cost" title={t('Coût d’achat par unité (DH)')} type="number" value={modal.item ? modal.item.cost / 100 : undefined}/>
    <Field name="image_path" title={t('Photo du produit')} required={false} value={modal.item?.image_path?'keep':''} options={[
        ...(modal.item?.image_path?[{value:'keep',label:'Conserver la photo actuelle'}]:[]),
        {value:'',label:'Illustration automatique'},
    ]}/>
    {modal.item && <StockPicture item={modal.item} products={s.products}/>}
    <label>{t('Importer une photo (JPG, PNG, WebP)')}<input type="file" name="photo" accept="image/jpeg,image/png,image/webp"/></label>
    {!modal.item && <p className="micro-note">{t('Stock initial : 0. Enregistrez ensuite un achat ou un ajustement.')}</p>}
 </>}
 {t(modal.type === 'movement' && <>{t(['salary', 'advance'].includes(modal.kind) && <Field name="kind" title={t("Type de paiement")} value={modal.kind} options={[{ value: 'advance', label: 'Avance sur salaire' }, { value: 'salary', label: 'Règlement de salaire' }]}/>)}<Field name="date" title={t("Date")} type="date" value={date}/>{t(modal.kind === 'expense' && <Field name="category" title={t("Cat\u00E9gorie")} options={['Dépenses du jour', 'Loyer', 'Électricité', 'Eau', 'Internet / abonnement', 'Nettoyage', 'Réparation', 'Autre'].map(x => ({ value: x, label: x }))}/>)}<Field name="label" title={t(modal.kind === 'purchase' ? 'Fournisseur / description de l’achat' : 'Description / motif')}/>{t(['purchase', 'adjustment'].includes(modal.kind) && <><Field name="inventory_id" title={t("Article")} value={modal.inventory_id} options={inventoryOptions} onChange={e=>setModal(current=>({...current,inventory_id:Number(e.target.value),purchase_unit:'unit'}))}/>{modal.kind==='purchase'&&s.inventory.some(item=>item.id===Number(modal.inventory_id)&&item.unit==='sac'&&item.name==='Khnchas café')&&<Field name="purchase_unit" key={modal.inventory_id} title={t('Conditionnement')} value="pack6" options={[{value:'pack6',label:'Lot de 6 khnchas (6 kg)'},{value:'unit',label:'Khncha de 1 kg'}]}/>}<Field name="quantity" title={t('Quantité')} type="number" min="0.001" step="0.001"/>{t(modal.kind === 'adjustment' && <Field name="direction" title={t("Sens du mouvement")} value="out" options={[{ value: 'out', label: 'Sortie — perte / casse' }, { value: 'in', label: 'Entrée — correction' }]}/>)}</>)}{t(modal.kind !== 'adjustment' && <Field name="amount" title={t("Montant total (DH)")} type="number" min="0.01"/>)}{t(['salary', 'advance'].includes(modal.kind) && <><Field name="employee_id" title={t("Employ\u00E9")} value={modal.employee_id} options={employeeOptions}/><p className="micro-note">{t("Saisissez uniquement le montant r\u00E9ellement vers\u00E9. Les avances d\u00E9j\u00E0 pay\u00E9es ne doivent pas \u00EAtre incluses une deuxi\u00E8me fois.")}</p></>)} {modal.kind!=='purchase'&&<Field name="payment" title={t("Mode de paiement")} value="cash" options={paymentOptions}/>}</>)}
 {modal.type === 'product-delete' && <p>{t('Retirer ce produit du menu ? Les ventes déjà enregistrées sont conservées.')} <strong>{modal.product.name}</strong></p>}
 {t(modal.type === 'product' && <><div className="form-two"><Field name="name" title={t("Nom du produit")} value={modal.product?.name}/><Field name="category" title={t("Cat\u00E9gorie")} value={modal.product?.category} options={categoryOptions}/><Field name="price" title={t("Prix de vente (DH)")} type="number" value={modal.product ? modal.product.price / 100 : undefined}/><Field name="equivalent" title={t("\u00C9quivalent caf\u00E9 (0 si aucun)")} type="number" value={modal.product?.equivalent || 0}/></div><Field name="image_path" title={t("Photo du produit")} required={false} value={modal.product?.image_path ? 'keep' : ''} options={[
 ...(modal.product?.image_path ? [{value:'keep',label:'Conserver la photo actuelle'}] : []),{value:'',label:'Illustration automatique'},...[...catalogProducts,...coffeePhotos,...additionalMenuPhotos].map(p=>({value:p.image_path,label:p.name}))]}/>{modal.product?.image_path && <span className="cart-picture"><ProductPicture product={modal.product}/></span>}<label>{t('Importer une photo (JPG, PNG, WebP)')}<input type="file" name="photo" accept="image/jpeg,image/png,image/webp"/></label></>)}
 {modal.type==='order-edit'&&<><p className="micro-note">{t('Correction du ticket')} #{modal.order.id} · {t('Les prix des lignes existantes sont conservés.')}</p><div className="edit-order-lines">{modal.lines.map((line:Row)=><div className="edit-order-line" key={line.id}>{line.image_path && <span className="cart-picture"><ProductPicture product={line}/></span>}<div><strong>{t(line.name)}</strong><small>{euro(line.price)}</small></div><label>{t('Quantité')}<input type="number" min="1" max="100" step="1" required value={line.qty} onChange={e=>{const qty=Number(e.target.value);setModal(current=>({...current,lines:current!.lines.map((l:Row)=>l.id===line.id?{...l,qty}:l)}));}}/></label><button type="button" className="icon-button danger" aria-label={t('Retirer un '+line.name)} onClick={()=>setModal(current=>({...current,lines:current!.lines.filter((l:Row)=>l.id!==line.id)}))}><Trash2 size={20}/></button></div>)}</div><label>{t('Ajouter un produit')}<select value="" onChange={e=>{const p=s.products.find(p=>p.id===Number(e.target.value));if(p)setModal(current=>({...current,lines:[...current!.lines,{...p,...current!.order.lines.find((l:Row)=>l.id===p.id),qty:1}]}));}}><option value="">{t('Choisir…')}</option>{s.products.filter(p=>!modal.lines.some((l:Row)=>l.id===p.id)).map(p=><option key={p.id} value={p.id}>{t(p.name)} · {euro(p.price)}</option>)}</select></label><Field name="payment" title={t('Mode de paiement')} value={modal.payment} options={[{value:'cash',label:'Espèces'},...(modal.order.payment==='card'?[{value:'card',label:'Carte'}]:[])]} onChange={e=>setModal(current=>({...current,payment:e.target.value}))}/><div className="confirmation-total"><span>{t('Total')}</span><strong>{euro(modal.lines.reduce((total:number,l:Row)=>total+l.price*l.qty,0))}</strong></div><Field name="reason" title={t('Motif obligatoire')}/><p className="micro-note">{t('Le total, le stock et la khncha seront corrigés à l’enregistrement.')}</p></>}
 {modal.type==='sack-assign'&&<><Field name="barista_id" title={t('Barman responsable')} options={employeeOptions}/><p className="micro-note">{t('Cette attribution conserve les ventes et le stock de la khncha en cours.')}</p></>}
 {t(modal.type === 'sack-open' && <><Field name="barista_id" title={t("Barman responsable")} value={s.employees.find(e=>['barista','barman','محضر القهوة','بارمان'].includes(String(e.role).toLowerCase()))?.id} options={employeeOptions}/><div className="open-sack-art"><Wheat size={55} strokeWidth={1}/></div><p>{t("Une khncha de ")}<b>{t("1 kg")}</b>{t(" sera ouverte sous votre responsabilit\u00E9 et retir\u00E9e du stock de sacs ferm\u00E9s.")}</p><div className="inline-info">{t("R\u00E9f\u00E9rence : 65 \u00E9quivalents \u00B7 65 \u00E9quivalents / kg")}</div><p className="micro-note">{t("Elle reste active sur plusieurs jours, jusqu\u2019\u00E0 sa cl\u00F4ture par le manager.")}</p></>)}
 {t(modal.type === 'sack-close' && <><p>{t("Le rendement final est calculable uniquement si le kilogramme a été entièrement consommé.")}</p><Field name="reason" title={t("Motif de cl\u00F4ture")} options={['Sac entièrement consommé', 'Clôture anticipée / reste de café', 'Perte ou renversement', 'Remplacement exceptionnel'].map(x => ({ value: x, label: x }))}/></>)}
 {t(modal.type === 'cancel' && <><div className="inline-warning">{t("La vente sera annul\u00E9e et les ingr\u00E9dients r\u00E9int\u00E9gr\u00E9s au stock. \u00C0 utiliser uniquement si les produits n\u2019ont pas \u00E9t\u00E9 consomm\u00E9s.")}</div><Field name="reason" title={t("Motif obligatoire")}/></>)}
 {t(modal.type === 'close' && <><Field name="date" title={t("Journ\u00E9e \u00E0 cl\u00F4turer")} type="date" value={modal.date||s.today}/><Field name="opening" title={t("Fond de caisse au d\u00E9but du jour (DH)")} type="number" value="0"/><Field name="counted" title={t("Esp\u00E8ces r\u00E9ellement compt\u00E9es (DH)")} type="number"/><p className="micro-note">{t("Attendu = fond de caisse + ventes esp\u00E8ces \u2212 toutes les sorties esp\u00E8ces. La cl\u00F4ture verrouille la journ\u00E9e.")}</p></>)}
 {t(error && <div className="form-error" role="alert">{t(error)}</div>)}<div className="modal-actions"><button className="button" type="button" onClick={() => setModal(null)} disabled={busy}>{t("Annuler")}</button><button className="button gold" disabled={busy}>{t(busy ? <LoaderCircle className="spin" size={17}/> : <Check size={17}/>)} {t(modal.type === 'sack-open' ? 'Ouvrir la khncha' : modal.type === 'close' ? 'Clôturer la journée' : ['cancel','product-delete','inventory-delete'].includes(modal.type)?'Supprimer':'Enregistrer')}</button></div></form>)}
 </section></div>)}
 </div>;
}
