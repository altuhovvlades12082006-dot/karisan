import {env} from 'cloudflare:workers';
import {db,identity,isAdmin,json,sameOrigin,initializeCatalog} from '../../../../lib/store';
async function eligible(r:Request){
  const email=r.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  return !!identity(r)&&!!env.ADMIN_INVITE_EMAIL&&email===env.ADMIN_INVITE_EMAIL.trim().toLowerCase()&&!await db().prepare("SELECT slot FROM admins WHERE slot='owner'").first();
}
export async function GET(r:Request){try{return json({signedIn:!!identity(r),admin:await isAdmin(r),invited:await eligible(r)});}catch{return json({error:'Сервіс тимчасово недоступний'},503);}}
export async function POST(r:Request){
  if(!sameOrigin(r))return json({error:'Неприпустиме джерело запиту'},403);
  if(await isAdmin(r)){await initializeCatalog();return json({ok:true});}
  if(!await eligible(r))return json({error:'Цей акаунт не запрошений до керування'},403);
  await db().prepare("INSERT OR IGNORE INTO admins (slot,user_id,created_at) VALUES ('owner',?,?)").bind(identity(r),new Date().toISOString()).run();
  if(!await isAdmin(r))return json({error:'Доступ уже закріплений за іншим акаунтом'},403);
  await initializeCatalog();return json({ok:true});
}
