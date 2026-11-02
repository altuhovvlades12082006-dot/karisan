import {env} from 'cloudflare:workers';
import {siteOrigin} from '../../lib/storefront-seo.mjs';
export function GET(r:Request){try{const origin=siteOrigin(r.url,env.PUBLIC_SITE_URL);return new Response(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public,max-age=300'}});}catch{return new Response('Configuration unavailable',{status:503,headers:{'Cache-Control':'no-store'}});}}
