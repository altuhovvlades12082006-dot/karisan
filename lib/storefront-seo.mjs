// Ukrainian-first server rendering, reusing the existing storefront template.
import {languages,languagePath,categoryTranslations,languageCopy,localizedProduct} from './storefront-languages.mjs';
import {text,scenes} from '../public/storefront-copy.js';
export const categoryNames={children:'Дитяче',bedding:'Постільна білизна',gold:'Бязь Голд люкс',stripe:'Страйп сатин',satin:'Сатин',washed:'Варена бавовна',flannel:'Байка','linen-new':'Інші новинки білизни',towels:'Рушники',protectors:'Наматрацники',duvets:'Ковдри',new:'Новинки',curiosities:'Цікавинки',covers:'Покривала',pillows:'Подушки'};
const bedding=['gold','stripe','satin','washed','flannel','linen-new'];
export const htmlEscape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const itemPath=id=>'/item/'+encodeURIComponent(id);
export const categoryPath=slug=>'/category/'+encodeURIComponent(slug);
export function inCategory(p,slug){return slug==='children'?p.children:slug==='new'?p.new:slug==='bedding'?bedding.includes(p.category):slug==='linen-new'?bedding.includes(p.category)&&p.new:p.category===slug;}
const money=n=>new Intl.NumberFormat('uk-UA',{style:'currency',currency:'UAH'}).format(n);
const jsonScript=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const assetUrl=(image,origin)=>{
  const url=new URL(image,origin+'/');
  // Preserve absolute Supabase Storage URLs; never emit executable URL schemes.
  return ['https:','http:'].includes(url.protocol)?url.href:new URL('/assets/poster-desktop.webp',origin).href;
};
export function siteOrigin(requestUrl,configured){
  const url=new URL(configured||requestUrl);
  if(configured&&(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash))throw Error('Invalid PUBLIC_SITE_URL');
  return url.origin;
}
export function renderStorefront(template,{origin,product,category,products=[],lang='uk'}){
  if(!languages.includes(lang))throw Error('Unsupported language');
  const c=languageCopy[lang],names=lang==='uk'?categoryNames:Object.fromEntries(Object.keys(categoryNames).map((key,i)=>[key,categoryTranslations[lang][i]]));
  const money=n=>new Intl.NumberFormat({uk:'uk-UA',ru:'ru-UA',en:'en-GB'}[lang],{style:'currency',currency:'UAH'}).format(n);
  product=product?localizedProduct(product,lang):undefined;products=products.map(p=>localizedProduct(p,lang));
  const title=product?product.uk+' — Kari-San':category?names[category]+' — Kari-San':'Kari-San — '+c.title;
  const description=product?(product.material?.uk||product.uk+'. '+c.choose).slice(0,180):category?names[category]+'. '+c.textiles:c.description;
  const path=product?itemPath(product.id):category?categoryPath(category):'/';
  const canonical=origin+languagePath(path,lang);
  const image=assetUrl(product?.image||'assets/poster-desktop.webp',origin);
  let html=template.replace(/<title>[\s\S]*?<\/title>/,`<title>${htmlEscape(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/,`<meta name="description" content="${htmlEscape(description)}">`)
    .replace('<head>','<head><base href="/">')
    .replace('</head>',`<link rel="canonical" href="${htmlEscape(canonical)}"><meta property="og:type" content="${product?'product':'website'}"><meta property="og:title" content="${htmlEscape(title)}"><meta property="og:description" content="${htmlEscape(description)}"><meta property="og:url" content="${htmlEscape(canonical)}"><meta property="og:image" content="${htmlEscape(image)}"><meta property="og:locale" content="uk_UA"><link rel="stylesheet" href="/seo-pages.css"></head>`);
  const nav='<nav id="collection-categories" aria-label="Категорії">'+Object.entries(names).map(([slug,label])=>`<a class="collection-tile" href="${categoryPath(slug)}">${htmlEscape(label)}</a>`).join('')+'</nav>';
  html=html.replace('<div id="products" class="products"></div>','<div id="products" class="products">'+products.filter(p=>!category||inCategory(p,category)).map(p=>`<article class="product"><a href="${itemPath(p.id)}"><div class="product-image"><img src="${htmlEscape(assetUrl(p.image,origin))}" alt="${htmlEscape(p.uk)}" width="800" height="800" loading="lazy"></div><h4>${htmlEscape(p.uk)}</h4><span class="price">${p.price===null?'Ціну уточнюйте':money(p.price)}</span></a></article>`).join('')+'</div>');
  html=html.replace('<nav id="collection-categories" aria-label="Категорії"></nav>',nav);
  const breadcrumbs=[{name:c.home,item:origin+languagePath('/',lang)}];
  if(product||category){const slug=product?.category||category;breadcrumbs.push({name:names[slug]||slug,item:origin+languagePath(categoryPath(slug),lang)});}
  if(category){html=html.replace('<body','<body data-category="'+htmlEscape(category)+'"').replace('<main>','<main class="seo-category-page">').replace('<h3 id="category-title"></h3>',`<h1 id="category-title">${htmlEscape(names[category])}</h1>`);}
  const graph=[];
  if(product){
    breadcrumbs.push({name:product.uk,item:canonical});
    const variants=product.variants.filter(v=>typeof v.price==='number'&&Number.isFinite(v.price)&&v.price>0);
    const offers=variants.map(v=>({'@type':'Offer',sku:v.sku||v.id,price:v.price.toFixed(2),priceCurrency:'UAH',availability:'https://schema.org/'+(v.stock>0?'InStock':'OutOfStock'),url:canonical}));
    graph.push({'@type':'Product',name:product.uk,image:[image],description,sku:product.id,url:canonical,...(offers.length?{offers}:{})});
    const content=`<section id="product-dialog" aria-labelledby="product-title"><a class="close-product" href="${categoryPath(product.category)}" aria-label="${c.catalog}">←</a><div id="product-detail"><div class="detail-photo"><img src="${htmlEscape(image)}" alt="${htmlEscape(product.uk)}" width="800" height="800"></div><div class="detail-info"><p class="eyebrow">${htmlEscape(names[product.category])}</p><h1 id="product-title">${htmlEscape(product.uk)}</h1><p>${htmlEscape(product.material?.uk||'')}</p><ul>${product.variants.map(v=>`<li>${htmlEscape(v.uk)} · ${v.price===null?c.price:money(v.price)} · ${v.stock>0?c.available:c.unavailable}</li>`).join('')}</ul><noscript>${c.noscript}</noscript></div></div></section>`;
    html=html.replace('<body>','<body class="product-page">');
    html=html.replace(/<dialog id="product-dialog">[\s\S]*?<\/dialog>/,'').replace('<main>',content+'<main>');
  }
  if(breadcrumbs.length>1)graph.push({'@type':'BreadcrumbList',itemListElement:breadcrumbs.map((x,i)=>({'@type':'ListItem',position:i+1,...x}))});
  if(graph.length)html=html.replace('</head>',`<script type="application/ld+json">${jsonScript({'@context':'https://schema.org','@graph':graph})}</script></head>`);
  html=html.replace('<html lang="uk"','<html lang="'+lang+'"').replace('content="uk_UA"','content="'+({uk:'uk_UA',ru:'ru_UA',en:'en_GB'}[lang])+'"');
  html=html.replace('</head>',languages.map(l=>`<link rel="alternate" hreflang="${l}" href="${htmlEscape(origin+languagePath(path,l))}">`).join('')+`<link rel="alternate" hreflang="x-default" href="${htmlEscape(origin+path)}"></head>`);
  html=html.replace(/href="(\/(?:item|category)\/[^"#]+)"/g,(_,url)=>`href="${languagePath(url,lang)}"`);
  html=html.replace(/(<([a-z0-9]+)\b[^>]*\bdata-t="([^"]+)"[^>]*>)[\s\S]*?(<\/\2>)/g,(all,start,tag,key,end)=>text[lang][key]===undefined?all:start+text[lang][key]+end);
  for(const [id,value] of [['scene-kicker',scenes[0][lang][0]],['scene-title',scenes[0][lang][1]],['scene-description',scenes[0][lang][2]],['current-language',lang==='uk'?'UA':lang.toUpperCase()]]){
    html=html.replace(new RegExp('(<([a-z0-9]+)\\b[^>]*id="'+id+'"[^>]*>)[\\s\\S]*?(<\\/\\2>)'),(_,start,tag,end)=>start+value+end);
  }
  html=html.replace(/aria-pressed="(?:true|false)"(?=>)/g,'aria-pressed="false"').replace(`data-lang="${lang}" aria-pressed="false"`,`data-lang="${lang}" aria-pressed="true"`);
  if(lang!=='uk')html=html.replace(/href="#/g,`href="/${lang}/#`);
  return html;
}
export function missingPage(){return '<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Сторінку не знайдено — Kari-San</title><body><main><h1>Сторінку не знайдено</h1><p>Цей товар або розділ недоступний.</p><a href="/">Повернутися до Kari-San</a></main></body></html>';}
