import {env} from 'cloudflare:workers';
import {digest,readToken} from './password-auth.mjs';
// Shared account explicitly requested by the owner; independent of ChatGPT identity.
export function credentialsReady(){return !!env.ADMIN_LOGIN_EMAIL&&!!env.ADMIN_PASSWORD_HASH;}
export async function credentialVersion(){return digest((env.ADMIN_LOGIN_EMAIL||'').trim().toLowerCase()+':'+(env.ADMIN_PASSWORD_HASH||''));}
export async function adminSession(r:Request){
  if(!credentialsReady()||!env.DB)return false;
  const token=readToken(r);if(!/^[a-f0-9]{64}$/.test(token))return false;
  const row=await env.DB.prepare('SELECT token_hash FROM admin_sessions WHERE token_hash=? AND expires_at>? AND credential_version=?').bind(await digest(token),Date.now(),await credentialVersion()).first();
  return !!row;
}
