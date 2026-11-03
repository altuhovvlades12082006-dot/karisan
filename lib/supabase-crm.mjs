import {supabaseClient} from './supabase-catalog.mjs';

const money=value=>Math.round(Number(value||0)*100);
export function mapOrder(row){
  return {...row,number:row.order_number,amount:money(row.total),paid:row.payment_status==='paid'?money(row.total):0,
    refunded:0,name:row.customer_name,tracking:row.delivery_reference?.tracking||'',
    data:{customer:{name:row.customer_name,phone:row.phone,email:row.customer_email||''},
      delivery:{carrier:row.carrier,city:row.city,branch:row.branch,postcode:row.postcode||'',cityRef:row.delivery_reference?.city_id||'',branchRef:row.carrier==='nova'?(row.delivery_reference?.branch_id||''):'',branchId:row.carrier==='ukr'?(row.delivery_reference?.branch_id||''):'',branchNumber:row.delivery_reference?.branch_number||'',type:row.delivery_reference?.type||'branch'},payment:row.payment_method,comment:row.comment||''},
    items:(row.order_items||[]).map(item=>({...item,name:item.product_name,unit_amount:money(item.unit_price),returned:0})),
    transactions:[],history:[]};
}

// Server-only and read-only until the transactional CRM migration is installed.
export async function readSupabaseOrders(env,url,fetcher=fetch){
  const call=supabaseClient(env,fetcher),view=url.searchParams.get('view')||'orders';
  if(!['orders','order'].includes(view))return null;
  const query=new URLSearchParams({select:'*,order_items(*)'});
  if(view==='order'){
    const id=url.searchParams.get('id')||'';
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))return {missing:true};
    query.set('id','eq.'+id);query.set('limit','1');
    const rows=await(await call('/rest/v1/orders?'+query)).json();
    return rows.length?mapOrder(rows[0]):{missing:true};
  }
  const page=Math.min(100000,Math.max(0,parseInt(url.searchParams.get('page')||'0')||0));
  const status=url.searchParams.get('status')||'';
  if(status){if(!['new','processing','shipped','completed','cancelled'].includes(status))throw Error('Invalid status');query.set('status','eq.'+status);}
  // Only digits/letters and whitespace enter the PostgREST filter grammar.
  const search=(url.searchParams.get('q')||'').slice(0,100).replace(/[^\p{L}\p{N}\s+@-]/gu,'').trim();
  if(search)query.set('or',`(order_number.ilike.*${search}*,customer_name.ilike.*${search}*,phone.ilike.*${search}*)`);
  query.set('order','created_at.desc,id.desc');query.set('limit','100');query.set('offset',String(page*100));
  const rows=await(await call('/rest/v1/orders?'+query)).json();
  return {orders:rows.map(mapOrder),counts:[],accepting:false,readOnly:true};
}
