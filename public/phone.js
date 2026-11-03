import {countryCodes} from './phone-countries.js';
export {countryCodes};
const codes=[...new Set(Object.values(countryCodes))].sort((a,b)=>b.length-a.length);
// Format validation, not ownership/SMS verification or per-carrier validation.
export function normalizePhone(value){
  if(typeof value!=='string'||value.length>40||!/^[+\d\s().-]+$/.test(value))throw Error('Перевірте номер телефону з кодом країни');
  let phone=value.trim().replace(/[\s().-]/g,'');
  if(phone.startsWith('00'))phone='+'+phone.slice(2);
  if(/^0[3-9]\d{8}$/.test(phone))phone='+38'+phone;
  else if(/^380[3-9]\d{8}$/.test(phone))phone='+'+phone;
  if(/^\+3800[3-9]\d{8}$/.test(phone))phone='+380'+phone.slice(5);
  if(!/^\+[1-9]\d{6,14}$/.test(phone)||!codes.some(code=>phone.slice(1).startsWith(code)))throw Error('Перевірте номер телефону з кодом країни');
  if(phone.startsWith('+380')&&!/^\+380[3-9]\d{8}$/.test(phone))throw Error('Перевірте український номер телефону');
  return phone;
}
export function phoneCountries(lang='uk'){
  const names=new Intl.DisplayNames([lang],{type:'region'});
  return Object.entries(countryCodes).map(([id,code])=>({id,code,name:names.of(id)||id}))
    .sort((a,b)=>a.id==='UA'?-1:b.id==='UA'?1:a.name.localeCompare(b.name,lang));
}
