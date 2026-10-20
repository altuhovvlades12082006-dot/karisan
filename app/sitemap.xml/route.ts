import {catalog} from '../../lib/store';
import {sitemapXml} from '../../lib/sitemap.mjs';
export async function GET(r:Request){try{return new Response(sitemapXml(new URL(r.url).origin,await catalog()),{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public,max-age=3600'}});}catch{return new Response('Temporarily unavailable',{status:503,headers:{'Cache-Control':'no-store'}});}}
