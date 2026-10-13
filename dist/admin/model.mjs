export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function imageSource(value, prefix='../') {
  const path = String(value || '').trim();
  if (/^https?:\/\//i.test(path)) { try { const url=new URL(path); if(url.username||url.password)return ''; return url.href; } catch { return ''; } }
  if (/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(path)) return path;
  if (/^(\.\/)?assets\/[a-z0-9_./-]+$/i.test(path) && !path.includes('..')) return prefix + path.replace(/^\.\//, '');
  return '';
}
export function validateProduct(product) {
  if (!product.uk?.trim() || !product.category) throw Error('Вкажіть назву та категорію.');
  if (!Number.isFinite(product.price) || product.price < 0) throw Error('Ціна має бути невід’ємною.');
  if (!product.variants?.length) throw Error('Додайте хоча б один варіант.');
  const ids = new Set(), skus = new Set();
  for (const v of product.variants) {
    if (!v.uk?.trim() || !Number.isFinite(v.price) || v.price < 0 || !Number.isInteger(v.stock) || v.stock < 0) throw Error('Перевірте назву, ціну та цілий залишок кожного варіанта.');
    if (ids.has(v.id) || (v.sku && skus.has(v.sku))) throw Error('Варіанти та SKU мають бути унікальними.');
    ids.add(v.id); if (v.sku) skus.add(v.sku);
  }
  for (const src of [product.image, ...(product.images || [])].filter(Boolean)) {
    if (!imageSource(src)) throw Error('Фото: використовуйте HTTPS URL або шлях assets/…');
  }
  return product;
}
export function toProductPayload(p) {
  validateProduct(p);
  return {id:p.id,names:{uk:p.uk,ru:p.ru,en:p.en},description:{uk:p.description,ru:p.descriptionRu||p.description,en:p.descriptionEn||p.description},category_slug:p.category,base_price:p.price,image_url:p.image,image_urls:p.images||[],is_active:p.active,is_new:p.new,
    variants:p.variants.map(v=>({id:v.id,sku:v.sku||null,names:{uk:v.uk,ru:v.ru||v.uk,en:v.en||v.uk},price:v.price,stock:v.stock,pillow_sizes:v.pillowSizes||[],is_active:v.active!==false}))};
}
