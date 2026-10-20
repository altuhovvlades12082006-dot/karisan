import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {StoryPlayer} from '../public/story-player.js';

test('both shipped videos are 1080p60 with progressive fast-start metadata',()=>{
 for(const direction of ['forward','backward']){
  const b=fs.readFileSync(new URL(`../public/assets/story-${direction}-1080.mp4`,import.meta.url));
  const atoms=(start,end)=>{const result=[];while(start+8<=end){const size=b.readUInt32BE(start),type=b.toString('ascii',start+4,start+8);assert.ok(size>=8&&start+size<=end);result.push({start,size,type});start+=size}return result};
  const root=atoms(0,b.length),all=[];
  const walk=list=>{for(const x of list){all.push(x);if(['moov','trak','mdia','minf','stbl'].includes(x.type))walk(atoms(x.start+8,x.start+x.size))}};walk(root);
  assert.ok(root.findIndex(x=>x.type==='moov')<root.findIndex(x=>x.type==='mdat'));
  const tk=all.find(x=>x.type==='tkhd'),md=all.find(x=>x.type==='mdhd'),st=all.find(x=>x.type==='stts');
  assert.equal(b.readUInt32BE(tk.start+tk.size-8)/65536,1920);assert.equal(b.readUInt32BE(tk.start+tk.size-4)/65536,1080);
  const offset=md.start+8+(b[md.start+8]?20:12),scale=b.readUInt32BE(offset),count=b.readUInt32BE(st.start+12);
  let frames=0,ticks=0;for(let i=0;i<count;i++){const n=b.readUInt32BE(st.start+16+i*8),delta=b.readUInt32BE(st.start+20+i*8);if(delta){frames+=n;ticks+=n*delta}}
  assert.ok(Math.abs(frames*scale/ticks-60)<.1,'frame timing must stay 60fps');
 }
});

test('playback stays at native speed, settles without reversal and ignores interrupted play',async()=>{
 const previous={raf:globalThis.requestAnimationFrame,document:globalThis.document};
 globalThis.requestAnimationFrame=()=>1;globalThis.document={hidden:false};
 try{
  const video={currentTime:1,paused:true,playbackRate:1,buffered:{length:0},pause(){this.paused=true},play(){this.paused=false;return Promise.reject(Object.assign(Error(),{name:'AbortError'}))},requestVideoFrameCallback(){}};
  const p=Object.assign(Object.create(StoryPlayer.prototype),{ready:true,videos:[video],active:0,direction:1,target:10,rate:1,visible:true,loaded:[],loads:[],lastTick:1,state:'ready'});
  let switched=false;p.switchTo=()=>{switched=true};p.onState=()=>{};
  for(let i=1;i<60;i++)p.tick(i*16.67);
  assert.ok(video.playbackRate<=1);await Promise.resolve();await Promise.resolve();assert.equal(p.state,'ready');
  p.target=.96;p.tick(1100);assert.equal(switched,false);assert.equal(video.paused,true);
  p.blocked=true;p.target=20;p.tick(1200);assert.equal(video.paused,true);
 }finally{globalThis.requestAnimationFrame=previous.raf;globalThis.document=previous.document}
});

test('duplicate media loads share one request and a failed load can retry',async()=>{
 class Video extends EventTarget{loads=0;load(){this.loads++}}
 const video=new Video(),p=Object.assign(Object.create(StoryPlayer.prototype),{videos:[video],loaded:[false],loads:[],abort:new AbortController()});
 const first=p.loadVideo(0);assert.equal(p.loadVideo(0),first);assert.equal(video.loads,1);
 video.dispatchEvent(new Event('error'));await assert.rejects(first);assert.equal(p.loads[0],null);
 const retry=p.loadVideo(0);video.dispatchEvent(new Event('loadeddata'));await retry;assert.equal(p.loaded[0],true);assert.equal(video.loads,2);
});
