import {itemPath,missingPage} from '../../lib/storefront-seo.mjs';
export function GET(request:Request){const url=new URL(request.url),id=url.searchParams.get('id');
  if(!id||!/^[A-Za-z0-9_-]{1,60}$/.test(id))return new Response(missingPage(),{status:404,headers:{'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':'noindex'}});
  return new Response(null,{status:308,headers:{Location:itemPath(id),'Cache-Control':'public,max-age=300'}});
}
