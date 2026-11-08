// Server-only checkout; both runtime approval and database acceptance are required.
import {validateCheckout} from './order-validation.mjs';
import {verifyNovaSelection} from '../integrations/nova-poshta.mjs';
import {verifyUkrSelection} from '../integrations/ukrposhta.mjs';
import {digest} from './password-auth.mjs';
import {supabaseAccepting,crmRPC} from './supabase-crm.mjs';
import {CommerceError,supabaseClient} from './supabase-catalog.mjs';

export function orderPayload(checkout,delivery,idempotencyKey){
  if(delivery.verified!==true||delivery.carrier!==checkout.delivery.carrier)throw Error('Delivery not verified');
  return {idempotency_key:idempotencyKey,consent:true,
    customer_name:checkout.customer.name,customer_email:checkout.customer.email,phone:checkout.customer.phone,
    carrier:delivery.carrier,city:delivery.city,branch:delivery.branch,postcode:delivery.postcode||'',
    city_id:delivery.cityRef||null,branch_id:delivery.carrier==='nova'?delivery.branchRef:delivery.branchId,
    branch_number:delivery.branchNumber||null,delivery_type:delivery.type||'branch',delivery_verified:true,
    payment_method:'cod',comment:checkout.comment,
    items:checkout.items.map(item=>({product_id:item.product,variant_id:item.variant,
      quantity:item.qty,expected_amount:item.expectedAmount,pillow:item.pillow}))};
}

export async function prepareSupabaseOrder(env,raw,fetcher=fetch){
  const checkout=validateCheckout(raw);
  const delivery=checkout.delivery.carrier==='nova'
    ?await verifyNovaSelection(env,checkout.delivery,fetcher)
    :await verifyUkrSelection(env,checkout.delivery,fetcher);
  return {...orderPayload(checkout,delivery,await digest(checkout.key)),source:checkout.source,
    client_request_hash:await digest(JSON.stringify({...checkout,key:undefined}))};
}

export async function createSupabaseOrder(env,raw,country='ZZ',fetcher=fetch){
  if(env.SUPABASE_CHECKOUT_ENABLED!=='true')throw new CommerceError('Приймання замовлень закрите',503);
  const checkout=validateCheckout(raw),token=await digest(checkout.key),hash=await digest(JSON.stringify({...checkout,key:undefined}));
  const prior=await(await supabaseClient(env,fetcher)('/rest/v1/orders?select=id,order_number,total,status,client_request_hash&idempotency_key=eq.'+token+'&limit=1')).json();
  const receipt=result=>({id:result.id,number:result.order_number,amount:Math.round(Number(result.total)*100),currency:'UAH',status:result.status||'new',payment:'cod'});
  if(prior.length){if(prior[0].client_request_hash!==hash)throw new CommerceError('Запит уже використано з іншими даними',409);return receipt(prior[0]);}
  if(!await supabaseAccepting(env,fetcher))throw new CommerceError('Приймання замовлень закрите',503);
  const payload=await prepareSupabaseOrder(env,raw,fetcher);
  payload.country=/^[A-Z]{2}$/.test(country)?country:'ZZ';
  const result=await crmRPC(env,'create_storefront_order',{payload},fetcher);
  return receipt(result);
}
