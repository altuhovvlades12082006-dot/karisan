// Server-only REST adapter. No dependency, no fallback to a second database.
export const usesSupabase=env=>env.CATALOG_BACKEND==='supabase';
export class CatalogConflict extends Error{}
export class CommerceError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const commerceErrors={order_conflict:'Замовлення вже змінено. Оновіть картку',operation_conflict:'ID операції вже використано',idempotency_conflict:'Запит уже використано з іншими даними',orders_disabled:'Приймання замовлень закрите',out_of_stock:'Недостатньо товару. Оновіть кошик',price_changed:'Ціна змінилася. Оновіть кошик',product_unavailable:'Товар більше недоступний',invalid_pillow:'Оберіть актуальний розмір наволочок',invalid_transition:'Дія недоступна для поточного стану замовлення',invalid_amount:'Перевірте суму оплати або повернення',invalid_return:'Перевірте кількість повернення',invalid_receipt:'Потрібні спосіб і номер фактичної операції',variant_missing:'Розмір відсутній або залишок завеликий',order_missing:'Замовлення не знайдено',invalid_action:'Перевірте дані операції'};
export function supabaseClient(env,fetcher=fetch){
  const url=new URL(env.SUPABASE_URL||'https://invalid.local');
  if(url.protocol!=='https:'||! /^[a-z0-9]+\.supabase\.co$/.test(url.hostname)||url.pathname!=='/'||url.username||url.password||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Supabase unavailable');
  return async(path,options={})=>{
    if(!path.startsWith('/rest/v1/')&&!path.startsWith('/storage/v1/'))throw Error('Invalid Supabase path');
    const auth=env.SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY};
    let r;try{r=await fetcher(url.origin+path,{...options,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,...auth,...options.headers},signal:AbortSignal.timeout(12000)});}catch{throw Error('Supabase unavailable');}
    if(!r.ok){let code='';try{code=(await r.json()).message||'';}catch{}
      if(code.includes('crm_receipt_once'))throw new CommerceError('Цю квитанцію вже записано. Звірте історію операцій',409);
      if(code==='catalog_conflict'||code==='ordered_variant_required'||r.status===409)throw new CatalogConflict('Товар уже змінено або розмір є в замовленні. Оновіть список');
      if(commerceErrors[code])throw new CommerceError(commerceErrors[code],['order_conflict','operation_conflict','idempotency_conflict','out_of_stock','price_changed'].includes(code)?409:400);
      throw Error('Supabase unavailable');
    }return r;
  };
}
export function mapProduct(row){
  const names=row.names||{};return {product:{id:row.id,uk:names.uk||'',ru:names.ru||names.uk||'',en:names.en||names.uk||'',
    category:row.category_slug,image:row.image_url||'',material:row.material||{},sourceDescription:row.description?.uk||'',
    price:row.base_price===null?null:Number(row.base_price),children:row.is_children===true,new:row.is_new===true,updatedAt:row.updated_at,
    variants:(row.product_variants||[]).filter(v=>v.is_active).map(v=>({id:v.id,uk:v.names?.uk||'',ru:v.names?.ru||v.names?.uk||'',en:v.names?.en||v.names?.uk||'',sku:v.sku||'',price:v.price===null?null:Number(v.price),stock:Number(v.stock),pillowSizes:v.pillow_sizes||[]}))},version:row.version,archived:!row.is_active};
}
export async function supabaseProducts(env,admin=false,fetcher=fetch){
  const call=supabaseClient(env,fetcher),rows=[];
  for(let offset=0;;offset+=500){const query=new URLSearchParams({select:'*,product_variants(*)',order:'sort_order.asc,id.asc',offset:String(offset),limit:'500'});if(!admin)query.set('is_active','eq.true');
    const page=await (await call('/rest/v1/products?'+query)).json();if(!Array.isArray(page))throw Error('Supabase unavailable');rows.push(...page.map(mapProduct));if(page.length<500)break;}
  return admin?rows:rows.map(x=>x.product);
}
export async function saveSupabaseProduct(env,body,fetcher=fetch){return (await supabaseClient(env,fetcher)('/rest/v1/rpc/server_save_catalog_product',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload:body})})).json();}
