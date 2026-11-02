import {env} from 'cloudflare:workers';
import template from '../public/index.html?raw';
import {catalog} from './store';
import {categoryNames,renderStorefront,siteOrigin,missingPage} from './storefront-seo.mjs';
export async function storefrontResponse(request:Request,kind:'home'|'item'|'category',id?:string){
  try{
    const products=await catalog();
    const product=kind==='item'?products.find((p:any)=>p.id===id):undefined;
    if(kind==='item'&&!product||kind==='category'&&!Object.hasOwn(categoryNames,id||''))return new Response(missingPage(),{status:404,headers:{'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':'noindex'}});
    const origin=siteOrigin(request.url,env.PUBLIC_SITE_URL);
    return new Response(renderStorefront(template,{origin,products,product,category:kind==='category'?id:undefined}),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }catch{return new Response('Каталог тимчасово недоступний',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});}
}
