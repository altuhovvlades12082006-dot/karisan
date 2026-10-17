import {env} from 'cloudflare:workers';
import {db,isAdmin,json,sameOrigin,initializeCatalog,boundedBody} from '../../../../lib/store';
import {credentialsReady,credentialVersion} from '../../../../lib/admin-session';
import {digest,verifyPassword,randomToken,sessionCookie,readToken} from '../../../../lib/password-auth.mjs';
export async function GET(r:Request){try{return json({admin:await isAdmin(r),configured:credentialsReady()});}catch{return json({error:'Сервіс тимчасово недоступний'},503);}}
export async function POST(r:Request){
  if(!sameOrigin(r))return json({error:'Неприпустиме джерело запиту'},403);
  if(!credentialsReady())return json({error:'Вхід ще налаштовується'},503);
  try{
    const now=Date.now(),window=900000;
    const attemptKey=await digest('login:'+r.headers.get('cf-connecting-ip')+':'+Math.floor(now/window));
    const database=db();
    await database.batch([
      database.prepare('DELETE FROM login_attempts WHERE expires_at<?').bind(now),
      database.prepare('DELETE FROM admin_sessions WHERE expires_at<?').bind(now),
    ]);
    const attempt=await database.prepare('INSERT INTO login_attempts (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(attemptKey,(Math.floor(now/window)+1)*window).first<{count:number}>();
    if(!attempt||attempt.count>10)return Response.json({error:'Забагато спроб. Спробуйте через 15 хвилин.'},{status:429,headers:{'Cache-Control':'no-store','Retry-After':'900'}});
    let body:any;try{body=JSON.parse(new TextDecoder().decode(await boundedBody(r,2048)));}catch{return json({error:'Перевірте дані для входу'},400);}
    const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
    const valid=await verifyPassword(body.password,env.ADMIN_PASSWORD_HASH);
    if(!valid||email!==env.ADMIN_LOGIN_EMAIL!.trim().toLowerCase())return json({error:'Неправильна пошта або пароль'},401);
    await initializeCatalog();
    const token=randomToken();
    await database.prepare('INSERT INTO admin_sessions (token_hash,expires_at,credential_version) VALUES (?,?,?)').bind(await digest(token),now+43200000,await credentialVersion()).run();
    return Response.json({ok:true},{headers:{'Cache-Control':'no-store','Set-Cookie':sessionCookie(r.url,token)}});
  }catch{return json({error:'Не вдалося увійти. Спробуйте ще раз.'},503);}
}
export async function DELETE(r:Request){
  if(!sameOrigin(r))return json({error:'Неприпустиме джерело запиту'},403);
  const token=readToken(r);
  if(/^[a-f0-9]{64}$/.test(token))await db().prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await digest(token)).run();
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store','Set-Cookie':sessionCookie(r.url,'',0)}});
}
