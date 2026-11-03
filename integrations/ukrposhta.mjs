// Server-only address classifier. No token or raw provider errors in responses.
export async function ukrBranches(env,postcode,fetcher=fetch){
  if(!/^\d{5}$/.test(postcode||''))throw Error('invalid_postcode');
  if(!env.UKRPOSHTA_BEARER)throw Error('not_configured');
  let body;
  try{const r=await fetcher('https://www.ukrposhta.ua/address-classifier-ws/get_postoffices_by_postindex?pi='+postcode,{headers:{Authorization:'Bearer '+env.UKRPOSHTA_BEARER,Accept:'application/json'},signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error();body=await r.json();}catch{throw Error('carrier_unavailable');}
  if(!body?.Entries||!Object.hasOwn(body.Entries,'Entry'))throw Error('carrier_unavailable');
  const entry=body.Entries.Entry,rows=Array.isArray(entry)?entry:entry?[entry]:[];
  return rows.filter(b=>String(b.LOCK_CODE)==='0'&&String(b.IS_NODISTRICT)==='0'&&String(b.RESTRICTED_ACCESS||'0')==='0'&&String(b.POSTINDEX)===postcode&&/^\d{1,12}$/.test(String(b.ID))).map(b=>({id:String(b.ID),postcode:String(b.POSTINDEX),city:b.CITY_UA||b.PDCITY_UA||'',label:[b.POSTINDEX,b.PO_SHORT,b.ADDRESS].filter(Boolean).join(' · ')}));
}
export async function verifyUkrSelection(env,delivery,fetcher=fetch){
  if(!/^\d{1,12}$/.test(delivery.branchId||''))throw Error('Оберіть відділення Укрпошти зі списку');
  const match=(await ukrBranches(env,delivery.postcode,fetcher)).find(x=>x.id===delivery.branchId);
  if(!match)throw Error('Відділення Укрпошти змінилося. Оберіть його повторно');
  return {...delivery,city:match.city,branch:match.label,branchId:match.id,postcode:match.postcode,verified:true};
}
