import {storefrontResponse} from '../../../lib/storefront-response';
import {missingPage} from '../../../lib/storefront-seo.mjs';
export async function GET(request:Request,{params}:{params:Promise<{language:string,path?:string[]}>}){
  const {language,path=[]}=await params;
  if(['ru','en'].includes(language)){
    if(!path.length)return storefrontResponse(request,'home',undefined,language);
    if(path.length===2&&['item','category'].includes(path[0]))return storefrontResponse(request,path[0] as 'item'|'category',path[1],language);
  }
  return new Response(missingPage(),{status:404,headers:{'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':'noindex'}});
}
