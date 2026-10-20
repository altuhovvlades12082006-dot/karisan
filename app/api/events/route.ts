import {db,json,sameOrigin,boundedBody,isAdmin} from '../../../lib/store';
import {validateEvent,shopDay,shiftDay} from '../../../lib/statistics.mjs';
import {digest} from '../../../lib/password-auth.mjs';
export async function POST(r:Request){
  if(!sameOrigin(r))return json({error:'Forbidden'},403);
  if(r.headers.get('dnt')==='1'||/bot|crawler|spider|headless|preview/i.test(r.headers.get('user-agent')||'')||await isAdmin(r))return new Response(null,{status:204});
  let events:ReturnType<typeof validateEvent>[];
  try{const body=JSON.parse(new TextDecoder().decode(await boundedBody(r,10000)));if(!Array.isArray(body.events)||!body.events.length||body.events.length>10)throw Error();events=body.events.map(validateEvent);}catch{return json({error:'Invalid events'},400);}
  const now=Date.now(),day=shopDay(),database=db(),window=Math.floor(now/900000);
  const key='analytics:'+await digest((r.headers.get('cf-connecting-ip')||'local')+':'+window);
  const limit=await database.prepare('INSERT INTO login_attempts (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,(window+1)*900000).first<{count:number}>();
  if(!limit||limit.count>120)return json({error:'Too many events'},429);
  // No IP addresses, names, contact details, URLs or search terms are stored.
  await database.batch([
    ...events.map(e=>database.prepare('INSERT OR IGNORE INTO analytics_events (id,session,type,day,created_at,product_id,device,source) VALUES (?,?,?,?,?,?,?,?)').bind(e.id,e.session,e.type,day,now,e.productId,e.device,e.source)),
    database.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('analytics-started',?)").bind(new Date(now).toISOString()),
    database.prepare('DELETE FROM analytics_events WHERE id IN (SELECT id FROM analytics_events WHERE day<? LIMIT 200)').bind(shiftDay(day,-89)),
    database.prepare('DELETE FROM login_attempts WHERE expires_at<?').bind(now),
  ]);
  return new Response(null,{status:204});
}
