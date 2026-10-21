import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {minimalPluginFixtureOutputCustody, minimalPluginFixtureOutputRole} from '../docs-minimal-plugin-fixture-output-custody.mjs';
import {classifySerializedOutputRoles} from '../docs-api-output-role-classification.mjs';

const repository = path.resolve(import.meta.dirname, '../..');
const source = 'scripts/check-ap08-minimal-plugin.mjs';
const plugin = 'docs/site/extend/examples/minimal-stage/plugin.json';
const packageFile = 'docs/site/extend/examples/minimal-stage/package.json';
const consumer = 'scripts/check-runtime-role-manifests.mjs';
function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minimal-plugin-fixture-custody-'));
  const write = (file, value) => {fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});fs.writeFileSync(path.join(root, file), value);};
  try {
    for (const file of [source, consumer, plugin, packageFile]) write(file, fs.readFileSync(path.join(repository, file)));
    run({root, write, acquire: () => minimalPluginFixtureOutputCustody(root, source, fs.readFileSync(path.join(root, source)))});
  } finally {fs.rmSync(root, {recursive: true, force: true});}
}

test('only the two original metadata slots qualify; no fabricated receipt or runtime/module/apply grant', () => fixture(({root, acquire}) => {
  const receipt = acquire(); assert.equal(acquire(), receipt);
  const roles = classifySerializedOutputRoles(root, source);
  assert.deepEqual(roles.map(role => role.role), ['unknown', 'unknown', 'non-api']);
  assert.deepEqual(roles.slice(0, 2).map(role => minimalPluginFixtureOutputRole(role, receipt).role), ['non-api', 'non-api']);
  assert.equal(minimalPluginFixtureOutputRole(roles[0], {...receipt}), roles[0]);
  for (const changed of [{...roles[0], line: 177}, {...roles[0], sink: 'process.stdout.write'}, {...roles[0], expression: 'JSON.stringify(process.argv[2])'}]) {
    assert.equal(minimalPluginFixtureOutputRole(changed, receipt), changed);
  }
  assert.throws(() => {receipt.dependencies.push('foreign');}, TypeError);
  assert.equal(receipt.runtimeExecutionAuthorized, false);
  assert.equal(receipt.moduleImportAuthorized, false);
  assert.equal(receipt.apiApplyAuthorized, false);
  assert.equal(minimalPluginFixtureOutputCustody(root, 'scripts/foreign.mjs', ''), null);
}));

for (const [name, mutate] of [
  ['changed checker/caller writes a resource instead', ({root, write}) => write(source, fs.readFileSync(path.join(root, source), 'utf8').replace('JSON.stringify(probeManifest)', "JSON.stringify({apiVersion:'v1',kind:'Secret'})"))],
  ['resource-shaped plugin fixture', ({root, write}) => {const value = JSON.parse(fs.readFileSync(path.join(root, plugin)));value.apiVersion = 'v1';value.kind = 'Secret';write(plugin, JSON.stringify(value));}],
  ['resource-shaped package fixture', ({write}) => write(packageFile, '{"apiVersion":"v1","kind":"Secret"}')],
  ['changed ownership consumer interprets a different key', ({root, write}) => write(consumer, fs.readFileSync(path.join(root, consumer), 'utf8').replace('result.set(manifest.id', 'result.set(manifest.kind'))],
  ['same-byte consumer redirected through an alias', ({root, write}) => {write('scripts/foreign-consumer.mjs', fs.readFileSync(path.join(root, consumer)));fs.rmSync(path.join(root, consumer));fs.symlinkSync('foreign-consumer.mjs', path.join(root, consumer));}],
]) test(`warm receipt revalidation rejects ${name}`, () => fixture(context => {
  context.acquire();context.acquire();mutate(context);
  assert.throws(context.acquire, /MINIMAL_PLUGIN_FIXTURE_OUTPUT_UNQUALIFIED/);
}));

test('selected source snapshot cannot borrow current physical-source custody', () => fixture(({root, acquire}) => {
  acquire();
  assert.throws(() => minimalPluginFixtureOutputCustody(root, source, 'foreign bytes'), /selected source snapshot/);
}));
