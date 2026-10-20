import {db,guard,json} from '../../../../lib/store';
import {dateRange} from '../../../../lib/statistics.mjs';
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
  ]);
  const row=(n:number)=>results[n].results[0] as any;
  const productMap=new Map(results[9].results.map((p:any)=>{const data=JSON.parse(p.data);return [data.id,data];}));
  const inventory=Array.from(productMap.values()).map((p:any)=>({id:p.id,name:p.uk,stock:p.variants.reduce((n:number,v:any)=>n+v.stock,0)}));
  return json({range,timezone:'Europe/Kyiv',startedAt:row(8)?.value||null,generatedAt:new Date().toISOString(),traffic:{sessions:row(1)?.sessions||0,events:results[0].results,daily:results[2].results,devices:results[4].results,sources:results[5].results,top:results[3].results.map((p:any)=>({...p,name:productMap.get(p.id)?.uk||p.id}))},sales:{...row(6),refundReceipts:row(7)?.receipts||0,refunds:row(7)?.amount||0,net:(row(6)?.gross||0)-(row(7)?.amount||0),source:'manual',checkoutConnected:false},inventory:{total:inventory.length,outOfStock:inventory.filter(p=>p.stock===0),lowStock:inventory.filter(p=>p.stock>0&&p.stock<=3)}});
}
