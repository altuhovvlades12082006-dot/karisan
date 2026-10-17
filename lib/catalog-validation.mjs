export const categories = ['gold','stripe','satin','washed','flannel','linen-new','towels','duvets','protectors','covers','pillows'];
function text(v, max=250, required=false) {
  if(typeof v!=='string'||v.length>max||(required&&!v.trim())) throw Error('Перевірте текстові поля');
  return v.trim();
}
function amount(v, nullable=false) {
  if(nullable && v===null) return null;
  if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1000000||Math.abs(Math.round(v*100)-v*100)>0.000001) throw Error('Некоректна ціна');
  return v;
}
export function validateProduct(p) {
  if(!p||typeof p!=='object'||!categories.includes(p.category)) throw Error('Оберіть категорію');
  if(typeof p.id!=='string'||! /^[a-zA-Z0-9_-]{1,60}$/.test(p.id)) throw Error('Некоректний ID');
  if(typeof p.image!=='string'||! /^(?:assets\/[a-zA-Z0-9_.-]+\.(?:webp|png|jpg|jpeg)|\/media\/[a-f0-9-]+\.(?:webp|png|jpg))$/.test(p.image)) throw Error('Завантажте фотографію');
  if(!Array.isArray(p.variants)||p.variants.length<1||p.variants.length>50) throw Error('Додайте від 1 до 50 варіантів');
  const ids=new Set();
  const variants=p.variants.map(v=>{
    const id=text(v.id,60,true); if(!/^[a-zA-Z0-9_-]+$/.test(id)||ids.has(id))throw Error('ID варіантів мають бути унікальними');ids.add(id);
    if(!Number.isInteger(v.stock)||v.stock<0||v.stock>100000)throw Error('Залишок має бути цілим невід’ємним числом');
    const price=amount(v.price,true);if(v.stock>0&&(price===null||price===0))throw Error('Для наявного товару потрібна ціна');
    if(!Array.isArray(v.pillowSizes)||v.pillowSizes.length>10)throw Error('Перевірте розміри наволочок');
    return {id,uk:text(v.uk,150,true),ru:text(v.ru||v.uk,150),en:text(v.en||v.uk,150),price,stock:v.stock,sku:text(v.sku||'',80),pillowSizes:v.pillowSizes.map(x=>text(x,40))};
  });
  const prices=variants.map(v=>v.price).filter(v=>v!==null);
  return {id:p.id,uk:text(p.uk,250,true),ru:text(p.ru||p.uk),en:text(p.en||p.uk),category:p.category,image:p.image,children:p.children===true,new:p.new===true,price:prices.length?Math.min(...prices):null,variants,
    material:{uk:text(p.material?.uk||'',5000),ru:text(p.material?.ru||p.material?.uk||'',5000),en:text(p.material?.en||p.material?.uk||'',5000)},
    sourceDescription:text(p.sourceDescription||'',10000),updatedAt:new Date().toISOString()};
}
export function imageExtension(bytes,type) {
  const b=bytes;
  if(type==='image/jpeg'&&b[0]===255&&b[1]===216&&b[2]===255)return 'jpg';
  if(type==='image/png'&&[137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x))return 'png';
  if(type==='image/webp'&&String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP')return 'webp';
  throw Error('Дозволені лише JPG, PNG та WebP');
}
