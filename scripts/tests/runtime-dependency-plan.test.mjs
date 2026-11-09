import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runtimeDependencyPlan } from '../lib/runtime-dependency-plan.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-dependency-plan-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const put = (relative, manifest) => {
    const directory = path.join(root, relative);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(directory, 'index.js'), `module.exports = ${JSON.stringify(manifest.version ?? manifest.name)};`);
    return directory;
  };
  put('', { name: 'fixture' });
  return { root, put };
}

test('copied graph resolves nested versions and cyclic dependencies from their declarers', (t) => {
  const { root, put } = fixture(t);
  put('node_modules/shared', { name: 'shared', version: '1' });
  put('node_modules/parent', { name: 'parent', dependencies: { shared: '*', cycle: '*' } });
  put('node_modules/parent/node_modules/shared', { name: 'shared', version: '2', exports: './index.js' });
  put('node_modules/cycle', { name: 'cycle', dependencies: { parent: '*' } });
  const plan = runtimeDependencyPlan([{ name: 'shared', origin: root }, { name: 'parent', origin: root }]);
  assert.equal(plan.packages.length, 4);
  const output = path.join(root, 'output');
  for (const record of plan.packages) {
    fs.mkdirSync(path.join(output, record.target), { recursive: true });
    for (const name of ['package.json', 'index.js']) fs.copyFileSync(path.join(record.sourceRoot, name), path.join(output, record.target, name));
  }
  for (const { target, destination } of plan.links) {
    const link = path.join(output, target);
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(path.relative(path.dirname(link), path.join(output, destination)), link);
  }
  const parent = plan.packages.find((entry) => entry.name === 'parent');
  const parentRequire = createRequire(path.join(output, parent.target, 'package.json'));
  assert.equal(parentRequire('shared'), '2');
  assert.equal(createRequire(path.join(output, 'skills/package.json'))('shared'), '1');
  assert.equal(parentRequire('cycle'), 'cycle');
});

test('missing required dependency fails, missing optional dependency is omitted', (t) => {
  const { root } = fixture(t);
  assert.throws(() => runtimeDependencyPlan([{ name: 'missing', origin: root }]), /not installed/);
  assert.deepEqual(runtimeDependencyPlan([{ name: 'missing', origin: root, optional: true }]), { packages: [], links: [] });
});


test('peer dependencies retain declarer resolution and optional peers may be absent', (t) => {
  const { root, put } = fixture(t);
  put('node_modules/consumer', {
    name: 'consumer', peerDependencies: { peer: '*', absent: '*' },
    peerDependenciesMeta: { absent: { optional: true } },
  });
  const peer = put('node_modules/peer', { name: 'peer', version: '3' });
  const plan = runtimeDependencyPlan([{ name: 'consumer', origin: root }]);
  assert.equal(plan.packages.length, 2);
  const consumer = plan.packages.find((entry) => entry.name === 'consumer');
  assert(plan.links.some((entry) => entry.target === `${consumer.target}/node_modules/peer`
    && entry.destination === plan.packages.find((entry) => entry.sourceRoot === peer).target));
  fs.rmSync(peer, { recursive: true });
  assert.throws(() => runtimeDependencyPlan([{ name: 'consumer', origin: root }]), /not installed: peer/);
});


test('dependency store can resolve internal packages through the skills ancestor', (t) => {
  const { root, put } = fixture(t);
  put('node_modules/external', { name: 'external', dependencies: { '@workspace/core': '*' } });
  const plan = runtimeDependencyPlan([{ name: 'external', origin: root, target: 'skills/plugins/consumer' }], new Set(['@workspace/core']));
  assert.equal(plan.packages.length, 1);
  assert.equal(plan.links[0].target, 'skills/node_modules/external');
  assert(plan.links.every(({ target }) => !target.startsWith('skills/plugins/')));
  const output = path.join(root, 'output');
  const record = plan.packages[0];
  const external = path.join(output, record.target);
  fs.mkdirSync(external, { recursive: true });
  fs.copyFileSync(path.join(record.sourceRoot, 'package.json'), path.join(external, 'package.json'));
  const internal = path.join(output, 'skills/packages/core');
  fs.mkdirSync(internal, { recursive: true });
  fs.writeFileSync(path.join(internal, 'index.js'), 'module.exports = 42;');
  const link = path.join(output, 'skills/node_modules/@workspace/core');
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(path.relative(path.dirname(link), internal), link);
  assert.equal(createRequire(path.join(external, 'package.json'))('@workspace/core'), 42);
});


test('plugin dependency hoisting rejects conflicting installed versions', (t) => {
  const { root, put } = fixture(t);
  put('node_modules/shared', { name: 'shared', version: '1' });
  const plugin = put('plugin', { name: 'plugin' });
  put('plugin/node_modules/shared', { name: 'shared', version: '2' });
  assert.throws(() => runtimeDependencyPlan([
    { name: 'shared', origin: root },
    { name: 'shared', origin: plugin, target: 'skills/plugins/plugin' },
  ]), /target collision/);
});
