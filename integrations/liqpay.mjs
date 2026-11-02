// Server-only sandbox helper. Mounted routes still forbid real payments.
// v7 uses SHA3-256; legacy v3 uses SHA-1. Never auto-negotiate from callback input.
import {createHash,timingSafeEqual} from 'node:crypto';

function settings(config){
  if(config?.mode!=='sandbox')throw Error('live_payments_not_approved');
  if(!config.publicKey?.startsWith('sandbox_')||!config.privateKey)throw Error('sandbox_keys_required');
  if(![3,7].includes(config.version))throw Error('explicit_api_version_required');
  return config;
}
export function signature(data,privateKey,version){
  if(typeof data!=='string'||typeof privateKey!=='string'||!privateKey||![3,7].includes(version))throw Error('invalid_signing_input');
  return createHash(version===7?'sha3-256':'sha1').update(privateKey+data+privateKey,'utf8').digest('base64');
}
export function amountInKopecks(value){
  const s=String(value);
  if(!/^\d{1,7}(?:\.\d{1,2})?$/.test(s))throw Error('invalid_amount');
  const [whole,fraction='']=s.split('.');
  const amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(amount)||amount<1||amount>100000000)throw Error('invalid_amount');
  return amount;
}
function httpsUrl(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.hash)throw Error('https_required');return u.href;}

// `order` MUST be a server-read, reserved, unpaid order, never a browser quote.
export function createSandboxCheckout(order,config){
  settings(config);
  if(order?.payment!=='card'||order.paymentStatus!=='pending'||order.currency!=='UAH'
    ||!Number.isSafeInteger(order.amount)||order.amount<1||order.amount>100000000
    ||typeof order.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(order.id))throw Error('invalid_order');
  const payload={public_key:config.publicKey,version:config.version,action:'pay',
    amount:(order.amount/100).toFixed(2),currency:'UAH',description:'Kari-San '+order.id,
    order_id:order.id,server_url:httpsUrl(config.webhookUrl),result_url:httpsUrl(config.resultUrl),language:'uk'};
  const data=Buffer.from(JSON.stringify(payload),'utf8').toString('base64');
  return {action:'https://www.liqpay.ua/api/3/checkout',data,signature:signature(data,config.privateKey,config.version)};
}

// Authentication only; caller must also atomically compare persisted amount, currency,
// order ID and payment ID and deduplicate before setting paid. No DB update here.
export function verifySandboxCallback(data,suppliedSignature,config){
  settings(config);
  if(typeof data!=='string'||data.length>24000||data.length%4||! /^[A-Za-z0-9+/]+={0,2}$/.test(data)
     ||typeof suppliedSignature!=='string')throw Error('invalid_callback');
  const expected=Buffer.from(signature(data,config.privateKey,config.version),'base64');
  const actual=Buffer.from(suppliedSignature,'base64');
  if(actual.toString('base64')!==suppliedSignature||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error('invalid_signature');
  let value;try{value=JSON.parse(Buffer.from(data,'base64').toString('utf8'));}catch{throw Error('invalid_callback');}
  if(!value||value.public_key!==config.publicKey||Number(value.version)!==config.version
    ||value.currency!=='UAH'||value.action!=='pay'||typeof value.order_id!=='string'
    ||!/^[A-Za-z0-9_-]{1,100}$/.test(value.order_id)
    ||!['success','sandbox','failure','error','processing','wait_accept','reversed'].includes(value.status)
    ||! /^[0-9]{1,30}$/.test(String(value.payment_id)))throw Error('invalid_callback');
  return {orderId:value.order_id,paymentId:String(value.payment_id),amount:amountInKopecks(value.amount),
    currency:'UAH',status:value.status,sandbox:true};
}
