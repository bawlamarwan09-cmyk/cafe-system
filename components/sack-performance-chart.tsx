'use client';
import {useState} from 'react';
import {BarChart3, Coffee, ChevronRight} from 'lucide-react';
import {useTranslation} from '../lib/i18n.mjs';
import {sackPerformance} from '../lib/coffee-performance.mjs';

type Sack = Record<string, any>;
const colors:Record<string,string>={review:'#a44736',good:'#3d7248',very_good:'#426f9b',excellent:'#a67b23',in_progress:'#887e6b',unavailable:'#a29988'};

export default function SackPerformanceChart({sacks}:{sacks:Sack[]}) {
 const {t,number,locale}=useTranslation();
 // null follows the latest active bag, including a new bag opened by the manager.
 const [selectedId,setSelectedId]=useState<number|null>(null);
 const ordered=[...sacks].sort((a,b)=>Number(b.id)-Number(a.id));
 const latest=ordered.find(s=>s.status==='active')||ordered[0];
 const selected=ordered.find(s=>s.id===selectedId)||latest;
 const choose=(id:number)=>setSelectedId(id===latest?.id?null:id);
 const recent=ordered.slice(0,12);
 const visible=(selected&&!recent.some(s=>s.id===selected.id)?[...recent.slice(0,11),selected]:recent).sort((a,b)=>Number(a.id)-Number(b.id));
 const point=(s:Sack)=>{
  const result=sackPerformance(s);
  const live=s.status==='active';
  const progress=Number(s.weight_kg)>0?Number(s.equivalents)/Number(s.weight_kg):0;
  return {sack:s,result,live,value:result.rate??(live&&Number.isFinite(progress)?progress:null)};
 };
 const points=visible.map(point);
 const maximum=Math.max(90,Math.ceil(Math.max(0,...points.map(p=>p.value||0))/10)*10+10);
 const result=selected?sackPerformance(selected):null;
 const formatDate=(value:string)=>value?new Date(value).toLocaleDateString(locale,{day:'numeric',month:'short'}):'—';
 const weight=selected?Number(selected.weight_kg):0;
 const remaining=selected?Math.max(0,weight*65-Number(selected.equivalents)):0;
 const barLabel=(p:ReturnType<typeof point>)=>`${t('Khncha')} #${p.sack.id} · ${p.value===null?t('Non mesurable'):number(p.value)+' '+t('éq./kg')} · ${t(p.result.label)}`;

 return <section className="panel sack-analysis" aria-label={t('Graphique des khnchas et résultat sélectionné')}>
  <div className="sack-analysis-heading"><div><span className="eyebrow">{t('SUIVI DU BARMAN')}</span><h2><BarChart3 size={20}/>{t('Rendement par khncha')}</h2><p>{t('Choisissez une barre pour voir le résultat de cette khncha.')}</p></div>{selected&&<label className="sack-selector">{t('Khncha affichée')}<select value={selectedId===null?'live':String(selected.id)} onChange={e=>e.target.value==='live'?setSelectedId(null):choose(Number(e.target.value))}><option value="live">{t('Suivre la khncha la plus récente')}</option>{ordered.map(s=><option key={s.id} value={s.id}>#{s.id} · {s.barista_name||t('Non attribué')} · {t(s.status==='active'?'En cours':'Clôturée')}</option>)}</select></label>}</div>
  {!selected?<div className="empty"><Coffee size={32}/><p>{t('Ouvrez une khncha pour commencer le graphique.')}</p></div>:<div className="sack-analysis-layout">
   <div className="sack-plot-panel"><div className="sack-plot-caption"><strong>{t('Équivalents par kg de khncha')}</strong><span>{visible.length} {t('khnchas affichées')}</span></div><div className="sack-plot-scroll"><div className="sack-plot" style={{minWidth:Math.max(330,visible.length*62+50)}}>
    <div className="sack-axis"><span style={{bottom:'100%'}}>{number(maximum)}</span>{[0,25,50].filter(n=>n<maximum).map(n=><span key={n} style={{bottom:`${n/maximum*100}%`}}>{number(n)}</span>)}</div>
    <div className="sack-bars-region">
     {[65,70,75].map(n=><div key={n} className={'sack-reference reference-'+n} style={{bottom:`${n/maximum*100}%`}}><span>{n}</span></div>)}
     <div className="sack-bars" style={{gridTemplateColumns:`repeat(${Math.max(1,points.length)},minmax(44px,1fr))`}}>
      {points.map(p=><button type="button" key={p.sack.id} data-sack-id={p.sack.id} className={'sack-bar-button '+(selected.id===p.sack.id?'is-selected ':'')+(p.live?'is-live ':'')+(p.value===null?'is-unavailable':'')} onClick={()=>choose(p.sack.id)} aria-label={barLabel(p)} aria-pressed={selected.id===p.sack.id} title={barLabel(p)}><span className="sack-bar-fill" style={{height:`${Math.max(p.value===null?0:2,(p.value||0)/maximum*100)}%`,backgroundColor:colors[p.result.key]}}><b>{p.value===null?'—':number(p.value)}</b></span><span className="sack-bar-axis-label">#{p.sack.id}</span><span className="sack-bar-date">{formatDate(p.sack.opened)}</span></button>)}
     </div>
    </div>
   </div></div><div className="sack-chart-legend"><span><i className="legend-good"/>{t('65 à 70 : bon')}</span><span><i className="legend-very-good"/>{t('Plus de 70, moins de 75 : très bon')}</span><span><i className="legend-excellent"/>{t('75 et plus : excellent')}</span><span><i className="legend-review"/>{t('Moins de 65 : à revoir')}</span></div><p className="micro-note">{t('Barres pleines : résultat final. Hachures : avancement provisoire. Une clôture anticipée n’est pas comparable.')}</p></div>
   <aside className={'sack-result result-'+result!.key} data-selected-sack={selected.id} aria-live="polite"><div className="sack-result-title"><span>{t('Résultat de la khncha')}</span><strong>#{selected.id}</strong></div><span className={'badge '+result!.tone}>{t(result!.label)}</span><div className="sack-result-value">{number(result!.rate??Number(selected.equivalents))}<small>{t(result!.rate===null?'équivalents vendus':'éq./kg')}</small></div><dl><div><dt>{t('Barman responsable')}</dt><dd>{selected.barista_name||t('Non attribué')}</dd></div><div><dt>{t('Poids initial')}</dt><dd>{number(weight)} {t('kg')}</dd></div><div><dt>{t('Équivalents')}</dt><dd>{number(Number(selected.equivalents))}</dd></div><div><dt>{t('Ouverture')}</dt><dd>{formatDate(selected.opened)}</dd></div><div><dt>{t('Statut / clôture')}</dt><dd>{t(selected.status==='active'?'En cours':'Clôturée')}{selected.reason&&<small>{t(selected.reason)}</small>}</dd></div></dl>
    {result!.rate!==null?<div className="sack-result-insight"><span>{t('Écart avec le minimum de 65')}</span><b>{result!.rate>=65?'+':''}{number(result!.rate-65)} {t('éq./kg')}</b></div>:<p className="sack-result-note">{selected.status==='active'?(remaining>0?t('Encore {count} équivalents pour le minimum').replace('{count}',number(remaining)):t('Minimum atteint — suivi en cours')):t('Le sac n’a pas été entièrement consommé : aucun classement final.')}</p>}
    <div className="sack-result-targets"><span>{t('Minimum')} <b>65</b></span><ChevronRight size={13}/><span>{t('Excellent')} <b>75</b></span><small>{t('éq./kg')}</small></div>
   </aside>
  </div>}
 </section>;
}
