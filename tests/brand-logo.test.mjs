import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('storefront and admin use supplied accessible logo with stable image dimensions',()=>{
  const store=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const admin=readFileSync(new URL('../public/admin.html',import.meta.url),'utf8');
  assert.equal((store.match(/src="\/assets\/kari-san-logo.jpg"/g)||[]).length,2);
  for(const html of [store,admin]){assert.match(html,/brand-logo.css/);assert.match(html,/alt="Kari-San" width="276" height="263"/);}
  const image=readFileSync(new URL('../public/assets/kari-san-logo.jpg',import.meta.url));
  assert.equal(image[0],255);assert.equal(image[1],216);assert.ok(image.length<100000);
});
