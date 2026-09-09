// Actual archived/current producers and loopback receiver; part of verify:reliability.
import fs from 'node:fs';
import path from 'node:path';
import {createHarness} from './adapter-dependency-locale-fixture.mjs';
import {materializeLegacyDependencyCore} from './adapter-dependency-historical.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
for (const mode of ['delivery', 'activation']) test(`original ${mode} boundary survives real cross-locale restart`, async () => {
  const harness = createHarness();
  try {
    const origin = await harness.listen();
    for (const historical of [true, false]) {
      const directory = harness.fixture(`${mode}-${historical}`, origin);
      const plugin = path.join(directory, 'plugins/consumer');
      const file = path.join(plugin, 'adapter.mjs');
      let source = fs.readFileSync(file, 'utf8');
      if (mode === 'delivery') source = source.replace('body:{ä:1,z:2}}});', `body:{ä:1,z:2}}},{deliveryId:${JSON.stringify('delivery/ä '.repeat(40))}});`);
      else {
        const manifest = JSON.parse(fs.readFileSync(path.join(plugin, 'plugin.json')));
        const old = manifest.id; manifest.id = `test.${'x'.repeat(155)}`; manifest.adapters[0].id = 'r'.repeat(96);
        fs.writeFileSync(path.join(plugin, 'plugin.json'), JSON.stringify(manifest));
        const configFile = path.join(directory, 'fixture.json');
        let config = fs.readFileSync(configFile, 'utf8').replaceAll(`${old}:consumer`, `${manifest.id}:${manifest.adapters[0].id}`).replaceAll(`${old}:stage`, `${manifest.id}:stage`);
        const parsed = JSON.parse(config); parsed.platform.activeAdapters = [`${manifest.id}:${manifest.adapters[0].id}`];
        fs.writeFileSync(configFile, JSON.stringify(parsed));
        source = source.replace('async ready(){}', "async ready(){await call();process.kill(process.pid,'SIGKILL');}");
      }
      fs.writeFileSync(file, source);
      const runtime = historical ? materializeLegacyDependencyCore(path.join(harness.root, `legacy-${mode}`)) : undefined;
      const before = harness.received.length;
      const result = await harness.subprocess(directory, 'en_US.UTF-8', runtime);
      console.log(JSON.stringify({mode, historical, receiverCalls: harness.received.length - before, ...result}));
      assert.equal(result.signal, 'SIGKILL', result.err);
      assert.equal(harness.received.length - before, 1);
      const prefix = fs.readFileSync(path.join(directory, 'effects.jsonl'), 'utf8');
      const resumed = await harness.subprocess(directory, 'sv_SE.UTF-8');
      assert.equal(harness.received.length - before, 1, resumed.err);
      if (mode === 'activation') assert.equal(resumed.signal, 'SIGKILL', resumed.err);
      else assert.equal(resumed.code, 0, resumed.err);
      assert(fs.readFileSync(path.join(directory, 'effects.jsonl'), 'utf8').startsWith(prefix));
      console.log(JSON.stringify({mode, historical, resumed, receiverCalls: harness.received.length - before, exactPrefix: true}));
    }
  } finally {await harness.close();}
});
