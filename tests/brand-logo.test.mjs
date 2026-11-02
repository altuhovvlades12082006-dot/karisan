import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('storefront and admin use accessible transparent PNG logo with stable image dimensions',()=>{
  const store=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const admin=readFileSync(new URL('../public/admin.html',import.meta.url),'utf8');
  assert.equal((store.match(/src="\/assets\/kari-san-logo-transparent.png"/g)||[]).length,2);
  for(const html of [store,admin]){assert.match(html,/brand-logo.css/);assert.match(html,/alt="Kari-San" width="1285" height="1224"/);}
  const image=readFileSync(new URL('../public/assets/kari-san-logo-transparent.png',import.meta.url));
  assert.equal(image.subarray(1,4).toString(),'PNG');assert.equal(image[25],6);assert.ok(image.length<3000000);
  const css=readFileSync(new URL('../public/brand-logo.css',import.meta.url),'utf8');
  assert.match(css,/background:transparent/);assert.doesNotMatch(css,/background:#fff/);
});
