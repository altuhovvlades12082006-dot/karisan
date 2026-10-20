import {db,initializeCatalog} from './store';
import {digest} from './password-auth.mjs';
import {inputText,uuid,validateCheckout,quoteItems} from './order-validation.mjs';
import {shopDay} from './statistics.mjs';
import {requestCountry} from './request-country';
type DB=ReturnType<typeof db>;
export class Conflict extends Error{}
export function checked(database:DB,statement:D1PreparedStatement,key:string){return [statement,database.prepare('INSERT INTO crm_checks (id,ok) VALUES (?,changes())').bind(key),database.prepare('DELETE FROM crm_checks WHERE id=?').bind(key)];}
export async function acceptingOrders(){const r=await db().prepare("SELECT value FROM settings WHERE key='orders-enabled'").first<{value:string}>();return r?.value==='true';}
export async function orderDetail(id:string){const database=db();const order=await database.prepare('SELECT * FROM orders WHERE id=?').bind(id).first<any>();if(!order)return null;
  const [items,transactions,history]=await database.batch([database.prepare('SELECT * FROM order_items WHERE order_id=?').bind(id),database.prepare('SELECT * FROM order_transactions WHERE order_id=? ORDER BY created_at').bind(id),database.prepare('SELECT kind,details,created_at FROM crm_actions WHERE order_id=? ORDER BY created_at').bind(id)]);
  return {...order,data:JSON.parse(order.data),items:items.results,transactions:transactions.results,history:history.results.map((x:any)=>({...x,details:JSON.parse(x.details)}))};
}
const receipt=(o:any)=>({id:o.id,number:o.number,amount:o.amount,currency:'UAH',status:o.status,payment:'cod'});
export async function createOrder(raw:unknown){
  const b=validateCheckout(raw),database=db(),token=await digest(b.key),hash=await digest(JSON.stringify({...b,key:undefined}));
  const existing=await database.prepare('SELECT * FROM orders WHERE idempotency=?').bind(token).first<any>();if(existing){if(existing.request_hash!==hash)throw new Conflict('Цей запит уже використано. Перевірте попереднє замовлення');return receipt(existing);}
  if(!await acceptingOrders())throw new Conflict('Приймання замовлень ще не відкрите');
  await initializeCatalog();const map=new Map<string,any>();
  for(const id of new Set<string>(b.items.map((x:any)=>String(x.product)))){const row=await database.prepare('SELECT * FROM products WHERE id=?').bind(id).first<any>();if(row)map.set(id,{...row,product:JSON.parse(row.data)});}
  const quote=quoteItems(b.items,map),id=crypto.randomUUID(),number='KS-'+Date.now().toString(36).toUpperCase()+'-'+id.slice(0,6).toUpperCase(),now=new Date().toISOString(),customerId=await digest('customer:'+b.customer.phone);
  const statements:D1PreparedStatement[]=[];
  for(const [pid,row]of map){for(const v of row.product.variants){const qty=quote.grouped.get(pid+':'+v.id)||0;if(qty)v.stock-=qty;}
    row.product.updatedAt=now;statements.push(...checked(database,database.prepare('UPDATE products SET data=?,version=version+1,updated_at=? WHERE id=? AND version=?').bind(JSON.stringify(row.product),now,pid,row.version),id+pid));
  }
  statements.push(database.prepare('INSERT OR IGNORE INTO customers (id,phone,name,email,notes,version,created_at,updated_at) VALUES (?,?,?,?,\'\',1,?,?)').bind(customerId,b.customer.phone,b.customer.name,b.customer.email,now,now));
  statements.push(database.prepare('INSERT INTO orders (id,number,idempotency,request_hash,customer_id,data,status,amount,paid,refunded,stock_state,tracking,notes,country,source,session,version,day,created_at,updated_at) VALUES (?,?,?,?,?,?,\'new\',?,0,0,\'reserved\',\'\',\'\',?,?,?,1,?,?,?)').bind(id,number,token,hash,customerId,JSON.stringify({customer:b.customer,delivery:b.delivery,payment:b.payment,comment:b.comment}),quote.amount,requestCountry(),b.source,b.session,shopDay(),now,now));
  quote.lines.forEach((x:any,i:number)=>{statements.push(database.prepare('INSERT INTO order_items (id,order_id,product_id,variant_id,name,variant_name,sku,pillow,quantity,unit_amount,returned) VALUES (?,?,?,?,?,?,?,?,?,?,0)').bind(id+':'+i,id,x.product,x.variant,x.name,x.variantName,x.sku,x.pillow,x.qty,x.unitAmount));statements.push(database.prepare('INSERT INTO stock_movements (id,product_id,variant_id,order_id,delta,reason,created_at) VALUES (?,?,?,?,?,\'reserve\',?)').bind(crypto.randomUUID(),x.product,x.variant,id,-x.qty,now));});
  statements.push(database.prepare('INSERT INTO crm_actions (id,order_id,kind,request_hash,details,created_at) VALUES (?, ?,\'created\',?,\'{}\',?)').bind(id,id,hash,now));
  try{await database.batch(statements);}catch{const prior=await database.prepare('SELECT * FROM orders WHERE idempotency=?').bind(token).first<any>();if(prior&&prior.request_hash===hash)return receipt(prior);throw new Conflict('Товари змінилися під час оформлення. Оновіть кошик');}
  return receipt({id,number,amount:quote.amount,status:'new'});
}
export async function updateOrder(id:string,body:any){
  if(!uuid(id)||!uuid(body?.operation)||!Number.isInteger(body.version))throw Error('Перевірте запит');
  const database=db(),hash=await digest(JSON.stringify(body));
  const repeated=await database.prepare('SELECT * FROM crm_actions WHERE id=?').bind(body.operation).first<any>();if(repeated){if(repeated.order_id!==id||repeated.request_hash!==hash)throw new Conflict('Інша операція з цим ID вже існує');return orderDetail(id);}
  const order=await orderDetail(id);if(!order)throw Error('Замовлення не знайдено');if(order.version!==body.version)throw new Conflict('Замовлення вже змінено. Оновіть картку');
  const now=new Date().toISOString(),statements:D1PreparedStatement[]=[],details:any={};let status=order.status,stock=order.stock_state,paid=order.paid,refunded=order.refunded,tracking=order.tracking,notes=order.notes;
  const stockReturns=new Map<string,number>();
  if(body.action==='processing'){if(status!=='new')throw Error('Цей статус недоступний');status='processing';}
  else if(body.action==='shipped'){if(!['new','processing'].includes(status))throw Error('Замовлення вже відправлене або закрите');tracking=inputText(body.tracking||tracking,60,true);status='shipped';stock='sold';details.tracking=tracking;}
  else if(body.action==='completed'){if(status!=='shipped'||paid<order.amount)throw Error('Спочатку відправте замовлення та підтвердіть оплату');status='completed';}
  else if(body.action==='note'){notes=inputText(body.notes||'',3000);tracking=inputText(body.tracking||tracking,60);details.note=notes;}
  else if(body.action==='cancelled'){if(!['new','processing'].includes(status)||stock!=='reserved')throw Error('Після відправки використовуйте повернення товару');if(paid>refunded)throw Error('Спочатку оформіть фактичне повернення коштів');status='cancelled';stock='released';for(const x of order.items as any[])stockReturns.set(x.id,x.quantity);}
  else if(body.action==='payment'||body.action==='refund'){
    if(!Number.isSafeInteger(body.amount)||body.amount<=0)throw Error('Перевірте суму в копійках');
    const reference=inputText(body.reference,100,true);if(!['cod','bank'].includes(body.method))throw Error('Оберіть підтвердження післяплати або банківського надходження');
    if(body.action==='payment'){if(status==='cancelled'||status==='returned'||paid!==0||body.amount!==order.amount)throw Error('Підтвердьте повну суму замовлення один раз');paid+=body.amount;}
    else{if(refunded+body.amount>paid)throw Error('Не можна повернути більше отриманого');refunded+=body.amount;}
    statements.push(database.prepare('INSERT INTO order_transactions (id,order_id,type,amount,method,reference,day,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(body.operation,id,body.action,body.amount,body.method,reference,shopDay(),now));Object.assign(details,{amount:body.amount,method:body.method,reference});
  }
  else if(body.action==='restock'){
    if(!['shipped','completed','returned'].includes(status)||stock!=='sold')throw Error('Повернення на склад доступне після відправки');
    if(!Array.isArray(body.items)||!body.items.length||body.items.length>25)throw Error('Оберіть повернуті товари');
    const unique=new Set();for(const returned of body.items){const item=(order.items as any[]).find(x=>x.id===returned.id);if(!item||unique.has(item.id)||!Number.isInteger(returned.qty)||returned.qty<1||returned.qty>item.quantity-item.returned)throw Error('Некоректна кількість повернення');unique.add(item.id);stockReturns.set(item.id,returned.qty);statements.push(database.prepare('UPDATE order_items SET returned=returned+? WHERE id=?').bind(returned.qty,item.id));}
    if((order.items as any[]).every(x=>x.returned+(stockReturns.get(x.id)||0)===x.quantity))status='returned';details.items=body.items;
  }
  else throw Error('Невідома дія');
  const products=new Map<string,any>();
  for(const [itemId,qty]of stockReturns){const item=(order.items as any[]).find(x=>x.id===itemId);if(!products.has(item.product_id)){const row=await database.prepare('SELECT * FROM products WHERE id=?').bind(item.product_id).first<any>();if(!row)throw Error('Картку товару не знайдено');products.set(item.product_id,{...row,product:JSON.parse(row.data)});}
    const v=products.get(item.product_id).product.variants.find((v:any)=>v.id===item.variant_id);if(!v||v.stock+qty>100000)throw Error('Варіант товару відсутній або завеликий залишок');v.stock+=qty;
    statements.push(database.prepare('INSERT INTO stock_movements (id,product_id,variant_id,order_id,delta,reason,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),item.product_id,item.variant_id,id,qty,body.action==='cancelled'?'release':'restock',now));
  }
  for(const [pid,row]of products){row.product.updatedAt=now;statements.push(...checked(database,database.prepare('UPDATE products SET data=?,version=version+1,updated_at=? WHERE id=? AND version=?').bind(JSON.stringify(row.product),now,pid,row.version),body.operation+pid));}
  statements.push(...checked(database,database.prepare('UPDATE orders SET status=?,stock_state=?,paid=?,refunded=?,tracking=?,notes=?,version=version+1,updated_at=? WHERE id=? AND version=?').bind(status,stock,paid,refunded,tracking,notes,now,id,body.version),body.operation));
  statements.push(database.prepare('INSERT INTO crm_actions (id,order_id,kind,request_hash,details,created_at) VALUES (?,?,?,?,?,?)').bind(body.operation,id,body.action,hash,JSON.stringify(details),now));
  try{await database.batch(statements);}catch{const prior=await database.prepare('SELECT request_hash FROM crm_actions WHERE id=?').bind(body.operation).first<any>();if(prior?.request_hash===hash)return orderDetail(id);throw new Conflict('Залишки або замовлення вже змінилися. Оновіть дані');}
  return orderDetail(id);
}
