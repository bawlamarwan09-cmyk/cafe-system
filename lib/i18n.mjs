'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { arabic } from './translations.mjs';

const templates=Object.entries(arabic).filter(([key])=>key.includes('{')).sort(([a],[b])=>b.replace(/\{\w+\}/g,'').length-a.replace(/\{\w+\}/g,'').length).map(([key,value])=>{
 const names=[];const pattern=key.split(/(\{\w+\})/).map(part=>{if(/^\{\w+\}$/.test(part)){names.push(part.slice(1,-1));return '(.+?)';}return part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}).join('');
 return {regex:new RegExp('^'+pattern+'$'),names,value};
});
/** Translate display strings only. Stored values and user input stay unchanged. */
export function translate(value,language='ar') {
 if(language!=='ar'||typeof value!=='string')return value;
 const key=value.replace(/\s+/g,' ').trim();if(!key)return value;
 let text=arabic[key];
 if(!text)for(const entry of templates){const match=key.match(entry.regex);if(match){text=entry.value.replace(/\{(\w+)\}/g,(_,name)=>String(translate(match[entry.names.indexOf(name)+1],language)));break;}}
 if(!text)text=key.replace(/\bDH\b/g,'د.م.');
 return (/^\s/.test(value)?' ':'')+text+(/\s$/.test(value)?' ':'');
}
export const LanguageContext=createContext({language:'ar',setLanguage:(_language)=>{}});
export function LanguageProvider({children}){
 const [language,setLanguage]=useState('ar');
 useEffect(()=>{try{const saved=localStorage.getItem('monalisa-language');if(saved==='ar'||saved==='fr')setLanguage(saved);}catch{}},[]);
 useEffect(()=>{document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';},[language]);
 const change=language=>{if(!['ar','fr'].includes(language))return;setLanguage(language);try{localStorage.setItem('monalisa-language',language);}catch{}};
 return React.createElement(LanguageContext.Provider,{value:{language,setLanguage:change}},React.createElement('div',{className:'locale-root',lang:language,dir:language==='ar'?'rtl':'ltr'},children));
}
export function useTranslation(){const {language,setLanguage}=useContext(LanguageContext);const locale=language==='ar'?'ar-MA-u-nu-latn':'fr-MA';return {language,setLanguage,locale,t:value=>translate(value,language),number:value=>new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(value||0),money:value=>new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format((value||0)/100)+(language==='ar'?' د.م.':' DH')};}
export function LanguageSwitcher(){const {language,setLanguage}=useTranslation();return React.createElement('div',{className:'language-switch',role:'group','aria-label':language==='ar'?'لغة الواجهة':'Langue de l’interface'},React.createElement('button',{type:'button',lang:'ar','aria-pressed':language==='ar',className:language==='ar'?'selected':'',onClick:()=>setLanguage('ar')},'العربية'),React.createElement('button',{type:'button',lang:'fr','aria-pressed':language==='fr',className:language==='fr'?'selected':'',onClick:()=>setLanguage('fr')},'FR'));}
