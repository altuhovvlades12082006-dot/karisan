import {db,guard,json} from '../../../../lib/store';
import {dateRange} from '../../../../lib/statistics.mjs';
import {acceptingOrders} from '../../../../lib/crm';
export async function GET(r:Request){
  const denied=await guard(r);if(denied)return denied;
  let range;try{range=dateRange(new URL(r.url).searchParams);}catch(e){return json({error:(e as Error).message},400);}
  const {start,end}=range,database=db();
  const results=await database.batch([
    database.prepare('SELECT type,COUNT(*) AS events,COUNT(DISTINCT session) AS sessions FROM analytics_events WHERE day BETWEEN ? AND ? GROUP BY type').bind(start,end),
    database.prepare('SELECT COUNT(DISTINCT session) AS sessions FROM analytics_events WHERE day BETWEEN ? AND ?').bind(start,end),
    database.prepare("SELECT day,COUNT(DISTINCT session) AS sessions,SUM(CASE WHEN type='page_view' THEN 1 ELSE 0 END) AS views FROM analytics_events WHERE day BETWEEN ? AND ? GROUP BY day ORDER BY day").bind(start,end),
    database.prepare("SELECT product_id AS id,SUM(CASE WHEN type='product_view' THEN 1 ELSE 0 END) AS views,SUM(CASE WHEN type='add_to_cart' THEN 1 ELSE 0 END) AS carts FROM analytics_events WHERE day BETWEEN ? AND ? AND product_id IS NOT NULL GROUP BY product_id ORDER BY views DESC,carts DESC LIMIT 10").bind(start,end),
    database.prepare('SELECT device,COUNT(DISTINCT session) AS sessions FROM analytics_events WHERE day BETWEEN ? AND ? GROUP BY device').bind(start,end),
    database.prepare('SELECT source,COUNT(DISTINCT session) AS sessions FROM analytics_events WHERE day BETWEEN ? AND ? GROUP BY source').bind(start,end),
    database.prepare('SELECT COUNT(*) AS receipts,COALESCE(SUM(amount),0) AS gross,COALESCE(SUM(quantity),0) AS quantity FROM sales_ledger WHERE voided=0 AND day BETWEEN ? AND ?').bind(start,end),
    database.prepare('SELECT COUNT(*) AS receipts,COALESCE(SUM(refund),0) AS amount FROM sales_ledger WHERE voided=0 AND refund>0 AND refund_day BETWEEN ? AND ?').bind(start,end),
    database.prepare("SELECT value FROM settings WHERE key='analytics-started'"),
    database.prepare('SELECT data FROM products WHERE archived=0'),
    database.prepare('SELECT country,COUNT(DISTINCT session) AS sessions FROM analytics_events WHERE day BETWEEN ? AND ? GROUP BY country ORDER BY sessions DESC,country LIMIT 100').bind(start,end),
    database.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cancelled FROM orders WHERE day BETWEEN ? AND ?").bind(start,end),
    database.prepare('SELECT type,COUNT(DISTINCT order_id) AS receipts,COALESCE(SUM(amount),0) AS amount FROM order_transactions WHERE day BETWEEN ? AND ? GROUP BY type').bind(start,end),
    database.prepare("SELECT COALESCE(SUM(quantity),0) AS quantity FROM order_items i WHERE EXISTS(SELECT 1 FROM order_transactions t WHERE t.order_id=i.order_id AND t.type='payment' AND t.day BETWEEN ? AND ?)").bind(start,end),
    database.prepare("SELECT o.country,o.source,COUNT(*) AS orders FROM orders o WHERE EXISTS(SELECT 1 FROM order_transactions t WHERE t.order_id=o.id AND t.type='payment' AND t.day BETWEEN ? AND ?) GROUP BY o.country,o.source ORDER BY orders DESC LIMIT 100").bind(start,end),
    database.prepare("SELECT COUNT(*) AS active FROM orders WHERE status IN ('new','processing')"),
    database.prepare("SELECT i.product_id AS id,i.name,SUM(i.quantity) AS quantity FROM order_items i WHERE EXISTS(SELECT 1 FROM order_transactions t WHERE t.order_id=i.order_id AND t.type='payment' AND t.day BETWEEN ? AND ?) GROUP BY i.product_id,i.name ORDER BY quantity DESC LIMIT 10").bind(start,end),
  ]);
  const row=(n:number)=>results[n].results[0] as any;
  const productMap=new Map(results[9].results.map((p:any)=>{const data=JSON.parse(p.data);return [data.id,data];}));
  const inventory=Array.from(productMap.values()).map((p:any)=>({id:p.id,name:p.uk,stock:p.variants.reduce((n:number,v:any)=>n+v.stock,0)}));
  const incoming=results[12].results.find((x:any)=>x.type==='payment') as any||{amount:0,receipts:0},returns=results[12].results.find((x:any)=>x.type==='refund') as any||{amount:0,receipts:0};
  const gross=(row(6)?.gross||0)+incoming.amount,refunds=(row(7)?.amount||0)+returns.amount;
  const sales={gross,refunds,net:gross-refunds,receipts:(row(6)?.receipts||0)+incoming.receipts,quantity:(row(6)?.quantity||0)+(row(13)?.quantity||0),refundReceipts:(row(7)?.receipts||0)+returns.receipts,source:'mixed',checkoutConnected:await acceptingOrders()};
  const commerce={...row(11),active:row(15)?.active||0,paidOrders:incoming.receipts,gross:incoming.amount,refunds:returns.amount,geography:results[14].results,top:results[16].results,paymentProviderConnected:false};
  return json({range,timezone:'Europe/Kyiv',startedAt:row(8)?.value||null,generatedAt:new Date().toISOString(),traffic:{sessions:row(1)?.sessions||0,events:results[0].results,daily:results[2].results,devices:results[4].results,sources:results[5].results,countries:results[10].results,top:results[3].results.map((p:any)=>({...p,name:productMap.get(p.id)?.uk||p.id}))},sales,commerce,inventory:{total:inventory.length,outOfStock:inventory.filter(p=>p.stock===0),lowStock:inventory.filter(p=>p.stock>0&&p.stock<=3)}});
}
