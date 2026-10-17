// Maintained copy of the independently authored generation probes; timing hook scope unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { captureSwarmSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';

const canonical = new URL('../../../config/', import.meta.url);
const entryName = 'pipeline.config.json';
const entry = JSON.parse(fs.readFileSync(new URL(entryName, canonical), 'utf8'));
const names = [entryName, ...Object.values(entry.components)];
const instanceId = 'kubeclaw/prism/prism-studio';
const selection = { role: 'prism', callerId: 'prism-studio', serviceInstanceId: instanceId,
  bindings: entry.bindings.filter(binding => binding.instanceId === instanceId)
    .map(({ role: _role, ...binding }) => binding) };
function capture(f, generation = 'old') {
  return captureSwarmSettings(path.join(f.root, generation, entryName), selection);
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'config-generation-review-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const generation of ['old', 'new']) {
    for (const name of names) {
      const target = path.join(root, generation, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(new URL(name, canonical), target);
    }
  }
  const studioFile = path.join(root, 'new', entry.components['prism-studio']);
  const studio = JSON.parse(fs.readFileSync(studioFile, 'utf8'));
  studio.profiles[selection.bindings[0].profileId].settings.port = 19089;
  fs.writeFileSync(studioFile, JSON.stringify(studio));
  fs.symlinkSync('old', path.join(root, '..data'));
  fs.symlinkSync(`..data/${entryName}`, path.join(root, entryName));
  return { root };
}

// A synchronous I/O hook only fixes the timing of real filesystem changes.
// All bytes, descriptors, symlinks, validation and final identity checks are real.
function duringRead(triggerRead, operation, load) {
  const original = fs.readFileSync;
  let reads = 0;
  fs.readFileSync = function (...args) {
    const bytes = Reflect.apply(original, this, args);
    if (typeof args[0] === 'number' && ++reads === triggerRead) operation();
    return bytes;
  };
  try { return load(); } finally { fs.readFileSync = original; }
}

test('physical generation retains complete old authors during delivery alias replacement', t => {
  const f = fixture(t);
  assert.throws(() => captureSwarmSettings(path.join(f.root, entryName), selection), /SWARM_CONFIG_SYMLINK/);
  const original = capture(f);
  let switchedAlias = false;
  const switched = duringRead(1, () => {
    switchedAlias = true;
    fs.symlinkSync('new', path.join(f.root, '..next'));
    fs.renameSync(path.join(f.root, '..next'), path.join(f.root, '..data'));
  }, () => capture(f));
  assert.equal(switchedAlias, true);
  assert.deepEqual(switched, original);
  const next = capture(f, 'new');
  assert.equal(next.components['prism-studio'].settings.port, 19089);
  assert.equal(next.identity.generationDirectory, path.join(f.root, 'new'));
});

test('removing a selected generation component after reading entry rejects', t => {
  const f = fixture(t);
  assert.throws(() => duringRead(1, () => {
    fs.unlinkSync(path.join(f.root, 'old', entry.components['prism-studio']));
  }, () => capture(f)), { code: 'ENOENT' });
});

test('changing an already read component during later reads rejects the local bundle', t => {
  const f = fixture(t);
  // Read order is entry, control, studio. Change control after studio was read.
  assert.throws(() => duringRead(3, () => {
    fs.appendFileSync(path.join(f.root, 'old', entry.components['prism-control']), '\n');
  }, () => capture(f)), /SWARM_CONFIG_CHANGED/);
});
