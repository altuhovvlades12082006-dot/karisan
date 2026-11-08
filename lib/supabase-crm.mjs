import {supabaseClient,CommerceError} from './supabase-catalog.mjs';
import {inputText} from './order-validation.mjs';

const money=value=>Math.round(Number(value||0)*100);
export function mapOrder(row){
  return {...row,number:row.order_number,amount:money(row.total),paid:Number(row.paid??(row.payment_status==='paid'?money(row.total):0)),
    refunded:Number(row.refunded||0),name:row.customer_name,tracking:row.tracking||row.delivery_reference?.tracking||'',
    data:{customer:{name:row.customer_name,phone:row.phone,email:row.customer_email||''},
      delivery:{carrier:row.carrier,country:'UA',city:row.city,branch:row.branch,postcode:row.postcode||'',cityRef:row.delivery_reference?.city_id||'',branchRef:row.carrier==='nova'?(row.delivery_reference?.branch_id||''):'',branchId:row.carrier==='ukr'?(row.delivery_reference?.branch_id||''):'',branchNumber:row.delivery_reference?.branch_number||'',type:row.delivery_reference?.type||'branch'},payment:row.payment_method,comment:row.comment||''},
    items:(row.order_items||[]).map(item=>({...item,name:item.product_name,unit_amount:money(item.unit_price),returned:Number(item.returned||0)})),
    transactions:row.order_transactions||[],history:row.crm_actions||[]};
}

const validUUID=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export async function crmRPC(env,name,body,fetcher=fetch){return (await supabaseClient(env,fetcher)('/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();}
// Two independent gates: server deployment approval AND an explicit admin setting.
export async function supabaseAccepting(env,fetcher=fetch){
  if(env.SUPABASE_CHECKOUT_ENABLED!=='true')return false;
  const rows=await(await supabaseClient(env,fetcher)('/rest/v1/store_settings?select=value&id=eq.checkout&limit=1')).json();
  return rows[0]?.value?.orders_enabled===true;
}
export async function readSupabaseOrders(env,url,fetcher=fetch){
  const call=supabaseClient(env,fetcher),view=url.searchParams.get('view')||'orders';
  const page=Math.min(100000,Math.max(0,parseInt(url.searchParams.get('page')||'0')||0));
  if(view==='customers')return crmRPC(env,'server_crm_customers',{search_value:(url.searchParams.get('q')||'').slice(0,100),page_value:page},fetcher);
  if(view==='stock')return (await call('/rest/v1/stock_movements?is_test=eq.false&select=id,product_id,variant_id,order_id,name,delta,reason,created_at&order=created_at.desc,id.desc&limit=100&offset='+page*100)).json();
  if(!['orders','order'].includes(view))return null;
  const query=new URLSearchParams({select:view==='order'?'*,order_items(*),order_transactions(*),crm_actions(*)':'*,order_items(*)'});
  if(view!=='order')query.set('is_test','eq.false');
  if(view==='order'){
    const id=url.searchParams.get('id')||'';
    if(!validUUID(id))return {missing:true};
    query.set('id','eq.'+id);query.set('limit','1');
    const rows=await(await call('/rest/v1/orders?'+query)).json();
    return rows.length?mapOrder(rows[0]):{missing:true};
  }
  const status=url.searchParams.get('status')||'';
  if(status){if(!['new','processing','shipped','completed','cancelled','returned'].includes(status))throw Error('Invalid status');query.set('status','eq.'+status);}
  // Only digits/letters and whitespace enter the PostgREST filter grammar.
  const search=(url.searchParams.get('q')||'').slice(0,100).replace(/[^\p{L}\p{N}\s+@-]/gu,'').trim();
  if(search)query.set('or',`(order_number.ilike.*${search}*,customer_name.ilike.*${search}*,phone.ilike.*${search}*)`);
  query.set('order','created_at.desc,id.desc');query.set('limit','100');query.set('offset',String(page*100));
  const rows=await(await call('/rest/v1/orders?'+query)).json();
  const counts=await crmRPC(env,'server_crm_counts',{},fetcher);
  return {orders:rows.map(mapOrder),counts,accepting:await supabaseAccepting(env,fetcher),readOnly:false};
}

export async function updateSupabaseCRM(env,body,fetcher=fetch){
  const call=supabaseClient(env,fetcher);
  if(body?.action==='settings'){
    if(typeof body.accepting!=='boolean'||body.accepting&&(body.ready!==true||env.SUPABASE_CHECKOUT_ENABLED!=='true'))throw new CommerceError('Публічне приймання ще не дозволено в налаштуваннях сервера',409);
    await call('/rest/v1/store_settings?on_conflict=id',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},body:JSON.stringify({id:'checkout',value:{orders_enabled:body.accepting}})});
    return {accepting:body.accepting};
  }
  if(body?.action==='customer'){
    if(!/^[a-f0-9]{64}$/.test(body.id)||!Number.isInteger(body.version)||body.version<1)throw new CommerceError('Перевірте контакт');
    const name=inputText(body.name,100,true),email=inputText(body.email||'',254),notes=inputText(body.notes||'',3000);
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new CommerceError('Перевірте пошту');
    const result=await(await call('/rest/v1/store_customers?id=eq.'+body.id+'&version=eq.'+body.version,{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({name,email,notes,version:body.version+1,updated_at:new Date().toISOString()})})).json();
    if(result.length!==1)throw new CommerceError('Контакт вже змінено. Оновіть дані',409);return {ok:true};
  }
  if(!validUUID(body?.id)||!validUUID(body?.operation)||!Number.isInteger(body.version)||body.version<1)throw new CommerceError('Перевірте операцію');
  await crmRPC(env,'server_crm_action',{payload:body},fetcher);
  return readSupabaseOrders(env,new URL('https://local/?view=order&id='+body.id),fetcher);
}
