import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {StoryPlayer} from '../public/story-player.js';

test('loading and failure states keep hero controls hidden without blocking the catalog',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/hero-clean.css',import.meta.url),'utf8');
 assert.match(app,/function mediaState\(state\)\{for\(const id of \['video-loading','video-error','retry-video'\]\).*hidden=true/);
 assert.ok(css.includes('.story #video-loading,.story #video-error,.story #retry-video{display:none!important}'));
 assert.ok(css.includes('.hero-poster{opacity:1;filter:none;transform:none}'));
});
test('headlines and body use small local font files, not external font stylesheets',()=>{
 const style=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
 const fonts=readFileSync(new URL('../public/fonts.css',import.meta.url),'utf8');
 assert.ok(!style.includes('fonts.googleapis.com'));
 assert.ok(fonts.includes("font-family:'Lora'"));assert.ok(fonts.includes("font-family:'Manrope'"));
 let bytes=0;for(const match of fonts.matchAll(/url\('\/([^']+\.woff2)'\)/g)){
  const file=readFileSync(new URL('../public/'+match[1],import.meta.url));
  assert.equal(file.subarray(0,4).toString(),'wOF2');bytes+=file.length;
 }
 assert.ok(bytes>0&&bytes<260*1024);assert.ok(fonts.includes('font-display:swap'));
});
test('idle and waiting players release their animation callback',()=>{
 const originalRaf=globalThis.requestAnimationFrame,originalCancel=globalThis.cancelAnimationFrame;let cancelled=0;
 globalThis.requestAnimationFrame=()=>33;globalThis.cancelAnimationFrame=()=>{cancelled++};
 try{
  const p=Object.assign(Object.create(StoryPlayer.prototype),{raf:33});
  assert.equal(p.sleepIfIdle({paused:true},.02),true);assert.equal(p.raf,undefined);
  assert.equal(p.sleepIfIdle({paused:false},1),false);
  p.ready=true;p.switching=true;p.tick();assert.equal(p.raf,undefined);assert.equal(cancelled,2);
 }finally{globalThis.requestAnimationFrame=originalRaf;globalThis.cancelAnimationFrame=originalCancel}
});
test('mobile playback does not repeatedly seek the hidden video while the visible one plays',()=>{
 let seeks=0;
 const v={readyState:4,duration:25.016667,seeking:false,get currentTime(){return 0},set currentTime(t){seeks++}};
 const p=Object.assign(Object.create(StoryPlayer.prototype),{mobile:true,active:0,direction:1,time:6,videos:[{paused:false},v],loaded:[true,true]});
 p.prepareOpposite();assert.equal(seeks,0);assert.equal(p.warming,undefined);
});
test('failed optional reverse prefetch does not restart a download on each scroll event',async()=>{
 let calls=0;const p=Object.assign(Object.create(StoryPlayer.prototype),{videos:[{},{}],loadVideo:async()=>{calls++;throw Error('offline')}});
 p.preloadReverse();await Promise.resolve();await Promise.resolve();p.preloadReverse();
 assert.equal(calls,1);
});
