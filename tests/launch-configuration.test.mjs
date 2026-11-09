import test from 'node:test';import assert from 'node:assert/strict';
import {launchConfigurationChecks} from '../lib/launch-configuration.mjs';
test('launch config defaults fail closed and never expose secret values',()=>{
 assert.ok(launchConfigurationChecks({}).every(c=>!c.ready));
 const checks=launchConfigurationChecks({NOVA_POSHTA_API_KEY:'private-fixture-value'});
 assert.equal(checks[0].ready,true);assert.equal(checks[1].ready,false);
 assert.ok(!JSON.stringify(checks).includes('private-fixture-value'));
});
test('valid sender and HTTPS origin are configuration checks, not live claims',()=>{
 const checks=launchConfigurationChecks({NOVA_POSHTA_SENDER_CITY_REF:'db5c88ac-391c-11dd-90d9-001a92567626',PUBLIC_SITE_URL:'https://shop.example'});
 assert.equal(checks[1].ready,true);assert.equal(checks[2].ready,true);
 for(const url of ['http://shop.example','https://shop.example/sub','https://u:p@shop.example'])assert.equal(launchConfigurationChecks({PUBLIC_SITE_URL:url})[2].ready,false);
});
