import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {StoryPlayer} from '../public/story-player.js';
import {timeFromProgress,progressFromTime} from '../public/story-motion.js';

test('both video files remain byte-for-byte identical',()=>{
 const expected={forward:'b4e0a8a2a4c86198a603e5623d7875b018940a98ee236c615b6a1ae148d4d5ab',backward:'a5554b3e705694c496d9c2fe74ae29ba65dd1a8c62f6a6eaad6fd6d012f68b08'};
 for(const [direction,hash] of Object.entries(expected))assert.equal(createHash('sha256').update(readFileSync(new URL('../public/assets/story-'+direction+'-1080.mp4',import.meta.url))).digest('hex'),hash);
});
test('complete timeline remains reachable',()=>{
 assert.equal(timeFromProgress(1),25);
 for(const t of [0,.9,4.65,7.65,11.1,14.65,18.45,21.45,25])assert.ok(Math.abs(timeFromProgress(progressFromTime(t))-t)<1e-10);
});
test('ordinary scroll plays continuous video rather than seeking to the target',async()=>{
 const old={raf:globalThis.requestAnimationFrame,document:globalThis.document};
 globalThis.requestAnimationFrame=()=>1;globalThis.document={hidden:false,querySelector(){return null}};
 try{
  let current=1,seeks=0,plays=0;
  const v={paused:true,playbackRate:1,get currentTime(){return current},set currentTime(t){seeks++;current=t},pause(){this.paused=true},play(){plays++;this.paused=false;return Promise.resolve()}};
  const p=Object.assign(Object.create(StoryPlayer.prototype),{ready:true,videos:[v],active:0,direction:1,target:20,canvas:{width:1920,height:1080,getBoundingClientRect(){return {bottom:720}}},ctx:{fillRect(){},drawImage(){}},onFrame(){},lastDraw:-1});
  p.tick();await Promise.resolve();assert.equal(plays,1);assert.equal(seeks,0);assert.equal(v.playbackRate,2);
  p.target=1;p.tick();assert.equal(v.paused,true);assert.equal(seeks,0);
  globalThis.document.hidden=true;p.target=10;p.tick();assert.equal(v.paused,true);
 }finally{globalThis.requestAnimationFrame=old.raf;globalThis.document=old.document}
});
test('reverse is aligned to the current frame and waits for decoding before resuming',async()=>{
 const videos=[{pause(){}},{duration:25.016667,currentTime:0,pause(){}}];
 const p=Object.assign(Object.create(StoryPlayer.prototype),{videos,active:0,direction:1,time:6,loadVideo:async()=>{}});
 await p.switchTo(-1);assert.equal(p.active,1);assert.equal(videos[1].currentTime,19);assert.equal(p.switching,true);
 videos[1].onseeked();assert.equal(p.switching,false);
});
test('technical loader, badge and duplicate marker are visually suppressed',()=>{
 const css=readFileSync(new URL('../public/hero-clean.css',import.meta.url),'utf8');
 assert.ok(css.includes('.quality'));assert.ok(css.includes('.scene-marker'));assert.ok(css.includes('#video-loading'));assert.ok(css.includes('display:none!important'));
});
