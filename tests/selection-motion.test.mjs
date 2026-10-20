import {test} from 'node:test';
import assert from 'node:assert/strict';
import {animateSelection} from '../public/selection-motion.js';
test('selection feedback is bounded and respects reduced motion',()=>{
 const old={document:globalThis.document,matchMedia:globalThis.matchMedia};let calls=[];
 const element={animate(frames,options){calls.push({frames,options})}};
 globalThis.document={querySelectorAll:selector=>selector.includes('#products')?Array(30).fill(element):[element]};
 try{
  globalThis.matchMedia=()=>({matches:true});animateSelection();assert.equal(calls.length,0);
  globalThis.matchMedia=()=>({matches:false});animateSelection();assert.equal(calls.length,9);
  assert.ok(calls.every(c=>c.options.duration<=300));assert.ok(calls.every(c=>c.frames.at(-1).transform==='scale(1)'||c.frames.at(-1).transform==='translateY(0)'));
 }finally{globalThis.document=old.document;globalThis.matchMedia=old.matchMedia}
});
