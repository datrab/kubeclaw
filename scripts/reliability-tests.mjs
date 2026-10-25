import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const nativeTests = [
  'prism-native-startup.test.mts', 'worker-native-contract.test.mts',
  'worker-native-launcher.test.mts', 'worker-native-observation.test.mts',
  'worker-observation-durability.test.mts',
];
export const serviceTests = [
  'archviewer-native.test.mjs',
  'redis-durability.test.mts', 'redis-migration.test.mts', 'redis-transport.test.mts',
];
const profile = JSON.parse(fs.readFileSync(new URL('./ci/reliability-weights.json', import.meta.url), 'utf8'));
export function balancedShards(files, shards, weights = profile.seconds) {
  if (!Number.isInteger(shards) || shards < 1) throw new Error('Invalid shard count');
  const values = Object.values(weights);
  if (values.some(value => !Number.isFinite(value) || value <= 0)) throw new Error('Invalid reliability weight');
  const sorted = [...values].sort((a, b) => a - b);
  const fallback = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 1;
  const weight = file => weights[file] ?? fallback;
  const buckets = Array.from({ length: shards }, () => ({ files: [], seconds: 0 }));
  for (const file of [...new Set(files)].sort((a, b) => weight(b) - weight(a) || (a < b ? -1 : a > b ? 1 : 0))) {
    const bucket = buckets.reduce((best, candidate) => candidate.seconds < best.seconds ? candidate : best);
    bucket.files.push(file);
    bucket.seconds += weight(file);
  }
  return buckets.map(bucket => bucket.files);
}
export function selectTests(files, group, shard = 1, shards = 1, weights = profile.seconds) {
  if (!['core', 'native', 'services'].includes(group)) throw new Error('Unknown reliability group');
  if (!Number.isInteger(shard) || !Number.isInteger(shards) || shard < 1 || shard > shards) throw new Error('Invalid shard');
  for (const file of [...nativeTests, ...serviceTests]) {
    if (!files.includes(file)) throw new Error(`Reliability test missing: ${file}`);
  }
  const selected = files.filter(file => group === 'native' ? nativeTests.includes(file)
    : group === 'services' ? serviceTests.includes(file)
      : !nativeTests.includes(file) && !serviceTests.includes(file))
    .sort();
  return group === 'core' ? balancedShards(selected, shards, weights)[shard - 1]
    : selected.filter((_file, index) => index % shards === shard - 1);
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
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=2', '--test-reporter=./scripts/ci/reliability-reporter.mjs', ...files.map(file => `${directory}/${file}`)], { stdio: 'inherit', env: { ...process.env, KUBECLAW_RELIABILITY_TIMINGS: `dist/ci-timings/reliability-${group}-${shard}.json` } });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
