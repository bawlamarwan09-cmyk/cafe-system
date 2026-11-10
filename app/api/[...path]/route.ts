import { NextRequest, NextResponse } from 'next/server';
import { store } from '../../../lib/store.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const response=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:NextRequest){const u=store().session(req.cookies.get('monalisa_session')?.value);if(!u)return response({error:'Connexion requise.'},401);try{return response(store().state(u,req.nextUrl.searchParams.get('date')||undefined));}catch{return response({error:'Date invalide.'},400);}}
export async function POST(req:NextRequest,context:{params:Promise<{path:string[]}>}){
 if(req.headers.get('origin')!==(process.env.MONALISA_ORIGIN || new URL(req.url).origin))return response({error:'Origine refusée.'},403);
 try{const {path}=await context.params;const body=await req.json();
  if(path[0]==='login'){const token=store().login(body.username,body.pin,String(body.username||''));const r=response({ok:true});r.cookies.set('monalisa_session',token,{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',maxAge:43200,path:'/'});return r;}
  const token=req.cookies.get('monalisa_session')?.value;const u=store().session(token);if(!u)return response({error:'Connexion requise.'},401);
  if(path[0]==='logout'){store().logout(token);const r=response({ok:true});r.cookies.delete('monalisa_session');return r;}
  const result=store().action(u,path[0],body);return response({ok:true,...result});
 }catch(e){const message=e instanceof Error?e.message:'Erreur inattendue.';return response({error:message.includes('UNIQUE')?'Cette opération existe déjà.':message},400);}
}
