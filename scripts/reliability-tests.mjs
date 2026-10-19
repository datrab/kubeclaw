import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// These originals require genuine root-owned files or fixed-UID transitions.
// Entrypoint and v10 input-set originals also invoke the real generation
// publisher, which must reject non-root-owned image/package trees.
// Keep their original assertions in the disposable, accounted native CI scope.
const fixedUidTests = ['buster-admission-cli.test.mjs'];
export const nativeTests = [
  ...fixedUidTests,
  'buster-historical-import.test.mts',
  'original-boot-admission.test.mts',
  'original-boot-metadata.test.mts',
  'original-initial-state.test.mts',
  'original-native-host.test.mjs',
  'pipeline-boot.test.mjs',
  'pipeline-role-readback.test.mjs',
  'buster-cluster-entrypoint.test.mjs',
  'pipeline-v10-input-set.test.mts',

  'prism-native-startup.test.mts', 'worker-native-contract.test.mts',
  'worker-native-launcher.test.mts', 'worker-native-observation.test.mts',
  'worker-observation-durability.test.mts',
];
export const serviceTests = [
  'archviewer-native.test.mjs',
  'redis-durability.test.mts', 'redis-migration.test.mts', 'redis-transport.test.mts',
];
export function selectTests(files, group, shard = 1, shards = 1) {
  if (!['core', 'native', 'services'].includes(group)) throw new Error('Unknown reliability group');
  if (!Number.isInteger(shard) || !Number.isInteger(shards) || shard < 1 || shard > shards) throw new Error('Invalid shard');
  for (const file of [...nativeTests, ...serviceTests]) {
    if (!files.includes(file)) throw new Error(`Reliability test missing: ${file}`);
  }
  return files.filter(file => group === 'native' ? nativeTests.includes(file)
    : group === 'services' ? serviceTests.includes(file)
      : !nativeTests.includes(file) && !serviceTests.includes(file))
    .sort().filter((_file, index) => index % shards === shard - 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const directory = 'tests/verification/reliability';
  const [group, shard = '1', shards = '1'] = process.argv.slice(2);
  const files = selectTests(fs.readdirSync(directory).filter(file => /\.test\.(mts|mjs)$/.test(file)), group, Number(shard), Number(shards));
  if (files.length === 0) throw new Error('Empty reliability shard');
  if (group === 'services') {
    for (const name of ['ARCHVIEWER_TEST_NGINX', 'REDIS_SERVER', 'REDIS_SOURCE_SERVER']) {
      if (!process.env[name]) throw new Error(`Missing native test prerequisite: ${name}`);
      fs.accessSync(process.env[name], fs.constants.X_OK);
    }
  } else if (group === 'native') {
    if (process.getuid?.() !== 0) throw new Error('Native authority tests require root on the disposable CI runner');
    const { currentTestCgroup } = await import('../tests/verification/reliability/native-test-cgroup.mts');
    currentTestCgroup();
  } else {
    fs.accessSync('skills/common/plugin-runtime/foundation/isolation/plugin-sandbox', fs.constants.X_OK);
  }
  console.log(`Reliability ${group} ${shard}/${shards}: ${files.length} files\n${files.join('\n')}`);
  // Fixed-UID originals need the native scope's real root authority, not the
  // hosted runner's incidental UID or a mocked process.getuid. Keep their
  // assertions intact and execute them once with no inherited root groups.
  const rootFiles = group === 'native' ? files.filter(file => !fixedUidTests.includes(file)) : files;
  let exitCode = 0;
  if (rootFiles.length > 0) {
    const result = spawnSync(process.execPath, ['--test', '--test-concurrency=2', ...rootFiles.map(file => `${directory}/${file}`)], { stdio: 'inherit' });
    if (result.error) throw result.error;
    exitCode = result.status ?? 1;
  }
  if (group === 'native') {
    const fixedFiles = files.filter(file => fixedUidTests.includes(file));
    if (fixedFiles.length > 0) {
      const fixed = spawnSync('/usr/bin/setpriv', ['--reuid=1000', '--regid=1000', '--clear-groups',
        process.execPath, '--test', '--test-concurrency=2', ...fixedFiles.map(file => `${directory}/${file}`)], { stdio: 'inherit' });
      if (fixed.error) throw fixed.error;
      if (fixed.status !== 0) exitCode = fixed.status ?? 1;
    }
  }
  process.exitCode = exitCode;
}
