// Server only: fixed upstream, allowlisted operations, no key or raw errors returned.
export const validRef=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export class DeliveryError extends Error{constructor(code,status=400){super(code);this.status=status;}}
const text=(value,max=100)=>typeof value==='string'?value.trim().slice(0,max):'';
const pageNumber=value=>{const page=Number(value??1);if(!Number.isInteger(page)||page<1||page>500)throw new DeliveryError('invalid_page');return page;};
const branchKind=b=>b.CategoryOfWarehouse==='Postomat'||/поштомат|postomat|parcel locker/i.test(b.Description||'')?'postomat':'branch';
export async function novaCall(env,model,method,properties,fetcher=fetch){
  if(!env.NOVA_POSHTA_API_KEY)throw new DeliveryError('not_configured',503);
  let response,data;
  try{response=await fetcher('https://api.novaposhta.ua/v2.0/json/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:env.NOVA_POSHTA_API_KEY,modelName:model,calledMethod:method,methodProperties:properties}),signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error();data=await response.json();}catch{throw new DeliveryError('carrier_unavailable',502);}
  if(data.success!==true||!Array.isArray(data.data))throw new DeliveryError('carrier_unavailable',502);
  return data.data;
}
export async function novaCities(env,{q,page},fetcher=fetch){
  q=text(q);if(q.length<2)throw new DeliveryError('invalid_query');page=pageNumber(page);
  const data=await novaCall(env,'Address','getCities',{FindByString:q,Page:String(page),Limit:'100'},fetcher);
  return {cities:data.filter(x=>validRef(x.Ref)).map(x=>({id:x.Ref,label:[x.Description,x.AreaDescription].filter(Boolean).join(' · '),name:x.Description||''})),page,hasMore:data.length===100};
}
export async function novaBranches(env,{cityRef,q='',page,type='all'},fetcher=fetch){
  if(!validRef(cityRef)||!['all','branch','postomat'].includes(type))throw new DeliveryError('invalid_selection');page=pageNumber(page);
  const data=await novaCall(env,'Address','getWarehouses',{CityRef:cityRef,FindByString:text(q),Page:String(page),Limit:'200',Language:'UA'},fetcher);
  const branches=data.filter(b=>validRef(b.Ref)&&b.CityRef===cityRef&&(!b.WarehouseStatus||b.WarehouseStatus==='Working')).map(b=>({id:b.Ref,cityRef:b.CityRef,city:b.CityDescription||'',number:String(b.Number||''),label:[b.CityDescription,b.Description].filter(Boolean).join(' · '),type:branchKind(b),typeRef:b.TypeOfWarehouse||''}));
  return {branches:branches.filter(b=>type==='all'||b.type===type),page,hasMore:data.length===200};
}
export async function verifyNovaSelection(env,delivery,fetcher=fetch){
  if(!validRef(delivery.cityRef)||!validRef(delivery.branchRef)||!/^\d{1,8}$/.test(delivery.branchNumber||''))throw new DeliveryError('invalid_selection');
  // Query by displayed branch number, then verify both refs independently.
  const result=await novaBranches(env,{cityRef:delivery.cityRef,q:delivery.branchNumber,type:'all'},fetcher);
  const match=result.branches.find(b=>b.id===delivery.branchRef&&b.number===delivery.branchNumber);
  if(!match||match.type!==delivery.type)throw new DeliveryError('branch_changed',409);
  return {...delivery,city:match.city,branch:match.label,cityRef:match.cityRef,branchRef:match.id,branchNumber:match.number,type:match.type,verified:true};
}
export async function novaQuote(env,body,fetcher=fetch){
  if(!validRef(env.NOVA_POSHTA_SENDER_CITY_REF))throw new DeliveryError('sender_not_configured',503);
  // Explicit estimate inputs, not a browser-authoritative charge or order amount.
  const weight=body?.chargeableWeightKg,cost=body?.declaredAmount;
  if(typeof weight!=='number'||!Number.isFinite(weight)||weight<0.1||weight>1000||!Number.isSafeInteger(cost)||cost<1||cost>100000000)throw new DeliveryError('invalid_quote');
  const selected=await verifyNovaSelection(env,body,fetcher);
  const data=await novaCall(env,'InternetDocument','getDocumentPrice',{CitySender:env.NOVA_POSHTA_SENDER_CITY_REF,CityRecipient:selected.cityRef,ServiceType:'WarehouseWarehouse',CargoType:'Parcel',SeatsAmount:'1',Weight:String(weight),Cost:(cost/100).toFixed(2)},fetcher);
  const value=String(data[0]?.Cost??'');if(!/^\d{1,7}(\.\d{1,2})?$/.test(value))throw new DeliveryError('carrier_unavailable',502);
  const [whole,fraction='']=value.split('.'),amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(amount)||amount<=0)throw new DeliveryError('carrier_unavailable',502);
  return {amount,currency:'UAH',estimate:true,includesCodFee:false,branchRef:selected.branchRef,cityRef:selected.cityRef,quotedAt:new Date().toISOString()};
}
