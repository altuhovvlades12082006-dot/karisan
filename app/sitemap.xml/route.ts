import {catalog} from '../../lib/store';
import {sitemapXml} from '../../lib/sitemap.mjs';
import {env} from 'cloudflare:workers';
import {siteOrigin} from '../../lib/storefront-seo.mjs';
export async function GET(r:Request){try{return new Response(sitemapXml(siteOrigin(r.url,env.PUBLIC_SITE_URL),await catalog()),{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public,max-age=300'}});}catch{return new Response('Temporarily unavailable',{status:503,headers:{'Cache-Control':'no-store'}});}}
