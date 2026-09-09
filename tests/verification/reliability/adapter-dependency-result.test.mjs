import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHarness} from './adapter-dependency-locale-fixture.mjs';

for (const result of ['[]', 'null', 'Array(2)', '({value:NaN})', 'Object.defineProperty({},"value",{enumerable:true,get(){throw new Error("GETTER_MUST_NOT_RUN");}})']) {
  test(`original registered adapter rejects malformed dependency result ${result}`, async () => {
    const harness = createHarness();
    try {
      const origin = await harness.listen(), directory = harness.fixture('invalid-result', origin);
      const plugin = path.join(directory, 'plugins/consumer');
      const manifestFile = path.join(plugin, 'plugin.json');
      const manifest = JSON.parse(fs.readFileSync(manifestFile));
      manifest.adapters.push({id: 'malformed', module: 'malformed.mjs', export: 'activate', providesCapabilities: ['network.http'], requiredCapabilities: [], configSchema: 'empty.json'});
      fs.writeFileSync(manifestFile, JSON.stringify(manifest));
      fs.writeFileSync(path.join(plugin, 'malformed.mjs'), `export function activate(){return {async ready(){},async shutdown(){},async invoke({request,fence}){fence.assertCurrent();const response=await fetch(request.resource.canonicalId,{method:'POST',body:JSON.stringify(request.payload.body)});await response.text();return ${result};}};}`);
      const fixtureFile = path.join(directory, 'fixture.json');
      const fixture = JSON.parse(fs.readFileSync(fixtureFile));
      fixture.platform.providers['network.http'] = 'test.locale-dependency:malformed';
      fixture.platform.adapters['test.locale-dependency:malformed'] = {};
      fs.writeFileSync(fixtureFile, JSON.stringify(fixture));
      const first = await harness.subprocess(directory, 'en_US.UTF-8');
      assert.equal(first.code, 1, JSON.stringify(first)); assert.equal(harness.received.length, 1, first.err);
      const entries = fs.readFileSync(path.join(directory, 'effects.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line).entry);
      const request = entries.find(entry => entry.type === 'requested' && entry.request.capability === 'network.http').request;
      const receipts = entries.filter(entry => entry.type === 'completed' && entry.receipt.idempotencyKey === request.idempotencyKey).map(entry => entry.receipt);
      assert.equal(receipts.length, 1); assert.equal(receipts[0].status, 'failed'); assert(!Object.hasOwn(receipts[0], 'result'));
      assert(!JSON.stringify(receipts).includes('GETTER_MUST_NOT_RUN'), 'JSON domain check must reject getter without executing it');
      const second = await harness.subprocess(directory, 'sv_SE.UTF-8');
      assert.equal(second.code, 1); assert.equal(harness.received.length, 1, second.err);
    } finally {await harness.close();}
  });
}
