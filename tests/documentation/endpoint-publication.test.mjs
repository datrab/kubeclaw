import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';

const repository = path.resolve(import.meta.dirname, '../..');

test('ordinary namespace lifecycle API calls do not require the optional readiness listener', () => {
  const result = spawnSync(process.execPath,
    ['scripts/docs-platform-surface-inventory.mjs', '--print-inventory'],
    { cwd: repository, encoding: 'utf8', timeout: 60_000, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  const inventory = JSON.parse(result.stdout);
  const lifecycle = inventory.outboundConnections.filter(item =>
    item.source === 'cmd/buster-namespace-controller/demo-readiness-lifecycle.go');
  assert.deepEqual(lifecycle.map(item => [item.caller, item.value.split(' ')[0]]).sort(), [
    ['deleteNamespaceCAS', 'DELETE'], ['patchLeaseStatus', 'GET'],
    ['patchLeaseStatus', 'PATCH'], ['removeFinalizerCAS', 'PATCH'],
  ]);
  for (const item of lifecycle) {
    assert.equal(item.activationState, 'active', `${item.caller}: ordinary controller path was hidden`);
    assert.doesNotMatch(item.activationCondition, /listener is enabled/u);
  }
  const optional = inventory.outboundConnections.filter(item =>
    /\/demo-readiness(?:-sources)?\.go$/u.test(item.source)
    || item.source.endsWith('/demo-product.go'));
  assert(optional.length > 0);
  for (const item of optional) assert.equal(item.activationState, 'conditional', item.value);
});

test('native endpoint publication is isolated and preserves the original source-first guard', t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-endpoint-publication-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'checkout');
  execFileSync('git', ['clone', '--shared', '--quiet', '--no-hardlinks', repository, root]);
  fs.symlinkSync(path.join(repository, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  fs.appendFileSync(path.join(root, '.git/info/exclude'), '\n/node_modules\n');
  const script = 'scripts/docs-generate.mjs';
  fs.copyFileSync(path.join(repository, script), path.join(root, script));
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git(['add', script]);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'endpoint source fixture']);
  const revision = git(['rev-parse', 'HEAD']);
  const run = (...args) => spawnSync(process.execPath,
    [script, '--only', 'endpoints', '--revision', revision, ...args],
    { cwd: root, encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
  const lock = 'docs/generated/inventory/documentation-source-revision.json';
  const lockBefore = fs.readFileSync(path.join(root, lock));
  let result = run();
  assert.equal(result.status, 0, result.stderr);
  const page = 'docs/site/reference/endpoints.md';
  assert.deepEqual(git(['diff', '--name-only']).split('\n'), [page]);
  const delivered = fs.readFileSync(path.join(root, page));
  assert(delivered.includes(Buffer.from(`generated from revision \`${revision}\``)));
  const text = delivered.toString('utf8');
  assert.match(text, /TCP <unnamed>:5432 -> 5432/u,
    'an omitted PostgreSQL targetPort must not appear as a missing receiver');
  assert.match(text, /targetPort omitted; API default equals port/u);
  assert.match(text, /kubernetes\/kubernetes\/blob\/66452049f3d692768c39c797b21b793dce80314e\/pkg\/apis\/core\/v1\/defaults\.go#L125-L134/u);
  assert.match(text, /TCP gateway:18789 -> gateway/u, 'named workload ports must remain named');
  assert.equal(run('--check').status, 0);
  assert.deepEqual(fs.readFileSync(path.join(root, lock)), lockBefore);
  result = run('--update-source-revision');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /bounded generation must not update/u);
  assert.deepEqual(fs.readFileSync(path.join(root, lock)), lockBefore);
  fs.appendFileSync(path.join(root, 'README.md'), '\nUncommitted fixture source change.\n');
  result = run('--check');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /source revision does not match.*README\.md/u);
  assert.deepEqual(fs.readFileSync(path.join(root, page)), delivered);
});
