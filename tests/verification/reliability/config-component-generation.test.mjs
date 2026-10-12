// Maintained copy of the independently authored generation probes; timing hook scope unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadSwarmSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';

const canonical = new URL('../../../charts/kubeclaw/files/config/', import.meta.url);
const entryName = 'swarm.config.json';
const entry = JSON.parse(fs.readFileSync(new URL(entryName, canonical), 'utf8'));
const names = [entryName, ...Object.values(entry.components)];

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'config-generation-review-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const generation of ['old', 'new']) {
    fs.mkdirSync(path.join(root, generation));
    for (const name of names) fs.copyFileSync(new URL(name, canonical), path.join(root, generation, name));
  }
  const studioFile = path.join(root, 'new', 'prism-studio.config.json');
  const studio = JSON.parse(fs.readFileSync(studioFile, 'utf8'));
  studio.settings.port = 19089;
  fs.writeFileSync(studioFile, JSON.stringify(studio));
  fs.symlinkSync('old', path.join(root, '..data'));
  fs.symlinkSync(`..data/${entryName}`, path.join(root, entryName));
  return { root, environment: { SWARM_CONFIG: path.join(root, entryName) } };
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

test('actual data symlink replacement after entry read retains one complete old generation', t => {
  const f = fixture(t);
  const original = loadSwarmSettings(f.environment);
  const switched = duringRead(1, () => {
    fs.symlinkSync('new', path.join(f.root, '..next'));
    fs.renameSync(path.join(f.root, '..next'), path.join(f.root, '..data'));
  }, () => loadSwarmSettings(f.environment));
  assert.deepEqual(switched, original);
  const next = loadSwarmSettings(f.environment);
  assert.equal(next.prism.studio.port, 19089);
  assert.equal(next.identity.generationDirectory, path.join(f.root, 'new'));
});

test('removing a selected generation component after reading entry rejects', t => {
  const f = fixture(t);
  assert.throws(() => duringRead(1, () => {
    fs.unlinkSync(path.join(f.root, 'old', 'prism-studio.config.json'));
  }, () => loadSwarmSettings(f.environment)), { code: 'ENOENT' });
});

test('changing an already read component during later reads rejects the local bundle', t => {
  const f = fixture(t);
  // Read order is entry, control, studio. Change control after studio was read.
  assert.throws(() => duringRead(3, () => {
    fs.appendFileSync(path.join(f.root, 'old', 'prism-control.config.json'), '\n');
  }, () => loadSwarmSettings(f.environment)), /SWARM_CONFIG_CHANGED/);
});
