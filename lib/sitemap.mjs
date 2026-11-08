export const escapeXml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
import {categoryNames,itemPath,categoryPath} from './storefront-seo.mjs';
import {languages,languagePath} from './storefront-languages.mjs';
export function sitemapXml(origin,products){const paths=['/',...Object.keys(categoryNames).map(categoryPath),...products.map(p=>itemPath(p.id))];const urls=languages.flatMap(lang=>paths.map(path=>origin+languagePath(path,lang)));return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(url=>'<url><loc>'+escapeXml(url)+'</loc></url>').join('')+'</urlset>';}
