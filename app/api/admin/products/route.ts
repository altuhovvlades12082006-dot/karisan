import {db,guard,json,boundedBody,initializeCatalog} from '../../../../lib/store';
import {validateProduct} from '../../../../lib/catalog-validation.mjs';
export async function GET(r:Request){const denied=await guard(r);if(denied)return denied;
  const {results}=await db().prepare('SELECT data,version,archived FROM products ORDER BY updated_at DESC,id').all<{data:string,version:number,archived:number}>();return json(results.map(row=>({product:JSON.parse(row.data),version:row.version,archived:!!row.archived})));
}
export async function POST(r:Request){const denied=await guard(r,true);if(denied)return denied;
  let body:any;try{body=JSON.parse(new TextDecoder().decode(await boundedBody(r,65000)));body.product=validateProduct(body.product);
    if(!Number.isInteger(body.version)||body.version<0||typeof body.archived!=='boolean')throw Error('Перевірте версію товару');
  }catch(e){return json({error:(e as Error).message},400);}
  await initializeCatalog();const p=body.product;
  const stmt=body.version===0?db().prepare('INSERT OR IGNORE INTO products (id,data,version,archived,updated_at) VALUES (?,?,1,?,?)').bind(p.id,JSON.stringify(p),Number(body.archived),p.updatedAt):db().prepare('UPDATE products SET data=?,version=version+1,archived=?,updated_at=? WHERE id=? AND version=?').bind(JSON.stringify(p),Number(body.archived),p.updatedAt,p.id,body.version);
  const result=await stmt.run();if(result.meta.changes!==1)return json({error:'Товар уже змінено. Оновіть список перед збереженням.'},409);
  return json({product:p,version:body.version+1,archived:body.archived});
}
