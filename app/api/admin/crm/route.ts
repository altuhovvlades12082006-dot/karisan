import {db,guard,json,boundedBody} from '../../../../lib/store';
import {acceptingOrders,orderDetail,updateOrder,Conflict} from '../../../../lib/crm';
import {inputText} from '../../../../lib/order-validation.mjs';
export async function GET(r:Request){const denied=await guard(r);if(denied)return denied;
  const u=new URL(r.url),view=u.searchParams.get('view')||'orders',database=db();
  if(view==='order'){const o=await orderDetail(u.searchParams.get('id')||'');return o?json(o):json({error:'Замовлення не знайдено'},404);}
  const page=Math.min(100000,Math.max(0,parseInt(u.searchParams.get('page')||'0')||0)),offset=page*100;
  const q=(u.searchParams.get('q')||'').trim().slice(0,100),like='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
  if(view==='customers'){const {results}=await database.prepare("SELECT c.*,COUNT(o.id) AS order_count,COALESCE(SUM(o.paid-o.refunded),0) AS net,MAX(o.created_at) AS last_order FROM customers c LEFT JOIN orders o ON o.customer_id=c.id WHERE c.name LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' GROUP BY c.id ORDER BY last_order DESC LIMIT 100 OFFSET ?").bind(like,like,like,offset).all();return json(results);}
  if(view==='stock'){const {results}=await database.prepare('SELECT m.*,p.data FROM stock_movements m LEFT JOIN products p ON p.id=m.product_id ORDER BY m.created_at DESC LIMIT 100 OFFSET ?').bind(offset).all();return json(results.map((r:any)=>({...r,data:undefined,name:r.data?JSON.parse(r.data).uk:r.product_id})));}
  const filter=u.searchParams.get('status')||'';
  const {results}=await database.prepare("SELECT o.id,o.number,o.status,o.amount,o.paid,o.refunded,o.country,o.source,o.tracking,o.created_at,o.version,json_extract(o.data,'$.customer.name') AS name,json_extract(o.data,'$.customer.phone') AS phone FROM orders o WHERE (?='' OR status=?) AND (o.number LIKE ? ESCAPE '\\' OR json_extract(o.data,'$.customer.name') LIKE ? ESCAPE '\\' OR json_extract(o.data,'$.customer.phone') LIKE ? ESCAPE '\\') ORDER BY o.created_at DESC LIMIT 100 OFFSET ?").bind(filter,filter,like,like,like,offset).all();
  const {results:counts}=await database.prepare('SELECT status,COUNT(*) AS total FROM orders GROUP BY status').all();return json({orders:results,counts,accepting:await acceptingOrders()});
}
export async function POST(r:Request){const denied=await guard(r,true);if(denied)return denied;
  try{const body=JSON.parse(new TextDecoder().decode(await boundedBody(r,12000)));
    if(body.action==='settings'){if(typeof body.accepting!=='boolean'||body.accepting&&body.ready!==true)throw Error('Підтвердьте готовність приймати та обробляти замовлення');await db().prepare("INSERT INTO settings (key,value) VALUES ('orders-enabled',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(body.accepting)).run();return json({accepting:body.accepting});}
    if(body.action==='customer'){const name=inputText(body.name,100,true),email=inputText(body.email||'',254),notes=inputText(body.notes||'',3000);if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Перевірте пошту');const result=await db().prepare('UPDATE customers SET name=?,email=?,notes=?,version=version+1,updated_at=? WHERE id=? AND version=?').bind(name,email,notes,new Date().toISOString(),body.id,body.version).run();if(result.meta.changes!==1)throw new Conflict('Контакт вже змінився. Оновіть дані');return json({ok:true});}
    return json(await updateOrder(body.id,body));
  }catch(e){return json({error:e instanceof Error&&!e.message.includes('D1')?e.message:'Не вдалося виконати операцію'},e instanceof Conflict?409:400);}
}
