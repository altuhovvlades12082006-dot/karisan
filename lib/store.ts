import {env} from 'cloudflare:workers';
import seed from '../data/catalog-seed.json';
import {adminSession} from './admin-session';
export function db(){if(!env.DB)throw Error('Database unavailable');return env.DB;}
export function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
export const isAdmin=adminSession;
export function sameOrigin(r:Request){return r.headers.get('origin')===new URL(r.url).origin;}
export async function guard(r:Request,write=false){
  if(!await isAdmin(r))return json({error:'Потрібен вхід'},401);
  if(write&&!sameOrigin(r))return json({error:'Неприпустиме джерело запиту'},403);
  return null;
}
export async function boundedBody(r:Request,limit:number){
  if(Number(r.headers.get('content-length'))>limit)throw Error('Файл або запит завеликий');
  const reader=r.body?.getReader();if(!reader)throw Error('Порожній запит');
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('Файл або запит завеликий');}chunks.push(value);}}finally{reader.releaseLock();}
  const all=new Uint8Array(size);let off=0;for(const c of chunks){all.set(c,off);off+=c.length;}return all;
}
export async function initializeCatalog(){
  const database=db();
  if(await database.prepare("SELECT key FROM settings WHERE key='catalog-seeded'").first())return;
  const now=new Date().toISOString();
  await database.batch([
    ...seed.map(p=>database.prepare("INSERT OR IGNORE INTO products (id,data,version,archived,updated_at) SELECT ?,?,1,0,? WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key='catalog-seeded')").bind(p.id,JSON.stringify(p),now)),
    database.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('catalog-seeded',?)").bind(now)
  ]);
}
export async function catalog(){
  if(!await db().prepare("SELECT key FROM settings WHERE key='catalog-seeded'").first())return seed;
  const {results}=await db().prepare('SELECT data FROM products WHERE archived=0 ORDER BY rowid').all<{data:string}>();return results.map(p=>JSON.parse(p.data));
}
