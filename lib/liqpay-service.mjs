import {createSandboxCheckout,verifySandboxCallback,amountInKopecks} from '../integrations/liqpay.mjs';
import {supabaseClient} from './supabase-catalog.mjs';

// Deliberately no live mode. Sandbox callbacks never update real payment_status.
export function liqpaySettings(env){
  const origin=new URL(env.PUBLIC_SITE_URL||'https://invalid.local');
  if(origin.protocol!=='https:'||origin.hostname==='invalid.local'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error('Payment unavailable');
  const version=Number(env.LIQPAY_API_VERSION);
  if(env.LIQPAY_MODE!=='sandbox'||!env.LIQPAY_PUBLIC_KEY?.startsWith('sandbox_')||!env.LIQPAY_PRIVATE_KEY||![3,7].includes(version))throw Error('Payment unavailable');
  return {mode:'sandbox',version,publicKey:env.LIQPAY_PUBLIC_KEY,privateKey:env.LIQPAY_PRIVATE_KEY,
    webhookUrl:origin.origin+'/api/payments/liqpay',resultUrl:origin.origin+'/'};
}

export async function sandboxPayment(env,id,fetcher=fetch){
  const config=liqpaySettings(env);
  if(typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))throw Error('Invalid order');
  const query=new URLSearchParams({select:'id,total,status,payment_method,payment_status,sandbox_payment_status,idempotency_key',id:'eq.'+id,limit:'1'});
  const rows=await(await supabaseClient(env,fetcher)('/rest/v1/orders?'+query)).json(),row=rows[0];
  if(!row||!['new','processing'].includes(row.status)||!row.idempotency_key||row.sandbox_payment_status==='paid')throw Error('Invalid order');
  return createSandboxCheckout({id:row.id,amount:amountInKopecks(row.total),currency:'UAH',payment:row.payment_method,paymentStatus:row.payment_status},config);
}

export async function recordSandboxCallback(env,data,signature,fetcher=fetch){
  const fact=verifySandboxCallback(data,signature,liqpaySettings(env));
  return (await supabaseClient(env,fetcher)('/rest/v1/rpc/server_record_sandbox_payment',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload:fact})
  })).json();
}
