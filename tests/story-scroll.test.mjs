import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {StoryPlayer} from '../public/story-player.js';
import {FRAME,STORY_END,timeFromProgress,progressFromTime,nextTime} from '../public/story-motion.js';

test('video assets are byte-for-byte unchanged',()=>{
 const expected={forward:'b4e0a8a2a4c86198a603e5623d7875b018940a98ee236c615b6a1ae148d4d5ab',backward:'a5554b3e705694c496d9c2fe74ae29ba65dd1a8c62f6a6eaad6fd6d012f68b08'};
 for(const [direction,hash] of Object.entries(expected))assert.equal(createHash('sha256').update(readFileSync(new URL(`../public/assets/story-${direction}-1080.mp4`,import.meta.url))).digest('hex'),hash);
});
test('the complete timeline is reachable and chapter mapping is reversible',()=>{
 assert.equal(timeFromProgress(1),25);assert.equal(timeFromProgress(-1),0);assert.equal(timeFromProgress(2),STORY_END);
 for(const t of [0,.9,4.65,7.65,11.1,14.65,18.45,21.45,25])assert.ok(Math.abs(timeFromProgress(progressFromTime(t))-t)<1e-10);
});
test('scrubbing settles within one source frame without overshoot in both directions',()=>{
 for(const [start,target] of [[0,25],[25,0],[4,4.1],[4.1,4],[10,10]])for(const hz of [30,60,120]){
  let current=start;
  for(let i=0;i<hz/2;i++){const next=nextTime(current,target,1/hz);assert.ok(next>=Math.min(current,target)&&next<=Math.max(current,target));current=next}
  assert.ok(Math.abs(current-target)<=FRAME);
 }
});
test('one decoder seek at a time; rapid reversal drops obsolete targets and stops idle work',()=>{
 const previous={raf:globalThis.requestAnimationFrame,document:globalThis.document};let scheduled=0;
 globalThis.requestAnimationFrame=()=>++scheduled;globalThis.document={hidden:false};
 try{
  let current=0,writes=[];
  const video={duration:25.016667,get currentTime(){return current},set currentTime(t){writes.push(t);current=t}};
  const p=Object.assign(Object.create(StoryPlayer.prototype),{video,target:0,time:0,ready:true,visible:true,state:'ready',raf:0});
  p.draw=()=>{};p.onState=()=>{};
  p.seek(20);p.tick(16);assert.equal(writes.length,1);assert.ok(p.seeking);
  p.seek(5);p.seek(1);p.tick(32);assert.equal(writes.length,1);
  p.completeSeek();p.tick(48);assert.equal(writes.length,2);assert.ok(writes[1]>=1&&writes[1]<=1.45);assert.ok(writes[1]<writes[0]);
  for(let n=0;n<20&&p.seeking;n++){p.completeSeek();p.tick(64+n*16)}
  assert.ok(Math.abs(current-1)<=FRAME);assert.equal(p.seeking,false);assert.equal(p.raf,0);
  const before=writes.length;p.target=24;p.blocked=true;p.tick(500);assert.equal(writes.length,before);
  p.blocked=false;globalThis.document.hidden=true;p.tick(600);assert.equal(writes.length,before);
 }finally{globalThis.requestAnimationFrame=previous.raf;globalThis.document=previous.document}
});
test('in-flight completion cannot redraw after destruction',()=>{
 let drew=false;const p=Object.assign(Object.create(StoryPlayer.prototype),{dead:true,ready:true,seeking:true,draw(){drew=true}});p.completeSeek();assert.equal(drew,false);
});
test('startup is lazy, shares one load, and never requests the reverse video',async()=>{
 class Video extends EventTarget{loads=0;load(){this.loads++}}
 const video=new Video(),p=Object.assign(Object.create(StoryPlayer.prototype),{video,ctx:{},abort:new AbortController(),visible:false,state:'',onState(){},draw(){},schedule(){}});
 await p.start();assert.equal(video.loads,0);
 p.visible=true;const loading=p.start();await p.start();assert.equal(video.loads,1);
 assert.equal(video.src,'assets/story-forward-1080.mp4');video.dispatchEvent(new Event('loadeddata'));await loading;assert.equal(p.ready,true);assert.equal(p.state,'ready');
});
test('an aborted load does not become ready or paint a stale frame',async()=>{
 class Video extends EventTarget{load(){}}
 let drew=false;const p=Object.assign(Object.create(StoryPlayer.prototype),{video:new Video(),ctx:{},abort:new AbortController(),visible:true,state:'',onState(){},draw(){drew=true},schedule(){}});
 const loading=p.start();p.dead=true;p.abort.abort();await loading;assert.equal(p.ready,undefined);assert.equal(drew,false);
});
