import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {requirePrismObservationRepair, prismObservationRoot, filesystemForDescriptor} from '../../../scripts/repair-prism-observation-traversal.mjs';
const facts = {uid: 0, path: prismObservationRoot, realpath: prismObservationRoot, filesystem: 0x63677270,
  owner: 0, group: 0, mode: 0o700, populated: 'populated 0', children: 0, processes: '',
  controlsRootOnlyWritable: true, controllers: ['cpu', 'memory', 'pids']};
test('Linux descriptor inspection uses supported Node filesystem APIs', {skip: process.platform !== 'linux'}, () => {
  const fd = fs.openSync('.', fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
  try { assert.equal(filesystemForDescriptor(fd), fs.statfsSync('.').type); }
  finally { fs.closeSync(fd); }
});
test('only the exact drained root-owned Prism pool is eligible; repair is idempotent', () => {
  assert.equal(requirePrismObservationRepair(facts), true);
  assert.equal(requirePrismObservationRepair({...facts, mode: 0o711}), false);
  for (const patch of [{uid: 1000}, {owner: 1000}, {group: 1000}, {mode: 0o777}, {mode: 0o755},
    {populated: 'populated 1'}, {children: 1}, {processes: '123'}, {controlsRootOnlyWritable: false},
    {filesystem: 0}, {controllers: ['cpu']}, {path: prismObservationRoot.replace('prism', 'buster')}, {realpath: '/other'}]) {
    assert.throws(() => requirePrismObservationRepair({...facts, ...patch}), /PRECONDITION/);
  }
});
test('new Prism pools compensate for systemd umask without rewriting existing pools', () => {
  const source = fs.readFileSync('scripts/prepare-native-worker-pools.mjs', 'utf8');
  assert.match(source, /if \(existing\.has\(role\)\) continue;[\s\S]*fs\.mkdirSync\(directory\);[\s\S]*if \(role === 'prism'\) fs\.chmodSync\(directory, 0o711\)/);
});
