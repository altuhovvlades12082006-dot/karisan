// Explicit insert-only import into an EMPTY project. Never overwrites existing data.
import {readFileSync} from 'node:fs';
import {supabaseProducts,saveSupabaseProduct} from '../lib/supabase-catalog.mjs';
import {validateProduct} from '../lib/catalog-validation.mjs';
const resume=process.argv.includes('--resume-missing');
if(!process.argv.includes('--confirm-empty')&&!resume)throw Error('Use --confirm-empty or --resume-missing after reviewing the target project');
const env=Object.fromEntries(readFileSync(new URL('../.dev.vars',import.meta.url),'utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim()];}));
if(env.CATALOG_BACKEND!=='supabase')throw Error('Supabase not selected');
const existing=new Set((await supabaseProducts(env,true)).map(row=>row.product.id));
if(existing.size&&!resume)throw Error('Target is not empty: import refused');
const products=JSON.parse(readFileSync(new URL('../data/catalog-seed.json',import.meta.url),'utf8')).map(validateProduct);
const variants=products.flatMap(p=>p.variants.map(v=>v.id));
if(new Set(variants).size!==variants.length)throw Error('Variant IDs must be globally unique');
let count=0;for(const product of products){if(existing.has(product.id))continue;await saveSupabaseProduct(env,{product,version:0,archived:false});count++;}
console.log(JSON.stringify({imported:count,existingUntouched:existing.size,sourceVariants:variants.length,overwritten:0}));
