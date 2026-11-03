import adapter from '../../../integrations/delivery-worker.mjs';
import {env} from 'cloudflare:workers';
import {db,json,sameOrigin,boundedBody} from '../../../lib/store';
import {digest} from '../../../lib/password-auth.mjs';
import {novaQuote,DeliveryError} from '../../../integrations/nova-poshta.mjs';
async function limited(request:Request){
  if(!env.NOVA_POSHTA_API_KEY&&!env.UKRPOSHTA_BEARER)return null;
  const window=Math.floor(Date.now()/60000),key='delivery:'+await digest((request.headers.get('cf-connecting-ip')||'local')+':'+window);
  const row=await db().prepare('INSERT INTO login_attempts (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,(window+1)*60000).first<{count:number}>();
  return !row||row.count>60?json({error:'too_many_requests'},429):null;
}
export async function GET(request:Request){try{const denied=await limited(request);return denied||await adapter.fetch(request,env);}catch{return json({error:'delivery_unavailable'},503);}}
export async function POST(request:Request){
  if(!sameOrigin(request))return json({error:'invalid_origin'},403);
  try{const denied=await limited(request);if(denied)return denied;
    if(!env.NOVA_POSHTA_API_KEY)return json({error:'not_configured'},503);
    const body=JSON.parse(new TextDecoder().decode(await boundedBody(request,3000)));
    return json(await novaQuote(env,body));
  }catch(e){return json({error:e instanceof DeliveryError?e.message:'invalid_quote'},e instanceof DeliveryError?e.status:400);}
}
