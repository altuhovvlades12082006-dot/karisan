import {env} from 'cloudflare:workers';
import {boundedBody,json} from '../../../../lib/store';
import {usesSupabase} from '../../../../lib/supabase-catalog.mjs';
import {liqpaySettings,recordSandboxCallback} from '../../../../lib/liqpay-service.mjs';

// No browser session/Origin requirement: LiqPay sends server-to-server callbacks.
// Signature, persisted amount/order and durable replay checks are mandatory.
export async function POST(r:Request){
  if(!usesSupabase(env))return json({error:'Payment unavailable'},503);
  try{liqpaySettings(env);}catch{return json({error:'Payment unavailable'},503);}
  if(!r.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded'))return json({error:'Invalid callback'},415);
  let form;
  try{form=new URLSearchParams(new TextDecoder().decode(await boundedBody(r,35000)));
    if(form.getAll('data').length!==1||form.getAll('signature').length!==1)return json({error:'Invalid callback'},400);
  }catch{return json({error:'Invalid callback'},400);}
  try{return json(await recordSandboxCallback(env,form.get('data'),form.get('signature')));}
  catch(e){return json({error:'Callback not accepted'},e instanceof Error&&e.message==='Supabase unavailable'?503:400);}
}
