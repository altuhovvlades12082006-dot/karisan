import {crmRPC,supabaseAccepting} from './supabase-crm.mjs';
import {supabaseProducts} from './supabase-catalog.mjs';

export async function supabaseStatistics(env,database,range,fetcher=fetch){
  const {start,end}=range;
  const [commerce,products,traffic]=await Promise.all([
    crmRPC(env,'server_commerce_statistics',{start_day:start,end_day:end},fetcher),
    supabaseProducts(env,false,fetcher),
    database.batch([
      database.prepare('SELECT type,COUNT(*) AS events,COUNT(DISTINCT session) AS sessions FROM analytics_events WHERE day BETWEEN ? AND ? GROUP BY type').bind(start,end),
      database.prepare('SELECT COUNT(DISTINCT session) AS sessions FROM analytics_events WHERE day BETWEEN ? AND ?').bind(start,end),
      database.prepare("SELECT day,COUNT(DISTINCT session) AS sessions,SUM(CASE WHEN type='page_view' THEN 1 ELSE 0 END) AS views FROM analytics_events WHERE day BETWEEN ? AND ? GROUP BY day ORDER BY day").bind(start,end),
      database.prepare("SELECT product_id AS id,SUM(CASE WHEN type='product_view' THEN 1 ELSE 0 END) AS views,SUM(CASE WHEN type='add_to_cart' THEN 1 ELSE 0 END) AS carts FROM analytics_events WHERE day BETWEEN ? AND ? AND product_id IS NOT NULL GROUP BY product_id ORDER BY views DESC,carts DESC LIMIT 10").bind(start,end),
      database.prepare('SELECT device,COUNT(DISTINCT session) AS sessions FROM analytics_events WHERE day BETWEEN ? AND ? GROUP BY device').bind(start,end),
      database.prepare('SELECT source,COUNT(DISTINCT session) AS sessions FROM analytics_events WHERE day BETWEEN ? AND ? GROUP BY source').bind(start,end),
      database.prepare('SELECT country,COUNT(DISTINCT session) AS sessions FROM analytics_events WHERE day BETWEEN ? AND ? GROUP BY country ORDER BY sessions DESC,country LIMIT 100').bind(start,end),
      database.prepare("SELECT value FROM settings WHERE key='analytics-started'")
    ])
  ]);
  const inventory=products.map(p=>({id:p.id,name:p.uk,stock:p.variants.reduce((n,v)=>n+v.stock,0)}));
  return {range,timezone:'Europe/Kyiv',startedAt:traffic[7].results[0]?.value||null,generatedAt:new Date().toISOString(),
    traffic:{sessions:traffic[1].results[0]?.sessions||0,events:traffic[0].results,daily:traffic[2].results,devices:traffic[4].results,sources:traffic[5].results,countries:traffic[6].results,
      top:traffic[3].results.map(p=>({...p,name:products.find(x=>x.id===p.id)?.uk||p.id}))},
    sales:{gross:commerce.gross,refunds:commerce.refunds,net:commerce.gross-commerce.refunds,receipts:commerce.paidOrders,quantity:commerce.quantity,refundReceipts:commerce.refundReceipts,source:'supabase-crm',manualEnabled:false,checkoutConnected:await supabaseAccepting(env,fetcher)},
    commerce,inventory:{total:inventory.length,outOfStock:inventory.filter(p=>p.stock===0),lowStock:inventory.filter(p=>p.stock>0&&p.stock<=3)}};
}
