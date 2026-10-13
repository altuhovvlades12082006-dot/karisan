import { COMMERCE_CONFIG } from '../commerce-config.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const categories=[['children','Дитяче'],['bedding','Постільна білизна'],['gold','Бязь Голд люкс'],['stripe','Страйп сатин'],['satin','Сатин'],['washed','Варена бавовна'],['flannel','Байка'],['linen-new','Інші новинки'],['towels','Рушники'],['protectors','Наматрацники'],['duvets','Ковдри'],['curiosities','Цікавинки'],['covers','Покривала'],['pillows','Подушки']];
const categoryName=id=>categories.find(x=>x[0]===id)?.[1]||id;
const money=n=>new Intl.NumberFormat('uk-UA',{style:'currency',currency:'UAH',maximumFractionDigits:0}).format(Number(n||0));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const configured=Boolean(COMMERCE_CONFIG.supabaseUrl&&COMMERCE_CONFIG.supabaseAnonKey);
let supabase=null,session=null,mode=configured?'live':'demo',products=[],orders=[],promos=[],settings={};
const local={get:(k,d)=>{try{return JSON.parse(localStorage.getItem('karisan-admin-'+k))??d}catch{return d}},set:(k,v)=>localStorage.setItem('karisan-admin-'+k,JSON.stringify(v))};

function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2200)}
function statusLabel(s){return {new:'Нове',processing:'В роботі',shipped:'Відправлено',completed:'Виконано',cancelled:'Скасовано'}[s]||s}
function totalStock(p){return (p.variants||[]).reduce((n,v)=>n+Number(v.stock||0),0)}
function dateText(value){return value?new Intl.DateTimeFormat('uk-UA',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value)):'—'}

