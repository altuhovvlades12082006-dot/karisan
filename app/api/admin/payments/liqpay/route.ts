import {env} from 'cloudflare:workers';
import {guard,json,boundedBody} from '../../../../../lib/store';
import {usesSupabase} from '../../../../../lib/supabase-catalog.mjs';
import {liqpaySettings,sandboxPayment} from '../../../../../lib/liqpay-service.mjs';
export async function POST(r:Request){
  const denied=await guard(r,true);if(denied)return denied;
  if(!usesSupabase(env))return json({error:'Payment unavailable'},503);
  try{liqpaySettings(env);}catch{return json({error:'Потрібні sandbox-ключі LiqPay та HTTPS-домен'},503);}
  try{const body=JSON.parse(new TextDecoder().decode(await boundedBody(r,1000)));
    return json({sandbox:true,checkout:await sandboxPayment(env,body.id)});
  }catch{return json({error:'Не вдалося створити тестову оплату'},400);}
}
