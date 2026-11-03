// Mount on the same origin under /api/* when enabling server-side commerce.
// Secrets belong in runtime environment variables, never in browser JS.
import {novaCities,novaBranches,DeliveryError} from './nova-poshta.mjs';
import {ukrBranches} from './ukrposhta.mjs';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 if(url.pathname==='/api/commerce')return json({delivery:{nova:!!env.NOVA_POSHTA_API_KEY,ukr:!!env.UKRPOSHTA_BEARER},payments:{cod:false,card:false},orders:false});
 if(url.pathname!=='/api/delivery')return json({error:'not_found'},404);
 const carrier=url.searchParams.get('carrier'),q=(url.searchParams.get('q')||'').trim();
 if(!['nova','ukr'].includes(carrier)||q.length>100)return json({error:'invalid_query'},400);
 if(!(carrier==='nova'?env.NOVA_POSHTA_API_KEY:env.UKRPOSHTA_BEARER))return json({error:'not_configured'},503);
 try{
  if(carrier==='nova'){
   const action=url.searchParams.get('action')||'branches',page=url.searchParams.get('page');
   if(action==='cities')return json(await novaCities(env,{q,page}));
   if(action!=='branches')return json({error:'invalid_action'},400);
   return json(await novaBranches(env,{cityRef:url.searchParams.get('cityRef'),q,page,type:url.searchParams.get('type')||'all'}));
  }
  if(!/^\d{5}$/.test(q))return json({error:'invalid_postcode'},400);
  return json({branches:await ukrBranches(env,q)});
 }catch(error){return json({error:error instanceof DeliveryError?error.message:'carrier_unavailable'},error instanceof DeliveryError?error.status:502)}
}};
