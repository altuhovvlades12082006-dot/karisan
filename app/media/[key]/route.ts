import {env} from 'cloudflare:workers';
import {usesSupabase,supabaseClient} from '../../../lib/supabase-catalog.mjs';
export async function GET(r:Request,{params}: {params:Promise<{key:string}>}){
  const {key}=await params;if(!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(key))return new Response('Not found',{status:404});
  if(usesSupabase(env)){try{const object=await supabaseClient(env)('/storage/v1/object/product-images/'+key);return new Response(object.body,{headers:{'Content-Type':object.headers.get('content-type')||'application/octet-stream','Cache-Control':'public,max-age=31536000,immutable','X-Content-Type-Options':'nosniff'}});}catch{return new Response('Not found',{status:404});}}
  const object=await env.BUCKET?.get(key);if(!object)return new Response('Not found',{status:404});
  return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'application/octet-stream','Cache-Control':'public,max-age=31536000,immutable','X-Content-Type-Options':'nosniff'}});
}
