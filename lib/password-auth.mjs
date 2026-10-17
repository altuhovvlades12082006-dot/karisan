const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
export async function digest(value){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));}
export function randomToken(){return hex(crypto.getRandomValues(new Uint8Array(32)));}
export async function passwordHash(password,salt=crypto.getRandomValues(new Uint8Array(16))){
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},key,256);
  return `pbkdf2-sha256:100000:${hex(salt)}:${hex(bits)}`;
}
export async function verifyPassword(password,stored){
  if(typeof password!=='string'||password.length>256||typeof stored!=='string'||!/^pbkdf2-sha256:100000:[a-f0-9]{32}:[a-f0-9]{64}$/.test(stored))return false;
  const salt=Uint8Array.from(stored.split(':')[2].match(/../g),x=>parseInt(x,16));
  const computed=await passwordHash(password,salt);
  let difference=0;for(let i=0;i<stored.length;i++)difference|=stored.charCodeAt(i)^computed.charCodeAt(i);
  return difference===0;
}
export function cookieName(url){return new URL(url).protocol==='https:'?'__Host-karisan_admin':'karisan_admin_local';}
export function readToken(request){const name=cookieName(request.url);const cookie=request.headers.get('cookie')||'';return cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';}
export function sessionCookie(url,token,maxAge=43200){return `${cookieName(url)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(url).protocol==='https:'?'; Secure':''}`;}
