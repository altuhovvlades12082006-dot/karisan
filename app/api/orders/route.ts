import {json,sameOrigin,boundedBody,db} from '../../../lib/store';
import {Conflict,createOrder} from '../../../lib/crm';
import {digest} from '../../../lib/password-auth.mjs';
import {env} from 'cloudflare:workers';
import {usesSupabase,CommerceError} from '../../../lib/supabase-catalog.mjs';
import {createSupabaseOrder} from '../../../lib/supabase-checkout.mjs';
import {requestCountry} from '../../../lib/request-country';
export async function POST(r:Request){
  if(usesSupabase(env)&&env.SUPABASE_CHECKOUT_ENABLED!=='true')return json({error:'Приймання замовлень ще не відкрите'},503);
  if(!sameOrigin(r))return json({error:'Неприпустиме джерело запиту'},403);
  const now=Date.now(),window=Math.floor(now/900000),key='orders:'+await digest((r.headers.get('cf-connecting-ip')||'local')+':'+window);
  const attempts=await db().prepare('INSERT INTO login_attempts (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,(window+1)*900000).first<{count:number}>();
  if(!attempts||attempts.count>30)return json({error:'Забагато спроб. Спробуйте пізніше'},429);
  try{const body=JSON.parse(new TextDecoder().decode(await boundedBody(r,18000)));return json(usesSupabase(env)?await createSupabaseOrder(env,body,requestCountry()):await createOrder(body));}
  catch(e){if(usesSupabase(env))return json({error:e instanceof CommerceError?e.message:'Не вдалося оформити замовлення. Перевірте кошик і доставку.'},e instanceof CommerceError?e.status:400);
    return json({error:e instanceof Conflict?e.message:'Перевірте дані: '+(e instanceof Error&&!e.message.includes('D1')?e.message:'не вдалося створити замовлення')},e instanceof Conflict?409:400);}
}
