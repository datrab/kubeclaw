import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquireDependencyAggregate, aggregateBytes, checkAggregate } from '../plugin-dependency-aggregate.mjs';

test('aggregate detects native declarations, attribution, classification and all role schema drift', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pr13-aggregate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), JSON.stringify(value));
  };
  write('scripts/check-runtime-package-ownership.mjs', {});
  write('packaging/runtime/package-ownership.json', {});
  write('plugin/manifest.json', { author: 'a' });
  const roles = ['configSchema', 'inputSchema', 'resultSchema', 'checkpointSchema'];
  const registration = { id: 'a', inputs: ['native'], outputs: [], evidenceTypes: [], evidenceDefaults: {} };
  for (const role of roles) { registration[role] = `${role}.json`; write(`plugin/${role}.json`, { type: 'string' }); }
  const plugin = { id: 'p', root: 'plugin', manifest: 'plugin/manifest.json', registrations: [registration] };
  let classification = 'shared';
  const report = { packages: [plugin] };
  const acquire = () => aggregateBytes(acquireDependencyAggregate({ root, report, sourceOwner: () => classification }));
  const before = acquire();
  for (const role of roles) {
    write(`plugin/${role}.json`, { type: 'number' }); assert.notEqual(acquire(), before);
    fs.unlinkSync(path.join(root, `plugin/${role}.json`)); assert.throws(acquire, /ENOENT/);
    write(`plugin/${role}.json`, { type: 'string' }); assert.equal(acquire(), before);
  }
  for (const field of ['inputs', 'outputs', 'evidenceTypes', 'evidenceDefaults', 'requiredCapabilities', 'providedCapabilities']) {
    const prior = registration[field]; registration[field] = ['changed']; assert.notEqual(acquire(), before);
    if (prior === undefined) delete registration[field]; else registration[field] = prior;
  }
  write('plugin/manifest.json', { author: 'b' }); assert.notEqual(acquire(), before);
  write('plugin/manifest.json', { author: 'a' }); classification = null; assert.notEqual(acquire(), before); classification = 'shared';
  for (const scope of [report.packages, plugin.registrations]) {
    const item = scope.pop(); assert.notEqual(acquire(), before); scope.push(item); assert.equal(acquire(), before);
    scope.push(item); assert.notEqual(acquire(), before); scope.pop();
  }
  plugin.hostConfigSchema = { source: plugin.manifest, schema: false }; const hostBefore = acquire();
  plugin.hostConfigSchema.schema = null; assert.notEqual(acquire(), hostBefore);
  delete plugin.hostConfigSchema;
  const target = path.join(root, 'aggregate.json');
  assert.throws(() => checkAggregate(target, before), /Missing or stale/);
  fs.writeFileSync(target, before); checkAggregate(target, acquire());
  assert.throws(() => checkAggregate(target, 'stale'), /Missing or stale/);
  assert.equal(fs.readFileSync(target, 'utf8'), before);
});
