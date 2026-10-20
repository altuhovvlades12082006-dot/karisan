import {AsyncLocalStorage} from 'node:async_hooks';
const countryContext=new AsyncLocalStorage<string>();
export function normalizeCountry(value:unknown){return typeof value==='string'&&/^[A-Z]{2}$/.test(value)&&value!=='XX'?value:'ZZ';}
export function runWithCountry<T>(value:unknown,fn:()=>T):T{return countryContext.run(normalizeCountry(value),fn);}
export function requestCountry(){return countryContext.getStore()||'ZZ';}