async function initSupabase(){
  if(!configured)return false;
  const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
  supabase=createClient(COMMERCE_CONFIG.supabaseUrl,COMMERCE_CONFIG.supabaseAnonKey,{auth:{persistSession:true}});
  const {data}=await supabase.auth.getSession();session=data.session;
  supabase.auth.onAuthStateChange((_event,next)=>{session=next;if(!next)showLogin()});
  return true;
}
async function boot(){
  $('#today').textContent=new Intl.DateTimeFormat('uk-UA',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
  categories.forEach(([id,name])=>{$('#category-filter').insertAdjacentHTML('beforeend',`<option value="${id}">${name}</option>`);$('#product-form [name=category]').insertAdjacentHTML('beforeend',`<option value="${id}">${name}</option>`) });
  bind();
  if(await initSupabase()){
    if(session)await enter();else showLogin();
  }else{
    $('#setup-screen').hidden=false;
  }
}
function showLogin(){$('#app').hidden=true;$('#setup-screen').hidden=true;$('#login-screen').hidden=false}
async function enter(){
  $('#setup-screen').hidden=true;$('#login-screen').hidden=true;$('#app').hidden=false;
  $('#mode-badge').textContent=mode==='live'?'● Supabase online':'◌ Демо-режим';
  await loadData();renderAll();
}
async function loadData(){
  if(mode==='demo'){
    const saved=local.get('products',null);
    products=saved||await fetch('../products.json',{cache:'no-store'}).then(r=>r.json());
    orders=local.get('orders',[]);promos=local.get('promos',[]);settings=local.get('settings',{});return;
  }
  const [p,o,pr,st]=await Promise.all([
    supabase.from('products').select('*,product_variants(*)').order('sort_order'),
    supabase.from('orders').select('*,order_items(*)').order('created_at',{ascending:false}),
    supabase.from('promotions').select('*').order('created_at',{ascending:false}),
    supabase.from('store_settings').select('*').eq('id','default').maybeSingle()
  ]);
  if(p.error)throw p.error;products=p.data.map(fromDb);orders=o.data||[];promos=pr.data||[];settings=st.data?.value||{};
}
function fromDb(p){return {id:p.id,uk:p.names?.uk||'',ru:p.names?.ru||'',en:p.names?.en||'',category:p.category_slug,price:Number(p.base_price),image:p.image_url||'',new:p.is_new,active:p.is_active,description:p.description?.uk||'',variants:(p.product_variants||[]).map(v=>({id:v.id,sku:v.sku,names:v.names,uk:v.names?.uk||'',ru:v.names?.ru||'',en:v.names?.en||'',price:Number(v.price),stock:Number(v.stock),pillowSizes:v.pillow_sizes||[]}))}}
function persist(){if(mode==='demo'){local.set('products',products);local.set('orders',orders);local.set('promos',promos);local.set('settings',settings)}}

function renderAll(){renderDashboard();renderProducts();renderOrders();renderCustomers();renderPromos();renderSettings()}
function renderDashboard(){
  const revenue=orders.filter(o=>!['cancelled'].includes(o.status)).reduce((n,o)=>n+Number(o.total||0),0),stock=products.reduce((n,p)=>n+totalStock(p),0),newOrders=orders.filter(o=>o.status==='new').length;
  $('#hero-orders').textContent=newOrders;
  $('#stats').innerHTML=[['Товари',products.length,'позицій у каталозі'],['Залишок',stock,'одиниць на складі'],['Замовлення',orders.length,'за весь час'],['Продажі',money(revenue),'без скасованих']].map(x=>`<article class="stat"><p>${x[0]}</p><strong>${x[1]}</strong><small>${x[2]}</small></article>`).join('');
  $('#recent-orders').innerHTML=orders.slice(0,5).map(o=>`<div class="mini-row"><span class="status ${o.status}">${statusLabel(o.status)}</span><div><strong>#${esc(o.order_number||String(o.id).slice(0,8))} · ${esc(o.customer_name)}</strong><small>${dateText(o.created_at)}</small></div><b>${money(o.total)}</b></div>`).join('')||'<div class="mini-row"><div><strong>Замовлень поки немає</strong><small>Нові замовлення зʼявляться тут</small></div></div>';
  const low=products.filter(p=>totalStock(p)<=3).slice(0,5);$('#low-stock').innerHTML=low.map(p=>`<div class="mini-row"><img src="${image(p)}" alt=""><div><strong>${esc(p.uk)}</strong><small>${esc(p.variants?.[0]?.sku||p.id)}</small></div><span class="status low">${totalStock(p)} шт.</span></div>`).join('')||'<div class="mini-row"><div><strong>Запасів достатньо</strong><small>Критичних залишків немає</small></div></div>';
}
function image(p){const x=p.image||'';return /^(https?:|data:)/.test(x)?x:`../${x.replace(/^\.\//,'')}`}
function renderProducts(){
  const q=$('#product-search').value.toLowerCase(),cat=$('#category-filter').value;
  const list=products.filter(p=>(!cat||p.category===cat)&&(!q||[p.uk,p.ru,p.en,p.variants?.map(v=>v.sku).join(' ')].join(' ').toLowerCase().includes(q)));
  $('#product-table').innerHTML=list.map(p=>`<tr><td><div class="product-cell"><img src="${image(p)}" alt=""><div><strong>${esc(p.uk)}</strong><small>${esc(p.variants?.[0]?.sku||p.id)}</small></div></div></td><td>${esc(categoryName(p.category))}</td><td>${money(p.price)}</td><td class="${totalStock(p)<=3?'stock-low':''}">${totalStock(p)} шт.</td><td><span class="status ${p.active===false?'':'active'}">${p.active===false?'Чернетка':'Опубліковано'}</span></td><td><button class="row-actions" data-edit-product="${esc(p.id)}">•••</button></td></tr>`).join('');
}
function renderOrders(){
  const q=$('#order-search').value.toLowerCase(),status=$('#order-status').value;
  const list=orders.filter(o=>(!status||o.status===status)&&(!q||[o.order_number,o.customer_name,o.phone].join(' ').toLowerCase().includes(q)));
  $('#order-table').innerHTML=list.map(o=>`<tr><td><strong>#${esc(o.order_number||String(o.id).slice(0,8))}</strong><br><small>${dateText(o.created_at)}</small></td><td>${esc(o.customer_name)}<br><small>${esc(o.phone)}</small></td><td>${esc(o.carrier||'—')}<br><small>${esc(o.city||'')}</small></td><td><strong>${money(o.total)}</strong></td><td><select data-order-status="${esc(o.id)}"><option value="new">Нове</option><option value="processing">В роботі</option><option value="shipped">Відправлено</option><option value="completed">Виконано</option><option value="cancelled">Скасовано</option></select></td><td><button class="row-actions">•••</button></td></tr>`).join('')||'<tr><td colspan="6">Замовлень поки немає.</td></tr>';
  $$('[data-order-status]').forEach(el=>el.value=orders.find(o=>String(o.id)===el.dataset.orderStatus)?.status||'new');
}
function renderCustomers(){const map=new Map();orders.forEach(o=>{const key=o.phone||o.customer_email||o.customer_name;if(!key)return;const old=map.get(key)||{name:o.customer_name,phone:o.phone,email:o.customer_email,count:0,total:0};old.count++;old.total+=Number(o.total||0);map.set(key,old)});$('#customer-list').innerHTML=[...map.values()].map(c=>`<article class="customer-card"><strong>${esc(c.name)}</strong><small>${esc(c.phone||c.email||'')}</small><p>${c.count} зам. · ${money(c.total)}</p></article>`).join('')||'<p>Клієнти зʼявляться після першого замовлення.</p>'}
function renderPromos(){$('#promo-list').innerHTML=promos.map(p=>`<div class="promo-chip"><b>${esc(p.code)}</b><span>−${p.discount_percent}% · ${p.is_active===false?'вимкнено':'активний'}</span></div>`).join('')}
function renderSettings(){const s={store_name:'Kari-San',phone:'+38 (067) 250-49-39',email:'kari-san@ukr.net',currency:'UAH',nova_enabled:true,ukr_enabled:true,...settings};Object.entries(s).forEach(([k,v])=>{const el=$(`#settings-form [name="${k}"]`);if(!el)return;if(el.type==='checkbox')el.checked=Boolean(v);else el.value=v});$('#connection-state').innerHTML=`<div class="connection-row"><span>База даних</span><strong>${mode==='live'?'Підключено':'Очікує Supabase'}</strong></div><div class="connection-row"><span>Авторизація</span><strong>${mode==='live'?'Захищена':'Демо на пристрої'}</strong></div><div class="connection-row"><span>Каталог магазину</span><strong>${mode==='live'?'Live API':'products.json'}</strong></div>`}

function switchView(name){$$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`));$$('#main-nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===name));$('#page-title').textContent={dashboard:'Огляд',products:'Товари',orders:'Замовлення',customers:'Клієнти',content:'Контент',settings:'Налаштування'}[name];$('.sidebar').classList.remove('open')}
function openProduct(id=''){const p=products.find(x=>String(x.id)===String(id));const f=$('#product-form'),x=f.elements;f.reset();$('#product-dialog-title').textContent=p?'Редагувати товар':'Новий товар';if(p){x.id.value=p.id;x.uk.value=p.uk;x.ru.value=p.ru||'';x.en.value=p.en||'';x.category.value=p.category;x.price.value=p.price;x.stock.value=totalStock(p);x.sku.value=p.variants?.[0]?.sku||'';x.image.value=p.image||'';x.description.value=p.description||'';x.active.checked=p.active!==false;x.is_new.checked=Boolean(p.new)}$('#product-dialog').showModal()}
async function saveProduct(form){
  const d=Object.fromEntries(new FormData(form));const existing=products.find(p=>String(p.id)===d.id);const id=d.id||crypto.randomUUID();
  const product={...(existing||{}),id,uk:d.uk,ru:d.ru||d.uk,en:d.en||d.uk,category:d.category,price:Number(d.price),image:d.image,new:form.elements.is_new.checked,active:form.elements.active.checked,description:d.description,variants:[{...(existing?.variants?.[0]||{}),id:existing?.variants?.[0]?.id||crypto.randomUUID(),sku:d.sku,uk:'Стандарт',ru:'Стандарт',en:'Standard',price:Number(d.price),stock:Number(d.stock),pillowSizes:[]}]};
  if(mode==='live'){
    const row={id:product.id,names:{uk:product.uk,ru:product.ru,en:product.en},category_slug:product.category,base_price:product.price,image_url:product.image,is_new:product.new,is_active:product.active,description:{uk:product.description,ru:product.description,en:product.description}};
    const {error}=await supabase.from('products').upsert(row);if(error)throw error;
    const v=product.variants[0];const {error:ve}=await supabase.from('product_variants').upsert({id:v.id,product_id:product.id,sku:v.sku,names:{uk:v.uk,ru:v.ru,en:v.en},price:v.price,stock:v.stock,pillow_sizes:[]});if(ve)throw ve;
  }
  if(existing)products=products.map(p=>String(p.id)===String(id)?product:p);else products.unshift(product);persist();renderAll();$('#product-dialog').close();toast(existing?'Товар оновлено':'Товар створено')
}
function bind(){
  $('#demo-enter').onclick=async()=>{mode='demo';await enter()};
  $('#login-form').addEventListener('submit',async e=>{e.preventDefault();$('#login-error').textContent='';const fd=new FormData(e.currentTarget);const {error}=await supabase.auth.signInWithPassword({email:fd.get('email'),password:fd.get('password')});if(error){$('#login-error').textContent='Не вдалося увійти. Перевірте email і пароль.';return}session=(await supabase.auth.getSession()).data.session;await enter()});
  $('#logout-button').onclick=async()=>{if(mode==='live')await supabase.auth.signOut();else{session=null;$('#app').hidden=true;$('#setup-screen').hidden=false}};
  $('#main-nav').onclick=e=>{const b=e.target.closest('[data-view]');if(b)switchView(b.dataset.view)};
  document.addEventListener('click',e=>{const go=e.target.closest('[data-go]');if(go)switchView(go.dataset.go);const edit=e.target.closest('[data-edit-product]');if(edit)openProduct(edit.dataset.editProduct)});
  $('#mobile-nav').onclick=()=>$('.sidebar').classList.toggle('open');$('#global-add').onclick=$('#add-product').onclick=()=>openProduct();
  $('#product-search').oninput=renderProducts;$('#category-filter').onchange=renderProducts;$('#order-search').oninput=renderOrders;$('#order-status').onchange=renderOrders;
  $('#product-form').addEventListener('submit',async e=>{e.preventDefault();if(e.submitter?.value==='cancel'){e.currentTarget.closest('dialog').close();return}$('#product-form-error').textContent='';try{await saveProduct(e.currentTarget)}catch(error){console.error(error);$('#product-form-error').textContent='Не вдалося зберегти товар.'}});
  $('#order-table').addEventListener('change',async e=>{if(!e.target.matches('[data-order-status]'))return;const id=e.target.dataset.orderStatus,status=e.target.value;if(mode==='live'){const {error}=await supabase.from('orders').update({status}).eq('id',id);if(error){toast('Не вдалося змінити статус');return}}orders=orders.map(o=>String(o.id)===id?{...o,status}:o);persist();renderDashboard();toast('Статус оновлено')});
  $('#promo-form').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));const promo={id:crypto.randomUUID(),code:d.code.toUpperCase(),discount_percent:Number(d.discount),expires_at:d.expires_at||null,is_active:true,created_at:new Date().toISOString()};if(mode==='live'){const {error}=await supabase.from('promotions').insert(promo);if(error){toast('Не вдалося створити промокод');return}}promos.unshift(promo);persist();renderPromos();e.currentTarget.reset();toast('Промокод створено')});
  $('#content-form').addEventListener('submit',e=>{e.preventDefault();settings={...settings,...Object.fromEntries(new FormData(e.currentTarget))};persist();toast('Контент збережено')});
  $('#settings-form').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);settings={...Object.fromEntries(fd),nova_enabled:e.currentTarget.elements.nova_enabled.checked,ukr_enabled:e.currentTarget.elements.ukr_enabled.checked};if(mode==='live'){const {error}=await supabase.from('store_settings').upsert({id:'default',value:settings});if(error){toast('Не вдалося зберегти');return}}persist();renderSettings();toast('Налаштування збережено')});
}

boot().catch(error=>{console.error(error);$('#setup-screen').hidden=false;toast('Не вдалося завантажити адмінку')});
