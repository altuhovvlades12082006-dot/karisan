// First-party, session-only measurement. Never read checkout fields or personal data.
let queue=[],timer=null,memorySession=null;
const disabled=navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true;
function session(){
  let s=memorySession;try{s=JSON.parse(sessionStorage.getItem('karisan-visit'))||s;}catch{}
  if(!s||Date.now()-s.active>1800000){let source='direct';try{const host=new URL(document.referrer).hostname;if(host&&host!==location.hostname)source=/google|bing|duckduckgo|yahoo/.test(host)?'search':/instagram|facebook|tiktok|t\.co|pinterest|telegram/.test(host)?'social':'other';}catch{}
    s={id:crypto.randomUUID(),source,active:Date.now()};}
  s.active=Date.now();memorySession=s;try{sessionStorage.setItem('karisan-visit',JSON.stringify(s));}catch{}return s;
}
function flush(){clearTimeout(timer);timer=null;if(!queue.length)return;const events=queue.splice(0,10),body=JSON.stringify({events});
  fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
}
export function track(type,productId){if(disabled)return;try{const s=session();queue.push({id:crypto.randomUUID(),session:s.id,type,productId,source:s.source,device:matchMedia('(max-width: 700px)').matches?'mobile':matchMedia('(max-width: 1100px)').matches?'tablet':'desktop'});if(queue.length>=10)flush();else if(!timer)timer=setTimeout(flush,700);}catch{}}
export function attribution(){if(disabled)return {};try{const s=session();return {session:s.id,source:s.source};}catch{return {};}}
track('page_view');addEventListener('hashchange',()=>track('page_view'));
addEventListener('pagehide',flush);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush();});
