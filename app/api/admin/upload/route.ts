import {env} from 'cloudflare:workers';
import {guard,json,boundedBody} from '../../../../lib/store';
import {imageExtension} from '../../../../lib/catalog-validation.mjs';
export async function POST(r:Request){const denied=await guard(r,true);if(denied)return denied;
  if(!env.BUCKET)return json({error:'Сховище недоступне'},503);
  let bytes:Uint8Array,ext:string;try{bytes=await boundedBody(r,5*1024*1024);ext=imageExtension(bytes,r.headers.get('content-type'));}catch(e){return json({error:(e as Error).message},400);}
  const key=crypto.randomUUID()+'.'+ext;
  await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:r.headers.get('content-type')!}});
  return json({image:'/media/'+key});
}
