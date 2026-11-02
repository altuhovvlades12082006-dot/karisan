export const escapeXml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
import {categoryNames,itemPath,categoryPath} from './storefront-seo.mjs';
export function sitemapXml(origin,products){const urls=[origin+'/',...Object.keys(categoryNames).map(slug=>origin+categoryPath(slug)),...products.map(p=>origin+itemPath(p.id))];return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(url=>'<url><loc>'+escapeXml(url)+'</loc></url>').join('')+'</urlset>';}
