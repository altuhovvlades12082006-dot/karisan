export const eventTypes=['page_view','product_view','add_to_cart','checkout_start'];
export function shopDay(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export function validDay(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}
export function shiftDay(day,n){return new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
export function dateRange(params,today=shopDay()){
  const end=params.get('end')||today,start=params.get('start')||shiftDay(end,-6);
  if(!validDay(start)||!validDay(end)||start>end||end>today||start<shiftDay(today,-89))throw Error('Оберіть період у межах останніх 90 днів');
  return {start,end};
}
export function validateEvent(e){
  if(!e||!/^[a-f0-9-]{36}$/.test(e.id)||!/^[a-f0-9-]{36}$/.test(e.session)||!eventTypes.includes(e.type))throw Error('Invalid event');
  if(!['mobile','tablet','desktop'].includes(e.device)||!['direct','search','social','other'].includes(e.source))throw Error('Invalid dimension');
  const productId=e.productId??null;
  if(['product_view','add_to_cart'].includes(e.type)&&!(typeof productId==='string'&&/^[a-zA-Z0-9_-]{1,60}$/.test(productId)))throw Error('Invalid product');
  return {id:e.id,session:e.session,type:e.type,device:e.device,source:e.source,productId:['product_view','add_to_cart'].includes(e.type)?productId:null};
}
export function validateSale(s,today=shopDay()){
  if(!s||!/^[a-f0-9-]{36}$/.test(s.id)||!Number.isInteger(s.version)||s.version<0)throw Error('Некоректний запис');
  if(typeof s.reference!=='string'||!s.reference.trim()||s.reference.length>80)throw Error('Вкажіть номер чека або замовлення');
  if(!validDay(s.day)||s.day>today||s.day<'2020-01-01')throw Error('Перевірте дату продажу');
  if(!Number.isSafeInteger(s.amount)||s.amount<=0||s.amount>100000000||!Number.isInteger(s.quantity)||s.quantity<1||s.quantity>100000)throw Error('Перевірте суму та кількість');
  if(!Number.isSafeInteger(s.refund)||s.refund<0||s.refund>s.amount)throw Error('Повернення не може перевищувати суму продажу');
  if(s.refund>0&&(!validDay(s.refundDay)||s.refundDay<s.day||s.refundDay>today))throw Error('Перевірте дату повернення');
  if(typeof s.voided!=='boolean')throw Error('Перевірте стан запису');
  return {id:s.id,version:s.version,reference:s.reference.trim(),day:s.day,amount:s.amount,quantity:s.quantity,refund:s.refund,refundDay:s.refund?s.refundDay:null,voided:s.voided};
}
