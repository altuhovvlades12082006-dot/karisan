import {db,guard,json,boundedBody} from '../../../../lib/store';
import {dateRange,validateSale} from '../../../../lib/statistics.mjs';
export async function GET(r:Request){const denied=await guard(r);if(denied)return denied;
  let range;try{range=dateRange(new URL(r.url).searchParams);}catch(e){return json({error:(e as Error).message},400);}
  const {results}=await db().prepare('SELECT id,reference,day,amount,quantity,refund,refund_day AS refundDay,voided,version FROM sales_ledger WHERE day BETWEEN ? AND ? OR refund_day BETWEEN ? AND ? ORDER BY day DESC,updated_at DESC LIMIT 100').bind(range.start,range.end,range.start,range.end).all();return json(results.map(r=>({...r,voided:!!r.voided})));
}
export async function POST(r:Request){const denied=await guard(r,true);if(denied)return denied;
  let s;try{s=validateSale(JSON.parse(new TextDecoder().decode(await boundedBody(r,4000))));}catch(e){return json({error:(e as Error).message},400);}
  try{const database=db(),now=new Date().toISOString();
    if(await database.prepare('SELECT id FROM orders WHERE number=?').bind(s.reference).first())return json({error:'Замовлення сайту враховується автоматично. Запишіть оплату або повернення у CRM, не дублюйте чек.'},400);
    const statement=s.version===0?database.prepare('INSERT OR IGNORE INTO sales_ledger (id,reference,day,amount,quantity,refund,refund_day,voided,version,updated_at) VALUES (?,?,?,?,?,?,?,?,1,?)').bind(s.id,s.reference,s.day,s.amount,s.quantity,s.refund,s.refundDay,Number(s.voided),now):database.prepare('UPDATE sales_ledger SET reference=?,day=?,amount=?,quantity=?,refund=?,refund_day=?,voided=?,version=version+1,updated_at=? WHERE id=? AND version=?').bind(s.reference,s.day,s.amount,s.quantity,s.refund,s.refundDay,Number(s.voided),now,s.id,s.version);
    const result=await statement.run();if(result.meta.changes!==1)return json({error:'Такий номер уже існує або запис змінився. Оновіть список.'},409);
    return json({...s,version:s.version+1});
  }catch{return json({error:'Не вдалося зберегти. Перевірте унікальність номера чека.'},409);}
}
