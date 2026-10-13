import { COMMERCE_CONFIG } from './commerce-config.js';
import { imageSource } from './admin/model.mjs';

const configured = Boolean(COMMERCE_CONFIG.supabaseUrl && COMMERCE_CONFIG.supabaseAnonKey);
const endpoint = path => `${COMMERCE_CONFIG.supabaseUrl}/rest/v1/${path}`;
const headers = (extra={}) => ({
  apikey: COMMERCE_CONFIG.supabaseAnonKey,
  Authorization: `Bearer ${COMMERCE_CONFIG.supabaseAnonKey}`,
  'Content-Type': 'application/json',
  ...extra
});

function normaliseProduct(row){
  const names=row.names||{};
  const material=row.material||{};
  return {
    id:row.id,
    uk:names.uk||'', ru:names.ru||names.uk||'', en:names.en||names.uk||'',
    category:row.category_slug,
    price:Number(row.base_price||0),
    image:imageSource(row.image_url,'')||'',
    images:row.image_urls||[],
    imageUrl:row.source_image_url||'',
    url:row.source_url||'',
    new:Boolean(row.is_new),
    children:Boolean(row.is_children),
    material,
    sourceDescription:row.description?.uk||'',
    updatedAt:row.updated_at,
    variants:(row.product_variants||[]).filter(v=>v.is_active!==false).map(v=>({
      id:v.id, sku:v.sku||'', price:Number(v.price||0), stock:Number(v.stock||0),
      pillowSizes:v.pillow_sizes||[],
      uk:v.names?.uk||'', ru:v.names?.ru||v.names?.uk||'', en:v.names?.en||v.names?.uk||''
    }))
  };
}

export async function loadCatalog(fallback='products.json'){
  if(configured){
    const response=await fetch(endpoint('products?select=*,product_variants(*)&is_active=eq.true&order=sort_order.asc'),{headers:headers()});
    if(!response.ok)throw new Error(`Live catalogue ${response.status}`);
    const rows=await response.json();
    if(!Array.isArray(rows))throw new Error('Invalid catalogue response');
    return rows.map(normaliseProduct);
  }
  const response=await fetch(fallback,{cache:'no-store'});
  if(!response.ok)throw new Error(`Catalogue ${response.status}`);
  return response.json();
}

export async function createOrder(payload){
  if(!configured)throw new Error('commerce_not_configured');
  const response=await fetch(endpoint('rpc/create_storefront_order'),{
    method:'POST',headers:headers(),body:JSON.stringify({payload})
  });
  if(!response.ok)throw new Error(await response.text());
  return response.json();
}

export const commerceConfigured=configured;

export async function loadCategories(){
  if(!configured)return null;
  const response=await fetch(endpoint('categories?select=*&is_active=eq.true&order=sort_order.asc'),{headers:headers()});
  if(!response.ok)throw new Error(`Categories ${response.status}`);
  return response.json();
}
