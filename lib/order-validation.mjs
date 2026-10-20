export function inputText(value,max=100,required=false){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw Error('Перевірте текстові поля');return value.trim();}
export function uuid(s){return typeof s==='string'&&/^[a-f0-9-]{36}$/.test(s);}
export function validateCheckout(b){
  if(!b||typeof b.key!=='string'||!/^[a-f0-9]{64}$/.test(b.key))throw Error('Оновіть форму замовлення');
  if(b.consent!==true)throw Error('Підтвердьте обробку даних для замовлення');
  if(!Array.isArray(b.items)||b.items.length<1||b.items.length>25)throw Error('Перевірте кошик');
  const phone=String(b.customer?.phone||'').replace(/\D/g,'').replace(/^0/,'380');if(!/^380[3-9]\d{8}$/.test(phone))throw Error('Вкажіть український номер телефону');
  const customer={name:inputText(b.customer?.name,100,true),phone:'+'+phone,email:inputText(b.customer?.email||'',254)};
  if(customer.name.length<3||customer.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))throw Error('Перевірте ім’я та пошту');
  if(!['nova','ukr'].includes(b.delivery?.carrier))throw Error('Оберіть доставку');
  const delivery={carrier:b.delivery.carrier,country:'UA',city:inputText(b.delivery.city,100,true),branch:inputText(b.delivery.branch,200,true),postcode:inputText(b.delivery.postcode||'',5)};
  if(delivery.carrier==='ukr'&&!/^\d{5}$/.test(delivery.postcode))throw Error('Перевірте поштовий індекс');
  if(b.payment!=='cod')throw Error('Онлайн-оплата ще не підключена');
  const items=b.items.map(x=>{if(!x||! /^[a-zA-Z0-9_-]{1,60}$/.test(x.product)||! /^[a-zA-Z0-9_-]{1,60}$/.test(x.variant)||!Number.isInteger(x.qty)||x.qty<1||x.qty>100||!Number.isSafeInteger(x.expectedAmount)||x.expectedAmount<=0)throw Error('Перевірте товари в кошику');return {product:x.product,variant:x.variant,pillow:inputText(x.pillow||'',40),qty:x.qty,expectedAmount:x.expectedAmount};});
  const attr=b.attribution||{};
  return {key:b.key,customer,delivery,payment:'cod',items,comment:inputText(b.comment||'',500),session:uuid(attr.session)?attr.session:null,source:['direct','search','social','other'].includes(attr.source)?attr.source:'direct'};
}
export function quoteItems(input,products){
  const grouped=new Map(),lines=[];let amount=0;
  for(const x of input){const row=products.get(x.product),p=row?.product,v=p?.variants.find(v=>v.id===x.variant);if(!v||row.archived)throw Error('Товар більше недоступний');
    const unit=Math.round(v.price*100);if(v.price===null||!Number.isSafeInteger(unit)||unit<=0||x.expectedAmount!==unit)throw Error('Ціна змінилася. Оновіть кошик');
    if(x.pillow&&!v.pillowSizes.includes(x.pillow)||v.pillowSizes.length&&!x.pillow)throw Error('Оберіть актуальний розмір наволочок');
    const key=x.product+':'+x.variant,used=(grouped.get(key)||0)+x.qty;grouped.set(key,used);if(used>v.stock)throw Error('Недостатньо товару. Оновіть кошик');
    amount+=unit*x.qty;lines.push({...x,name:p.uk,variantName:v.uk,sku:v.sku,unitAmount:unit});
  }
  if(!Number.isSafeInteger(amount)||amount>100000000)throw Error('Сума замовлення завелика');
  return {amount,lines,grouped};
}
