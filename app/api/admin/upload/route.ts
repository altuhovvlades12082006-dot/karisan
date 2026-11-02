import {env} from 'cloudflare:workers';
import {guard,json,boundedBody} from '../../../../lib/store';
import {imageExtension} from '../../../../lib/catalog-validation.mjs';
import {usesSupabase,supabaseClient} from '../../../../lib/supabase-catalog.mjs';
export async function POST(r:Request){const denied=await guard(r,true);if(denied)return denied;
  if(!usesSupabase(env)&&!env.BUCKET)return json({error:'Сховище недоступне'},503);
  let bytes:Uint8Array,ext:string;try{bytes=await boundedBody(r,5*1024*1024);ext=imageExtension(bytes,r.headers.get('content-type'));}catch(e){return json({error:(e as Error).message},400);}
  const key=crypto.randomUUID()+'.'+ext;
  if(usesSupabase(env)){try{await supabaseClient(env)('/storage/v1/object/product-images/'+key,{method:'POST',headers:{'Content-Type':r.headers.get('content-type')!,'x-upsert':'false'},body:bytes});return json({image:'/media/'+key});}catch{return json({error:'Не вдалося завантажити фото в Supabase'},503);}}
  await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:r.headers.get('content-type')!}});
  return json({image:'/media/'+key});
}
