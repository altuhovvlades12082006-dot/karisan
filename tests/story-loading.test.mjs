import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StoryPlayer} from '../public/story-player.js';

class Video extends EventTarget {
 readyState=0;loads=0;src='';error=null;
 getAttribute(){return this.src}
 load(){this.loads++}
}
function player(){return Object.assign(Object.create(StoryPlayer.prototype),{videos:[new Video(),new Video()],loaded:[false,false],abort:new AbortController()})}
test('concurrent forward/reverse preparation shares requests and accepts decoded cached data',async()=>{
 const p=player();const first=p.loadVideo(1),second=p.loadVideo(1);
 assert.equal(p.videos[1].loads,1);
 p.videos[1].readyState=2;p.videos[1].dispatchEvent(new Event('loadeddata'));
 await Promise.all([first,second]);assert.equal(p.loaded[1],true);
 await p.loadVideo(1);assert.equal(p.videos[1].loads,1);
 const cached=player();cached.videos[0].src='existing.mp4';cached.videos[0].readyState=4;
 await cached.loadVideo(0);assert.equal(cached.videos[0].loads,0);
});
test('destroy cancellation rejects pending work and clears it',async()=>{
 const p=player();const load=p.loadVideo(0);p.abort.abort();
 await assert.rejects(load,/cancelled/);assert.equal(p.loading[0],null);
});
test('slow but progressing downloads are not rejected at a fixed 20 second deadline',async()=>{
 const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
 let timers=new Map(),id=0;
 globalThis.setTimeout=(fn,ms)=>{timers.set(++id,{fn,ms});return id};
 globalThis.clearTimeout=id=>timers.delete(id);
 try{const p=player(),pending=p.loadVideo(0);
  assert.equal([...timers.values()][0].ms,45000);
  p.videos[0].dispatchEvent(new Event('progress'));assert.equal(timers.size,1);
  p.videos[0].readyState=2;p.videos[0].dispatchEvent(new Event('loadeddata'));
  await pending;assert.equal(timers.size,0);
 }finally{globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear}
});
test('overshoot settles without reverse chatter, but a new scroll target can reverse',()=>{
 const originalRaf=globalThis.requestAnimationFrame,originalDocument=globalThis.document;
 globalThis.requestAnimationFrame=()=>1;globalThis.document={hidden:false,querySelector(){return null}};
 try{let switches=0;const v={currentTime:1.1,paused:false,readyState:4,pause(){this.paused=true}};
  const p=Object.assign(Object.create(StoryPlayer.prototype),{ready:true,videos:[v],active:0,direction:1,target:1,playingTarget:1,lastDraw:1.1,canvas:{getBoundingClientRect(){return{bottom:700}}},switchTo(){switches++}});
  p.tick();assert.equal(v.paused,true);assert.equal(p.settled,true);assert.equal(switches,0);
  p.seek(.2);p.tick();assert.equal(switches,1);
 }finally{globalThis.requestAnimationFrame=originalRaf;globalThis.document=originalDocument}
});
