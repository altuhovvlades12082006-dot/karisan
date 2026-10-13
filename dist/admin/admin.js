import { COMMERCE_CONFIG } from '../commerce-config.js';
import { escapeHtml, imageSource, validateProduct, toProductPayload } from './model.mjs';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let categories=[['children','Дитяче'],['bedding','Постільна білизна'],['gold','Бязь Голд люкс'],['stripe','Страйп сатин'],['satin','Сатин'],['washed','Варена бавовна'],['flannel','Байка'],['linen-new','Інші новинки'],['towels','Рушники'],['protectors','Наматрацники'],['duvets','Ковдри'],['curiosities','Цікавинки'],['covers','Покривала'],['pillows','Подушки']];
const categoryName=id=>categories.find(x=>x[0]===id)?.[1]||id;
const money=n=>new Intl.NumberFormat('uk-UA',{style:'currency',currency:'UAH',maximumFractionDigits:0}).format(Number(n||0));
const esc=escapeHtml;
const configured=Boolean(COMMERCE_CONFIG.supabaseUrl&&COMMERCE_CONFIG.supabaseAnonKey);
let supabase=null,session=null,mode=configured?'live':'demo',products=[],orders=[],promos=[],settings={};
const local={get:(k,d)=>{try{return JSON.parse(localStorage.getItem('karisan-admin-'+k))??d}catch{return d}},set:(k,v)=>localStorage.setItem('karisan-admin-'+k,JSON.stringify(v))};

function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2200)}
function statusLabel(s){return {new:'Нове',processing:'В роботі',shipped:'Відправлено',completed:'Виконано',cancelled:'Скасовано'}[s]||s}
function totalStock(p){return (p.variants||[]).reduce((n,v)=>n+Number(v.stock||0),0)}
function dateText(value){return value?new Intl.DateTimeFormat('uk-UA',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value)):'—'}

