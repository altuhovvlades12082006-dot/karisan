import {db,guard,json,boundedBody,initializeCatalog} from '../../../../lib/store';
import {validateProduct} from '../../../../lib/catalog-validation.mjs';
import {checked} from '../../../../lib/crm';
export async function GET(r:Request){const denied=await guard(r);if(denied)return denied;
  const {results}=await db().prepare('SELECT data,version,archived FROM products ORDER BY updated_at DESC,id').all<{data:string,version:number,archived:number}>();return json(results.map(row=>({product:JSON.parse(row.data),version:row.version,archived:!!row.archived})));
}
export async function POST(r:Request){const denied=await guard(r,true);if(denied)return denied;
  let body:any;try{body=JSON.parse(new TextDecoder().decode(await boundedBody(r,65000)));body.product=validateProduct(body.product);
    if(!Number.isInteger(body.version)||body.version<0||typeof body.archived!=='boolean')throw Error('Перевірте версію товару');
  }catch(e){return json({error:(e as Error).message},400);}
  await initializeCatalog();const p=body.product,database=db();
  const previous=await database.prepare('SELECT data,version FROM products WHERE id=?').bind(p.id).first<{data:string,version:number}>();
  if(body.version>0&&previous?.version!==body.version)return json({error:'Залишки вже змінилися. Оновіть список перед редагуванням.'},409);
  const old=previous?JSON.parse(previous.data):null;
  const references=await database.prepare('SELECT DISTINCT variant_id FROM order_items WHERE product_id=?').bind(p.id).all<{variant_id:string}>();
  if(references.results.some(v=>!p.variants.some((x:any)=>x.id===v.variant_id)))return json({error:'Розмір є в історії замовлень. Залиште його з нульовим залишком замість видалення.'},400);
  const stmt=body.version===0?database.prepare('INSERT OR IGNORE INTO products (id,data,version,archived,updated_at) VALUES (?,?,1,?,?)').bind(p.id,JSON.stringify(p),Number(body.archived),p.updatedAt):database.prepare('UPDATE products SET data=?,version=version+1,archived=?,updated_at=? WHERE id=? AND version=?').bind(JSON.stringify(p),Number(body.archived),p.updatedAt,p.id,body.version);
  const statements=checked(database,stmt,crypto.randomUUID());
  const ids=new Set([...(old?.variants||[]).map((x:any)=>x.id),...p.variants.map((x:any)=>x.id)]);
  for(const id of ids){const delta=(p.variants.find((x:any)=>x.id===id)?.stock||0)-(old?.variants.find((x:any)=>x.id===id)?.stock||0);if(delta)statements.push(database.prepare('INSERT INTO stock_movements (id,product_id,variant_id,order_id,delta,reason,created_at) VALUES (?,?,?,NULL,?,\'adjustment\',?)').bind(crypto.randomUUID(),p.id,id,delta,p.updatedAt));}
  try{await database.batch(statements);}catch{return json({error:'Товар уже змінено. Оновіть список перед збереженням.'},409);}
  return json({product:p,version:body.version+1,archived:body.archived});
}
