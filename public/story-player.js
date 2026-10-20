import {STORY_END, FRAME, clamp, nextTime} from './story-motion.js';

/** One unmodified 1080p60 source. Scroll owns time; only one decoder seek at a time. */
export class StoryPlayer {
 constructor({videos,onFrame,onState}) {
  Object.assign(this,{videos,onFrame,onState});this.video=videos[0];this.target=0;this.time=0;
  this.abort=new AbortController();this.state='';this.visible=false;this.blocked=false;this.lastTick=0;
  this.canvas=document.createElement('canvas');this.canvas.className='story-canvas';
  this.canvas.setAttribute('aria-hidden','true');this.video.before(this.canvas);
  this.ctx=this.canvas.getContext('2d',{alpha:false});
  this.tick=this.tick.bind(this);this.resize=this.resize.bind(this);
  const options={signal:this.abort.signal};
  videos.forEach(v=>{v.pause();v.muted=true;v.playsInline=true;v.preload='none'});
  this.video.addEventListener('seeked',()=>this.completeSeek(),options);
  this.video.addEventListener('error',()=>this.fail(),options);
  document.addEventListener('visibilitychange',()=>this.schedule(),options);
  const headerHeight=Math.ceil(document.querySelector('header')?.getBoundingClientRect().height||0);
  this.visibility=new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting&&entries[0].intersectionRatio>.01;if(this.visible&&this.requestedStart&&!this.ready&&this.state!=='error')this.start();this.schedule()},{threshold:[0,.01],rootMargin:`-${headerHeight}px 0px 0px 0px`});
  this.visibility.observe(this.canvas);
  this.modals=new MutationObserver(()=>{this.blocked=!!document.querySelector('dialog[open]');this.schedule()});
  this.modals.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
  this.sizes=new ResizeObserver(this.resize);this.sizes.observe(this.canvas);this.resize();
 }
 stateTo(state){if(!this.dead&&this.state!==state){this.state=state;this.onState(state)}}
 resize(){
  if(this.dead)return;this.mobile=matchMedia('(max-width:700px)').matches;
  const r=this.canvas.getBoundingClientRect();if(!r.width||!r.height)return;
  const d=Math.min(devicePixelRatio||1,2,1920/r.width,1080/r.height);
  const w=Math.max(1,Math.round(r.width*d)),h=Math.max(1,Math.round(r.height*d));
  if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.draw()}
 }
 async start(){
  this.requestedStart=true;if(this.starting||this.dead||!this.visible)return;this.starting=true;this.stateTo('loading');
  try{
   if(!this.ctx)throw Error('canvas');
   await new Promise((resolve,reject)=>{
    const v=this.video;
    const cleanup=()=>{clearTimeout(timer);v.removeEventListener('loadeddata',done);v.removeEventListener('error',fail);this.abort.signal.removeEventListener('abort',fail)};
    const done=()=>{cleanup();resolve()},fail=()=>{cleanup();reject(Error('media'))};
    const timer=setTimeout(fail,30000);v.addEventListener('loadeddata',done,{once:true});v.addEventListener('error',fail,{once:true});
    this.abort.signal.addEventListener('abort',fail,{once:true});
    v.preload='auto';v.src='assets/story-forward-1080.mp4';v.load();
   });
   if(this.dead)return;this.ready=true;this.stateTo('ready');this.draw();this.schedule();
  }catch{this.fail()}finally{this.starting=false}
 }
 limit(){return Math.max(0,Math.min(STORY_END,(this.video.duration||STORY_END)-FRAME))}
 seek(time){this.target=clamp(Number.isFinite(time)?time:0,0,STORY_END);this.schedule()}
 schedule(){if(!this.dead&&this.ready&&!this.raf&&this.state!=='error')this.raf=requestAnimationFrame(this.tick)}
 tick(now){
  this.raf=0;if(this.dead||!this.ready||this.state==='error')return;
  const dt=this.lastTick?(now-this.lastTick)/1000:1/60;this.lastTick=now;
  if(document.hidden||this.blocked||!this.visible||this.seeking)return;
  const target=Math.min(this.target,this.limit()),current=this.video.currentTime;
  if(Math.abs(target-current)<=FRAME){this.draw();return}
  const next=clamp(nextTime(current,target,dt),0,this.limit());
  this.seeking=true;
  this.seekTimer=setTimeout(()=>{if(!this.dead&&this.seeking)this.fail()},15000);
  try{this.video.currentTime=next}catch{this.fail()}
 }
 completeSeek(){
  if(this.dead||!this.ready||!this.seeking)return;
  clearTimeout(this.seekTimer);this.seeking=false;
  this.stateTo('ready');this.draw();this.schedule();
 }
 draw(){
  const v=this.video;if(this.dead||!this.ctx||v.readyState<2||v.seeking)return;
  const w=this.canvas.width,h=this.canvas.height;
  const scale=(this.mobile?Math.max:Math.min)(w/v.videoWidth,h/v.videoHeight),dw=v.videoWidth*scale,dh=v.videoHeight*scale;
  this.time=clamp(v.currentTime,0,STORY_END);
  this.ctx.fillStyle='#17121d';this.ctx.fillRect(0,0,w,h);
  this.ctx.drawImage(v,(w-dw)*(this.mobile?this.focus(this.time):.5),(h-dh)/2,dw,dh);
  this.onFrame(this.time);
 }
 focus(t){const pts=[[0,.53],[3.8,.53],[5.2,.95],[6.6,.95],[8.2,.65],[10.5,.65],[12,.32],[13.7,.32],[15.3,.57],[18,.57],[20.7,.57],[22.5,.95],[24,.95],[25,.55]];for(let i=1;i<pts.length;i++){if(t<=pts[i][0]){const a=pts[i-1],b=pts[i],q=clamp((t-a[0])/(b[0]-a[0]),0,1);return a[1]+(b[1]-a[1])*q*q*(3-2*q)}}return .55}
 fail(){clearTimeout(this.seekTimer);this.seeking=false;this.stateTo('error')}
 destroy(){
  this.dead=true;this.abort.abort();clearTimeout(this.seekTimer);cancelAnimationFrame(this.raf);
  this.visibility.disconnect();this.modals.disconnect();this.sizes.disconnect();
  this.videos.forEach(v=>{v.pause();v.removeAttribute('src');v.load()});this.canvas.remove();
 }
}
