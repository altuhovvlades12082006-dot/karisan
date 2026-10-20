import {test} from 'node:test';import assert from 'node:assert/strict';
import {normalizeCountry,runWithCountry,requestCountry} from '../lib/request-country.ts';
import {sitemapXml} from '../lib/sitemap.mjs';
test('unknown country is not invented and concurrent visitors remain separate',async()=>{for(const input of[null,undefined,'UA<script>','XX','T1'])assert.equal(normalizeCountry(input),'ZZ');assert.equal(normalizeCountry('UA'),'UA');assert.equal(requestCountry(),'ZZ');await Promise.all(['UA','CZ'].map(code=>runWithCountry(code,async()=>{await Promise.resolve();assert.equal(requestCountry(),code);})));assert.equal(requestCountry(),'ZZ');});
test('sitemap uses current origin and safely encodes product references',()=>{const xml=sitemapXml('https://shop.example',[{id:'one'},{id:'two&three'}]);assert.equal((xml.match(/<loc>/g)||[]).length,3);assert.ok(xml.includes('https://shop.example/product?id=one'));assert.ok(xml.includes('two%26three'));assert.ok(!xml.includes('/admin'));});
