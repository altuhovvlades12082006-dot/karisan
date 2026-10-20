/** Keep the supplied 1920×1080 / 60fps files; render decoded frames, not duplicates. */
export class StoryPlayer {
 constructor({videos,onFrame,onState}){
  Object.assign(this,{videos,onFrame,onState});this.target=0;this.time=0;this.direction=1;this.active=0;
  this.loaded=[false,false];this.loads=[];this.frames=[];this.visible=true;this.state='';this.rate=1;
  this.abort=new AbortController();this.canvas=document.createElement('canvas');this.canvas.className='story-canvas';
  this.canvas.setAttribute('aria-hidden','true');videos[0].before(this.canvas);this.ctx=this.canvas.getContext('2d',{alpha:false});
  this.resize=()=>{this.mobile=matchMedia('(max-width:700px)').matches;const r=this.canvas.getBoundingClientRect();if(!r.width||!r.height)return;
   const d=Math.min(devicePixelRatio||1,2,1920/r.width,1080/r.height),w=Math.max(1,Math.round(r.width*d)),h=Math.max(1,Math.round(r.height*d));
   if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h}if(this.ready)this.draw();
  };addEventListener('resize',this.resize,{signal:this.abort.signal});this.resize();
  this.sizeObserver=new ResizeObserver(this.resize);this.sizeObserver.observe(this.canvas);
  // Cache visibility and modal state: no forced layout or DOM queries per frame.
  this.observer=new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;if(!this.visible)this.pause()});this.observer.observe(this.canvas);
  this.dialogObserver=new MutationObserver(()=>{this.blocked=!!document.querySelector('dialog[open]');if(this.blocked)this.pause()});
  this.dialogObserver.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause()},{signal:this.abort.signal});
  videos.forEach(v=>{v.muted=true;v.playsInline=true;v.preload='none'});this.tick=this.tick.bind(this);
 }
 pause(){this.videos.forEach(v=>v.pause())}
 stateTo(state){if(!this.dead&&this.state!==state){this.state=state;this.onState(state)}}
 loadVideo(i){
  if(this.loaded[i])return Promise.resolve();if(this.loads[i])return this.loads[i];const v=this.videos[i];v.preload='auto';
  const promise=new Promise((resolve,reject)=>{
   const cleanup=()=>{clearTimeout(timer);v.removeEventListener('loadeddata',done);v.removeEventListener('error',fail);this.abort.signal.removeEventListener('abort',cancel)};
   const done=()=>{cleanup();this.loaded[i]=true;resolve()},fail=()=>{cleanup();reject(Error('video'))},cancel=()=>{cleanup();reject(Error('cancelled'))};
   const timer=setTimeout(fail,30000);v.addEventListener('loadeddata',done,{once:true});v.addEventListener('error',fail,{once:true});
   this.abort.signal.addEventListener('abort',cancel,{once:true});v.src='assets/story-'+(i?'backward':'forward')+'-1080.mp4';v.load();
  });this.loads[i]=promise.catch(e=>{this.loads[i]=null;throw e});return this.loads[i];
 }
 async start(){
  if(this.starting||this.dead)return;this.starting=true;this.stateTo('loading');
  try{if(!this.ctx)throw Error('canvas');await this.loadVideo(0);if(this.dead)return;
   this.ready=true;this.stateTo('ready');this.draw();this.watchFrames(0);this.watchFrames(1);this.raf=requestAnimationFrame(this.tick);
  }catch{this.stateTo('error')}finally{this.starting=false}
 }
 seek(t){this.target=Math.max(0,Math.min(25,t))}
 watchFrames(i){const v=this.videos[i];if(!v.requestVideoFrameCallback)return;
  const frame=()=>{if(this.dead)return;if(i===this.active&&!this.switching)this.draw();this.frames[i]=v.requestVideoFrameCallback(frame)};
  this.frames[i]=v.requestVideoFrameCallback(frame);
 }
 async switchTo(dir){
  if(this.switching||this.direction===dir||this.dead)return;this.switching=true;this.pause();
  try{const i=dir>0?0:1;if(!this.loaded[i])this.stateTo('loading');await this.loadVideo(i);if(this.dead)return;
   const v=this.videos[i],desired=Math.max(0,Math.min(v.duration-1/60,dir>0?this.time:25-this.time));
   if(Math.abs(v.currentTime-desired)>1/60)await new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);v.removeEventListener('seeked',done);this.abort.signal.removeEventListener('abort',fail)};
    const done=()=>{cleanup();resolve()},fail=()=>{cleanup();reject(Error('seek'))},timer=setTimeout(fail,15000);
    v.addEventListener('seeked',done,{once:true});this.abort.signal.addEventListener('abort',fail,{once:true});v.currentTime=desired;
   });if(this.dead)return;this.active=i;this.direction=dir;this.rate=.55;v.playbackRate=this.rate;this.stateTo('ready');
  }catch{this.stateTo('error')}finally{this.switching=false;if(!this.dead&&this.state!=='error')this.draw()}
 }
 tick(now){
  if(this.dead)return;this.raf=requestAnimationFrame(this.tick);const dt=Math.min(.05,Math.max(0,(now-(this.lastTick||now))/1000));this.lastTick=now;
  if(!this.ready||this.switching||this.state==='error')return;const v=this.videos[this.active];
  if(document.hidden||this.blocked||!this.visible){v.pause();return}
  this.time=Math.max(0,Math.min(25,this.direction>0?v.currentTime:25-v.currentTime));const gap=this.target-this.time,distance=Math.abs(gap);
  // A dead band avoids repeated direction flips when scrolling stops. Never accelerate past native 60fps.
  if(distance>.08){const dir=gap>0?1:-1;if(dir!==this.direction){this.switchTo(dir);return}
   const desired=Math.max(.5,Math.min(1,distance*1.5));this.rate+=(desired-this.rate)*(1-Math.exp(-dt*7));
   if(Math.abs(v.playbackRate-this.rate)>.025)v.playbackRate=this.rate;
   if(v.paused&&!this.playPending){this.playPending=true;v.play().catch(e=>{if(e.name!=='AbortError')this.stateTo('error')}).finally(()=>this.playPending=false)}
  }else v.pause();
  // Reverse starts only after the forward download is complete and playback has begun.
  if(this.active===0&&this.time>.5&&!this.loads[1]&&!this.loaded[1]&&!this.warmAttempted&&!navigator.connection?.saveData&&v.buffered.length&&v.buffered.end(v.buffered.length-1)>=v.duration-.1){
   this.warmAttempted=true;this.loadVideo(1).catch(()=>{});
  }
  if(!v.requestVideoFrameCallback&&this.lastDraw!==v.currentTime)this.draw();
 }
 draw(){const v=this.videos[this.active];if(this.dead||!this.ctx||v.readyState<2||v.seeking)return;
  this.time=Math.max(0,Math.min(25,this.direction>0?v.currentTime:25-v.currentTime));this.lastDraw=v.currentTime;
  const w=this.canvas.width,h=this.canvas.height,c=this.ctx,scale=(this.mobile?Math.max:Math.min)(w/v.videoWidth,h/v.videoHeight),dw=v.videoWidth*scale,dh=v.videoHeight*scale;
  c.fillStyle='#17121d';c.fillRect(0,0,w,h);c.drawImage(v,(w-dw)*(this.mobile?this.focus(this.time):.5),(h-dh)/2,dw,dh);this.onFrame(this.time);
 }
 focus(t){const pts=[[0,.53],[3.8,.53],[5.2,.95],[6.6,.95],[8.2,.65],[10.5,.65],[12,.32],[13.7,.32],[15.3,.57],[18,.57],[20.7,.57],[22.5,.95],[24,.95],[25,.55]];for(let i=1;i<pts.length;i++){if(t<=pts[i][0]){const a=pts[i-1],b=pts[i],q=Math.max(0,(t-a[0])/(b[0]-a[0]));return a[1]+(b[1]-a[1])*q*q*(3-2*q)}}return .55}
 retry(){if(!this.ready){this.start();return}this.stateTo('ready')}
 destroy(){this.dead=true;this.abort.abort();cancelAnimationFrame(this.raf);this.observer.disconnect();this.dialogObserver.disconnect();this.sizeObserver.disconnect();
  this.videos.forEach((v,i)=>{if(this.frames[i]!=null)v.cancelVideoFrameCallback?.(this.frames[i]);v.pause();v.removeAttribute('src');v.load()});this.canvas.remove();
 }
}
