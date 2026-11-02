import {STORY_END,SOURCE_END,playbackRateForGap} from './story-motion.js';
/** Native playback for small movements; coalesced alignment for fast scrolling. */
export class StoryPlayer {
 constructor({videos,onFrame,onState}){Object.assign(this,{videos,onFrame,onState});this.target=0;this.time=0;this.direction=1;this.active=0;this.ready=false;this.dead=false;this.loaded=[false,false];this.abort=new AbortController();this.canvas=document.createElement('canvas');this.canvas.className='story-canvas';this.canvas.setAttribute('aria-hidden','true');videos[0].before(this.canvas);this.ctx=this.canvas.getContext('2d',{alpha:false});this.resize=()=>{this.mobile=matchMedia('(max-width:700px)').matches;const r=this.canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2,1920/r.width,1080/r.height);this.canvas.width=Math.min(1920,Math.round(r.width*d));this.canvas.height=Math.min(1080,Math.round(r.height*d));this.needsDraw=true};addEventListener('resize',this.resize);this.resize();this.tick=this.tick.bind(this);this.videos.forEach(v=>{v.muted=true;v.playsInline=true;v.preload='metadata'});this.state='';this.lastDraw=-1}
 stateTo(state){if(this.state!==state){this.state=state;this.onState(state)}}
 async bufferVideo(i,onProgress){
  const v=this.videos[i],response=await fetch(v.currentSrc||v.src,{signal:this.abort.signal});
  if(!response.ok||!response.body)throw Error('video download');
  const reader=response.body.getReader(),chunks=[];let bytes=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>25*1024*1024)throw Error('video size');chunks.push(value);onProgress()}}finally{reader.releaseLock()}
  if(this.dead)return;
  this.blobUrls??=[];this.blobUrls[i]=URL.createObjectURL(new Blob(chunks,{type:'video/mp4'}));
  v.src=this.blobUrls[i];v.load();
 }
 async loadVideo(i){
  if(this.loaded[i])return;
  this.loading??=[];if(this.loading[i])return this.loading[i];
  const v=this.videos[i];v.preload='auto';
  this.loading[i]=new Promise((resolve,reject)=>{
   let timer,buffering=false;
   const clean=()=>{clearTimeout(timer);for(const event of ['loadeddata','canplay'])v.removeEventListener(event,ready);v.removeEventListener('progress',progress);v.removeEventListener('error',error);this.abort.signal.removeEventListener('abort',cancel)};
   const ready=()=>{if(v.readyState<2)return;
    // A native preload can stop halfway on hosts without usable byte ranges.
    // In that case finish downloading into a local Blob: same bytes, no
    // transcoding, and a fully seekable source for scroll-driven playback.
    if(v.seekable&&(!v.seekable.length||v.seekable.end(v.seekable.length-1)<.01)&&!this.blobUrls?.[i]){if(!buffering){buffering=true;this.bufferVideo(i,progress).catch(error)}return}
    clean();this.loaded[i]=true;resolve()};
   const fail=reason=>{clean();reject(Error(reason))};
   const error=()=>fail('video');const cancel=()=>fail('cancelled');
   // A slow but progressing connection is not a failed video. Late data can
   // also recover an idle timeout without forcing another download.
   const progress=()=>{clearTimeout(timer);timer=setTimeout(()=>{clean();const recover=()=>{if(this.dead||v.readyState<2)return;v.removeEventListener('loadeddata',recover);this.loaded[i]=true;if(i===0&&!this.ready)this.retry()};v.addEventListener('loadeddata',recover,{once:true,signal:this.abort.signal});reject(Error('idle timeout'))},45000)};
   for(const event of ['loadeddata','canplay'])v.addEventListener(event,ready);
   v.addEventListener('progress',progress);v.addEventListener('error',error);this.abort.signal.addEventListener('abort',cancel,{once:true});
   progress();
   if(!v.getAttribute('src')||v.error){v.src='assets/story-'+(i?'backward':'forward')+'-1080.mp4';v.load()}
   ready();
  }).finally(()=>{this.loading[i]=null});
  return this.loading[i];
 }
 wake(){if(this.dead||!this.ready)return;cancelAnimationFrame(this.raf);this.tick()}
 async start(){if(this.starting||this.dead)return;this.starting=true;this.stateTo('loading');try{await this.loadVideo(0);if(this.dead)return;this.ready=true;this.needsDraw=true;this.stateTo('ready');this.wake();this.loadVideo(1).catch(()=>{/* Keep the forward video usable if background preparation fails. */})}catch(e){if(!this.dead)this.stateTo('error')}finally{this.starting=false}}
 seek(t){const target=Math.max(0,Math.min(STORY_END,t));if(target!==this.target)this.settled=false;this.target=target;if(this.ready&&!this.switching)this.wake()}
 alignVideo(time){
  this.switching=true;const v=this.videos[this.active];v.pause();
  const desired=this.direction>0?time:SOURCE_END-time;
  const events=['progress','canplay','canplaythrough','loadeddata'];
  const clean=()=>{clearTimeout(this.seekTimer);events.forEach(event=>v.removeEventListener?.(event,progress));this.seekCleanup=null};
  const complete=()=>{clean();this.switching=false;v.onseeked=null;this.needsDraw=true;this.wake()};
  const available=()=>{if(!v.seekable)return true;for(let i=0;i<v.seekable.length;i++)if(v.seekable.start(i)<=desired&&v.seekable.end(i)>=desired)return true;return false};
  const seek=()=>{if(this.dead||!available())return;events.forEach(event=>v.removeEventListener?.(event,progress));if(Math.abs(v.currentTime-desired)<.008){clean();this.switching=false;v.onseeked=null;this.needsDraw=true;return}v.onseeked=complete;v.currentTime=Math.max(0,Math.min(v.duration-.018,desired))};
  // Some hosts initially expose only a zero-length seekable range. Do not
  // lose the requested frame by seeking before the browser can reach it.
  const progress=()=>{clearTimeout(this.seekTimer);this.seekTimer=setTimeout(()=>{if(!this.dead&&this.switching){clean();this.switching=false;v.onseeked=null;this.stateTo('error')}},45000);seek()};
  this.seekCleanup=clean;events.forEach(event=>v.addEventListener?.(event,progress));progress();
 }
 async switchTo(dir){if(this.switching||this.direction===dir)return;this.switching=true;this.videos[this.active].pause();try{await this.loadVideo(dir>0?0:1);if(this.dead)return;this.direction=dir;this.active=dir>0?0:1;this.alignVideo(this.time)}catch(e){this.switching=false;this.stateTo('error')}}
 tick(){if(this.dead)return;this.raf=requestAnimationFrame(this.tick);if(!this.ready||this.switching||this.state==='error')return;const v=this.videos[this.active];if(document.hidden||document.querySelector('dialog[open]')||this.canvas.getBoundingClientRect().bottom<0){v.pause();return}this.time=Math.max(0,Math.min(STORY_END,this.direction>0?v.currentTime:SOURCE_END-v.currentTime));const gap=this.target-this.time;
  // Stop once per target, including a dropped-frame overshoot. Do not
  // reverse repeatedly around the same target when scrolling has stopped.
  if(!v.paused&&this.playingTarget===this.target&&this.direction*gap<=.035)this.settled=true;
  if(!this.settled&&Math.abs(gap)>.045){const dir=gap>0?1:-1;if(dir!==this.direction){this.switchTo(dir);return}
   // Do not queue seconds of playback after a quick gesture. Only one seek
   // is in flight, then the latest target is used; slow scroll stays native.
   if(Math.abs(gap)>.9){this.alignVideo(this.target-this.direction*.18);return}
   this.playingTarget=this.target;v.playbackRate=playbackRateForGap(gap);if(v.paused&&!this.playPending){this.playPending=true;v.play().catch(e=>{if(!this.dead&&e.name!=='AbortError')this.stateTo('error')}).finally(()=>this.playPending=false)}}else v.pause();
  if(v.readyState!==undefined&&v.readyState<2)return;
  if(Math.abs(this.time-this.lastDraw)<.008&&!this.needsDraw)return;this.needsDraw=false;this.lastDraw=this.time;const w=this.canvas.width,h=this.canvas.height,c=this.ctx;const scale=(this.mobile?Math.max:Math.min)(w/1920,h/1080),dw=1920*scale,dh=1080*scale,x=(w-dw)*(this.mobile?this.focus(this.time):.5),y=(h-dh)/2;c.fillStyle='#17121d';c.fillRect(0,0,w,h);c.drawImage(v,x,y,dw,dh);this.canvas.dataset&&(this.canvas.dataset.drawn='true');this.onFrame(this.time)}
 focus(t){const pts=[[0,.53],[3.8,.53],[5.2,.95],[6.6,.95],[8.2,.65],[10.5,.65],[12,.32],[13.7,.32],[15.3,.57],[18,.57],[20.7,.57],[22.5,.95],[24,.95],[25,.55]];for(let i=1;i<pts.length;i++){if(t<=pts[i][0]){const a=pts[i-1],b=pts[i],q=Math.max(0,(t-a[0])/(b[0]-a[0]));return a[1]+(b[1]-a[1])*q*q*(3-2*q)}}return .55}
 retry(){if(!this.ready){this.start();return}this.stateTo('ready')}
 destroy(){this.dead=true;this.seekCleanup?.();clearTimeout(this.seekTimer);this.abort.abort();cancelAnimationFrame(this.raf);removeEventListener('resize',this.resize);this.videos.forEach(v=>{v.pause();v.onseeked=null;v.onloadeddata=null;v.onerror=null;v.removeAttribute('src');v.load()});this.blobUrls?.forEach(url=>URL.revokeObjectURL(url));this.canvas.remove()}
}
