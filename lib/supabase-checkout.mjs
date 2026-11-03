// Prepared server adapter; intentionally not mounted until transactional CRM QA.
import {validateCheckout} from './order-validation.mjs';
import {verifyNovaSelection} from '../integrations/nova-poshta.mjs';
import {verifyUkrSelection} from '../integrations/ukrposhta.mjs';
import {digest} from './password-auth.mjs';

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
  return orderPayload(checkout,delivery,await digest(checkout.key));
}