async function initSupabase(){
  if(!configured)return false;
  const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.49.8');
  supabase=createClient(COMMERCE_CONFIG.supabaseUrl,COMMERCE_CONFIG.supabaseAnonKey,{auth:{persistSession:true}});
  const {data}=await supabase.auth.getSession();session=data.session;
  supabase.auth.onAuthStateChange((_event,next)=>{session=next;if(!next){products=[];orders=[];showLogin()}});
  return true;
}
async function boot(){
  $('#today').textContent=new Intl.DateTimeFormat('uk-UA',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
  renderCategoryOptions();
  bind();
  if(await initSupabase()){
    if(session)await enter();else showLogin();
  }else{
    $('#setup-screen').hidden=false;
  }
}
function showLogin(){$('#app').hidden=true;$('#setup-screen').hidden=true;$('#login-screen').hidden=false}
async function enter(){
  $('#app').hidden=true;
  if(mode==='live'){
    const {data,error}=await supabase.from('admin_profiles').select('user_id,display_name,role').eq('user_id',session?.user?.id).maybeSingle();
    if(error||!data){showLogin();$('#login-error').textContent='Цей користувач не має прав адміністратора або база ще не налаштована.';return}
  }
  await loadData();renderAll();
  $('#setup-screen').hidden=true;$('#login-screen').hidden=true;$('#app').hidden=false;
  $('#mode-badge').textContent=mode==='live'?'● Supabase online':'◌ Демо: лише цей браузер';
}
async function loadData(){
  if(mode==='demo'){
    const saved=local.get('products',null);
    products=saved||await fetch('../products.json',{cache:'no-store'}).then(r=>r.json());
    categories=local.get('categories',categories);renderCategoryOptions();orders=local.get('orders',[]);promos=local.get('promos',[]);settings=local.get('settings',{});return;
  }
  const [p,o,pr,st,cat]=await Promise.all([
    supabase.from('products').select('*,product_variants(*)').order('sort_order'),
    supabase.from('orders').select('*,order_items(*)').order('created_at',{ascending:false}),
    supabase.from('promotions').select('*').order('created_at',{ascending:false}),
    supabase.from('store_settings').select('*').eq('id','default').maybeSingle(),
    supabase.from('categories').select('*').order('sort_order')
  ]);
  for(const result of [p,o,pr,st,cat])if(result.error)throw result.error;categories=cat.data.map(c=>[c.slug,c.names.uk,c]);renderCategoryOptions();products=p.data.map(fromDb);orders=o.data||[];promos=pr.data||[];settings=st.data?.value||{};
}
function fromDb(p){return {id:p.id,uk:p.names?.uk||'',ru:p.names?.ru||'',en:p.names?.en||'',category:p.category_slug,price:Number(p.base_price),image:p.image_url||'',images:p.image_urls||[],descriptionRu:p.description?.ru||'',descriptionEn:p.description?.en||'',new:p.is_new,active:p.is_active,description:p.description?.uk||'',variants:(p.product_variants||[]).map(v=>({id:v.id,sku:v.sku,active:v.is_active,names:v.names,uk:v.names?.uk||'',ru:v.names?.ru||'',en:v.names?.en||'',price:Number(v.price),stock:Number(v.stock),pillowSizes:v.pillow_sizes||[]}))}}
function persist(){if(mode==='demo'){local.set('categories',categories);local.set('products',products);local.set('orders',orders);local.set('promos',promos);local.set('settings',settings)}}

function renderAll(){renderDashboard();renderProducts();renderOrders();renderCustomers();renderPromos();renderSettings();renderCategories()}
function renderDashboard(){
  const revenue=orders.filter(o=>!['cancelled'].includes(o.status)).reduce((n,o)=>n+Number(o.total||0),0),stock=products.reduce((n,p)=>n+totalStock(p),0),newOrders=orders.filter(o=>o.status==='new').length;
  $('#hero-orders').textContent=newOrders;
  $('#stats').innerHTML=[['Товари',products.length,'позицій у каталозі'],['Залишок',stock,'одиниць на складі'],['Замовлення',orders.length,'за весь час'],['Продажі',money(revenue),'без скасованих']].map(x=>`<article class="stat"><p>${x[0]}</p><strong>${x[1]}</strong><small>${x[2]}</small></article>`).join('');
  $('#recent-orders').innerHTML=orders.slice(0,5).map(o=>`<div class="mini-row"><span class="status ${o.status}">${statusLabel(o.status)}</span><div><strong>#${esc(o.order_number||String(o.id).slice(0,8))} · ${esc(o.customer_name)}</strong><small>${dateText(o.created_at)}</small></div><b>${money(o.total)}</b></div>`).join('')||'<div class="mini-row"><div><strong>Замовлень поки немає</strong><small>Нові замовлення зʼявляться тут</small></div></div>';
  const low=products.filter(p=>totalStock(p)<=3).slice(0,5);$('#low-stock').innerHTML=low.map(p=>`<div class="mini-row"><img src="${image(p)}" alt=""><div><strong>${esc(p.uk)}</strong><small>${esc(p.variants?.[0]?.sku||p.id)}</small></div><span class="status low">${totalStock(p)} шт.</span></div>`).join('')||'<div class="mini-row"><div><strong>Запасів достатньо</strong><small>Критичних залишків немає</small></div></div>';
}
function image(p){return esc(imageSource(p.image))}
function renderProducts(){
  const q=$('#product-search').value.toLowerCase(),cat=$('#category-filter').value;
  const list=products.filter(p=>(!cat||p.category===cat)&&(!q||[p.uk,p.ru,p.en,p.variants?.map(v=>v.sku).join(' ')].join(' ').toLowerCase().includes(q)));
  $('#product-table').innerHTML=list.map(p=>`<tr><td><div class="product-cell"><img src="${image(p)}" alt=""><div><strong>${esc(p.uk)}</strong><small>${esc(p.variants?.[0]?.sku||p.id)}</small></div></div></td><td>${esc(categoryName(p.category))}</td><td>${money(p.price)}</td><td class="${totalStock(p)<=3?'stock-low':''}">${totalStock(p)} шт.</td><td><span class="status ${p.active===false?'':'active'}">${p.active===false?'Чернетка':'Опубліковано'}</span></td><td><button class="row-actions" data-edit-product="${esc(p.id)}">•••</button></td></tr>`).join('');
}
function renderOrders(){
  const q=$('#order-search').value.toLowerCase(),status=$('#order-status').value;
  const list=orders.filter(o=>(!status||o.status===status)&&(!q||[o.order_number,o.customer_name,o.phone].join(' ').toLowerCase().includes(q)));
  $('#order-table').innerHTML=list.map(o=>`<tr><td><strong>#${esc(o.order_number||String(o.id).slice(0,8))}</strong><br><small>${dateText(o.created_at)}</small></td><td>${esc(o.customer_name)}<br><small>${esc(o.phone)}</small></td><td>${esc(o.carrier||'—')}<br><small>${esc(o.city||'')}</small></td><td><strong>${money(o.total)}</strong></td><td><select data-order-status="${esc(o.id)}"><option value="new">Нове</option><option value="processing">В роботі</option><option value="shipped">Відправлено</option><option value="completed">Виконано</option><option value="cancelled">Скасовано</option></select></td><td><button class="row-actions" data-order-details="${esc(o.id)}" aria-label="Деталі замовлення">•••</button></td></tr>`).join('')||'<tr><td colspan="6">Замовлень поки немає.</td></tr>';
  $$('[data-order-status]').forEach(el=>el.value=orders.find(o=>String(o.id)===el.dataset.orderStatus)?.status||'new');
}
function renderCustomers(){const map=new Map();orders.forEach(o=>{const key=o.phone||o.customer_email||o.customer_name;if(!key)return;const old=map.get(key)||{name:o.customer_name,phone:o.phone,email:o.customer_email,count:0,total:0};old.count++;old.total+=Number(o.total||0);map.set(key,old)});$('#customer-list').innerHTML=[...map.values()].map(c=>`<article class="customer-card"><strong>${esc(c.name)}</strong><small>${esc(c.phone||c.email||'')}</small><p>${c.count} зам. · ${money(c.total)}</p></article>`).join('')||'<p>Клієнти зʼявляться після першого замовлення.</p>'}
function renderPromos(){$('#promo-list').innerHTML=promos.map(p=>`<div class="promo-chip"><b>${esc(p.code)}</b><span>−${p.discount_percent}% · ${p.is_active===false?'вимкнено':'активний'}</span></div>`).join('')}
function renderSettings(){const s={store_name:'Kari-San',phone:'+38 (067) 250-49-39',email:'kari-san@ukr.net',currency:'UAH',nova_enabled:true,ukr_enabled:true,...settings};Object.entries(s).forEach(([k,v])=>{const el=$(`#settings-form [name="${k}"]`);if(!el)return;if(el.type==='checkbox')el.checked=Boolean(v);else el.value=v});Object.entries(settings).forEach(([k,v])=>{const el=$('#content-form').elements.namedItem(k);if(el)el.value=v});$('#connection-state').innerHTML=`<div class="connection-row"><span>База даних</span><strong>${mode==='live'?'Підключено':'Очікує Supabase'}</strong></div><div class="connection-row"><span>Авторизація</span><strong>${mode==='live'?'Захищена':'Демо на пристрої'}</strong></div><div class="connection-row"><span>Каталог магазину</span><strong>${mode==='live'?'Live API':'products.json'}</strong></div>`}

function switchView(name){$$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`));$$('#main-nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===name));$('#page-title').textContent={dashboard:'Огляд',products:'Товари',orders:'Замовлення',customers:'Клієнти',categories:'Категорії',content:'Контент',settings:'Налаштування'}[name];$('.sidebar').classList.remove('open')}
function renderCategoryOptions(){
  const filter=$('#category-filter'),select=$('#product-form [name=category]'),previous=filter.value,current=select.value;
  const options=categories.map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');
  filter.innerHTML='<option value="">Усі категорії</option>'+options;select.innerHTML=options;filter.value=previous;select.value=current||categories[0]?.[0]||'';
}
function renderCategories(){
  $('#category-list').innerHTML=categories.map(([slug,name,c])=>`<div class="category-row"><div><strong>${esc(name)}</strong><small> · ${esc(slug)} · ${c?.is_active===false?'прихована':'активна'}</small></div><button class="secondary" data-edit-category="${esc(slug)}">Редагувати</button></div>`).join('');
}
function openCategory(slug){
  const [id,name,c]=categories.find(c=>c[0]===slug),f=$('#category-form');f.reset();f.elements.original.value=id;f.elements.slug.value=id;f.elements.slug.readOnly=true;f.elements.uk.value=name;f.elements.ru.value=c?.names?.ru||name;f.elements.en.value=c?.names?.en||name;f.elements.sort_order.value=c?.sort_order||0;f.elements.active.checked=c?.is_active!==false;f.scrollIntoView({behavior:'smooth'});
}
function addVariant(v={}){
  const row=document.createElement('div');row.className='variant-row';row.dataset.id=v.id||crypto.randomUUID();row._pillowSizes=v.pillowSizes||[];
  row.innerHTML=`<div class="form-grid three"><label>Розмір / назва UA<input data-field="uk" value="${esc(v.uk||'Стандарт')}" required></label><label>RU<input data-field="ru" value="${esc(v.ru||'')}"></label><label>EN<input data-field="en" value="${esc(v.en||'')}"></label></div><div class="form-grid"><label>SKU<input data-field="sku" value="${esc(v.sku||'')}"></label><label>Ціна, ₴<input data-field="price" type="number" min="0" step="0.01" value="${Number(v.price||0)}" required></label><label>Залишок<input data-field="stock" type="number" min="0" step="1" value="${Number(v.stock||0)}" required></label><label>Наволочки (через кому)<input data-field="pillow" value="${esc((v.pillowSizes||[]).join(', '))}"></label></div><label><input data-field="active" type="checkbox" ${v.active===false?'':'checked'}> Доступний для продажу</label><small>Щоб зберегти історію, непотрібний варіант вимкніть.</small>`;
  $('#variant-list').append(row);
}
function previewPhotos(){
  const f=$('#product-form');$('#photo-preview').innerHTML=[f.elements.image.value,...f.elements.images.value.split('\n')].filter(x=>imageSource(x)).map(src=>`<img src="${esc(imageSource(src))}" alt="Фото товару">`).join('');
}
function openProduct(id=''){
  const p=products.find(x=>String(x.id)===String(id)),f=$('#product-form'),x=f.elements;f.reset();$('#variant-list').innerHTML='';$('#product-form-error').textContent='';$('#upload-status').textContent='';
  $('#product-dialog-title').textContent=p?'Редагувати товар':'Новий товар';
  if(p){x.id.value=p.id;x.uk.value=p.uk;x.ru.value=p.ru||'';x.en.value=p.en||'';x.category.value=p.category;x.price.value=p.price;x.image.value=p.image||'';x.images.value=(p.images||[]).join('\n');x.description.value=p.description||p.sourceDescription||'';x.active.checked=p.active!==false;x.is_new.checked=Boolean(p.new)}
  (p?.variants?.length?p.variants:[{price:p?.price||0}]).forEach(addVariant);previewPhotos();$('#product-dialog').showModal();
}
async function saveProduct(form){
  const d=Object.fromEntries(new FormData(form)),existing=products.find(p=>String(p.id)===d.id),id=d.id||crypto.randomUUID();
  const variants=$$('#variant-list .variant-row').map(row=>{const val=k=>row.querySelector(`[data-field="${k}"]`).value;return {id:row.dataset.id,uk:val('uk').trim(),ru:val('ru').trim(),en:val('en').trim(),sku:val('sku').trim(),price:Number(val('price')),stock:Number(val('stock')),active:row.querySelector('[data-field=active]').checked,pillowSizes:val('pillow').split(',').map(x=>x.trim()).filter(Boolean)}});
  const product=validateProduct({...existing,id,uk:d.uk.trim(),ru:d.ru||d.uk,en:d.en||d.uk,category:d.category,price:Number(d.price),image:d.image.trim(),images:d.images.split('\n').map(x=>x.trim()).filter(Boolean),new:form.elements.is_new.checked,active:form.elements.active.checked,description:d.description,variants});
  if(mode==='live'){const {error}=await supabase.rpc('admin_save_product',{payload:toProductPayload(product)});if(error)throw error;await loadData()}
  else{if(existing)products=products.map(p=>String(p.id)===String(id)?product:p);else products.unshift(product);persist()}
  renderAll();$('#product-dialog').close();toast(existing?'Товар оновлено':'Товар створено');
}
async function uploadPhotos(files){
  const form=$('#product-form'),button=$('#save-product');button.disabled=true;
  try{
    for(const file of files){
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('Фото має бути JPEG, PNG або WebP до 5 МБ.');
      let url;
      if(mode==='live'){
        const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type],path=`${session.user.id}/${crypto.randomUUID()}.${ext}`;
        const {error}=await supabase.storage.from('product-images').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;
        url=supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
      }else{url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)})}
      if(!form.elements.image.value)form.elements.image.value=url;else form.elements.images.value+="\n"+url;
    }
    previewPhotos();$('#upload-status').textContent=mode==='live'?'Фото завантажено. Збережіть товар.':'Демо: фото збережеться тільки у цьому браузері після збереження товару.';
  }catch(error){$('#product-form-error').textContent=error.message||'Не вдалося завантажити фото.'}finally{button.disabled=false;$('#photo-upload').value=''}
}
function openOrder(id){
  const o=orders.find(o=>String(o.id)===id);if(!o)return;
  $('#order-details').innerHTML=`<h3>#${esc(o.order_number||o.id)}</h3><p>${esc(o.customer_name)}<br>${esc(o.phone)}<br>${esc(o.customer_email||'')}</p><p>${esc(o.carrier)} · ${esc(o.city)} · ${esc(o.branch)} · ${esc(o.postcode||'')}</p><p>${esc(o.comment||'')}</p><p>Оплата: ${esc(o.payment_method)} · ${esc(statusLabel(o.status))}</p><div class="table-wrap"><table><thead><tr><th>Товар / варіант</th><th>Кількість</th><th>Ціна</th><th>Сума</th></tr></thead><tbody>${(o.order_items||[]).map(i=>`<tr><td>${esc(i.product_name)}<br>${esc(i.variant_name)} · ${esc(i.sku)}</td><td>${Number(i.quantity)}</td><td>${money(i.unit_price)}</td><td>${money(i.line_total)}</td></tr>`).join('')}</tbody></table></div><p><strong>Разом: ${money(o.total)}</strong></p><small>Зміна статусу не змінює залишки. Скасування та повернення потребують окремого обліку.</small>`;
  $('#order-dialog').showModal();
}
async function saveSettings(next){
  if(mode==='live'){const {error}=await supabase.from('store_settings').upsert({id:'default',value:next});if(error)throw error}
  settings=next;persist();renderSettings();toast('Збережено');
}
function bind(){
  $('#demo-enter').onclick=async()=>{mode='demo';try{await enter()}catch{toast('Помилка завантаження демо або переповнене сховище браузера')}};
  $('#login-form').addEventListener('submit',async e=>{e.preventDefault();$('#login-error').textContent='';const fd=new FormData(e.currentTarget);const {error}=await supabase.auth.signInWithPassword({email:fd.get('email'),password:fd.get('password')});if(error){$('#login-error').textContent='Не вдалося увійти. Перевірте email і пароль.';return}session=(await supabase.auth.getSession()).data.session;try{await enter()}catch{showLogin();$('#login-error').textContent='Не вдалося завантажити дані. Перевірте міграції та доступ.'}});
  $('#logout-button').onclick=async()=>{if(mode==='live')await supabase.auth.signOut();else{session=null;$('#app').hidden=true;$('#setup-screen').hidden=false}};
  $('#main-nav').onclick=e=>{const b=e.target.closest('[data-view]');if(b)switchView(b.dataset.view)};
  document.addEventListener('click',e=>{const go=e.target.closest('[data-go]');if(go)switchView(go.dataset.go);const edit=e.target.closest('[data-edit-product]');if(edit)openProduct(edit.dataset.editProduct);const category=e.target.closest('[data-edit-category]');if(category)openCategory(category.dataset.editCategory);const order=e.target.closest('[data-order-details]');if(order)openOrder(order.dataset.orderDetails)});
  $('#mobile-nav').onclick=()=>$('.sidebar').classList.toggle('open');$('#global-add').onclick=$('#add-product').onclick=()=>openProduct();
  $('#product-search').oninput=renderProducts;$('#category-filter').onchange=renderProducts;$('#order-search').oninput=renderOrders;$('#order-status').onchange=renderOrders;
  $('#product-form').addEventListener('submit',async e=>{e.preventDefault();if(e.submitter?.value==='cancel'){e.currentTarget.closest('dialog').close();return}$('#product-form-error').textContent='';$('#save-product').disabled=true;try{await saveProduct(e.currentTarget)}catch(error){console.error(error);$('#product-form-error').textContent=error.message||'Не вдалося зберегти товар.'}finally{$('#save-product').disabled=false}});
  $('#order-table').addEventListener('change',async e=>{if(!e.target.matches('[data-order-status]'))return;const id=e.target.dataset.orderStatus,status=e.target.value;if(mode==='live'){const {error}=await supabase.from('orders').update({status}).eq('id',id);if(error){renderOrders();toast('Не вдалося змінити статус');return}}orders=orders.map(o=>String(o.id)===id?{...o,status}:o);persist();renderOrders();renderDashboard();toast('Статус оновлено')});
  $('#promo-form').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));const promo={id:crypto.randomUUID(),code:d.code.toUpperCase(),discount_percent:Number(d.discount),expires_at:d.expires_at||null,is_active:true,created_at:new Date().toISOString()};if(mode==='live'){const {error}=await supabase.from('promotions').insert(promo);if(error){toast('Не вдалося створити промокод');return}}promos.unshift(promo);persist();renderPromos();e.currentTarget.reset();toast('Промокод створено')});
  $('#content-form').addEventListener('submit',async e=>{e.preventDefault();try{await saveSettings({...settings,...Object.fromEntries(new FormData(e.currentTarget))})}catch{toast('Не вдалося зберегти контент')}});
  $('#settings-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;try{await saveSettings({...settings,...Object.fromEntries(new FormData(f)),nova_enabled:f.elements.nova_enabled.checked,ukr_enabled:f.elements.ukr_enabled.checked})}catch{toast('Не вдалося зберегти налаштування')}});
  $('#category-form').addEventListener('reset',()=>{setTimeout(()=>{$('#category-form').elements.slug.readOnly=false;$('#category-error').textContent=''},0)});
  $('#category-form').addEventListener('submit',async e=>{
    e.preventDefault();const f=e.currentTarget,d=Object.fromEntries(new FormData(f));$('#category-error').textContent='';
    try{
      if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug)||!d.uk.trim()||!Number.isInteger(Number(d.sort_order)))throw Error('Перевірте код, назву та порядок.');
      if(!d.original&&categories.some(c=>c[0]===d.slug))throw Error('Такий код вже існує. Відкрийте категорію для редагування.');
      const row={slug:d.slug,names:{uk:d.uk.trim(),ru:d.ru||d.uk,en:d.en||d.uk},sort_order:Number(d.sort_order),is_active:f.elements.active.checked};
      if(mode==='live'){const {error}=await supabase.from('categories').upsert(row);if(error)throw error;await loadData()}
      else{categories=categories.filter(c=>c[0]!==row.slug);categories.push([row.slug,row.names.uk,row]);categories.sort((a,b)=>(a[2]?.sort_order||0)-(b[2]?.sort_order||0));persist()}
      renderCategoryOptions();renderCategories();renderProducts();f.reset();toast('Категорію збережено');
    }catch(error){$('#category-error').textContent=error.message||'Не вдалося зберегти категорію.'}
  });
  $('#add-variant').onclick=()=>addVariant({price:Number($('#product-form').elements.price.value)});
  $('#photo-upload').onchange=e=>uploadPhotos(e.target.files);
  $('#product-form').elements.image.oninput=previewPhotos;$('#product-form').elements.images.oninput=previewPhotos;
  $('#close-order').onclick=()=>$('#order-dialog').close();

}

boot().catch(error=>{console.error(error);$('#app').hidden=true;if(configured){showLogin();$('#login-error').textContent='Не вдалося підключитися. Перевірте Supabase, міграції та мережу; оновіть сторінку.'}else $('#setup-screen').hidden=false;toast('Не вдалося завантажити адмінку')});
