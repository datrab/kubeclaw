import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readTestBundle, writeTestBundle, canonicalSwarmEntry } from '../../fixtures/config/swarm-bundle.mjs';
import { loadSwarmSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cluster-entrypoint-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const entry = path.join(root, 'bundle/swarm.config.json');
  const documents = readTestBundle(canonicalSwarmEntry);
  writeTestBundle(entry, documents);
  const bin = path.join(root, 'bin'); fs.mkdirSync(bin);
  const log = path.join(root, 'commands');
  const quote = text => "'" + text.replaceAll("'", "'\"'\"'") + "'";
  // Only path translation for the real read-only preflight. All subsequent commands would fail and be recorded.
  const script = '#!/bin/sh\nprintf "%s\\n" "$*" >> ' + quote(log)
    + '\nif [ "$1" = /app/scripts/buster-cluster-preflight.mjs ]; then exec '
    + quote(process.execPath) + ' ' + quote(path.resolve('scripts/buster-cluster-preflight.mjs'))
    + '; fi\nexit 91\n';
  fs.writeFileSync(path.join(bin, 'node'), script, { mode: 0o700 });
  return { root, entry, documents, log, bin };
}
for (const scenario of ['missing', 'invalid', 'security-missing', 'security-invalid', 'group-empty', 'group-equal', 'version-empty', 'version-equal', 'secrets-empty', 'secrets-equal']) {
  test(`actual entrypoint rejects ${scenario} before first runtime effect`, { timeout: 10000 }, t => {
    const f = fixture(t);
    const environment = { ...process.env, SWARM_CONFIG: f.entry, PATH: `${f.bin}:${process.env.PATH}` };
    for (const key of ['BUSTER_LEASE_API_GROUP', 'BUSTER_LEASE_API_VERSION', 'BUSTER_ALLOWED_SOURCE_SECRETS']) delete environment[key];
    if (scenario === 'missing') delete f.documents['buster-engine'].settings.clusterInvokers;
    if (scenario === 'security-missing') delete f.documents['buster-engine'].settings.clusterInvokers.runtimeSecurity;
    if (scenario === 'security-invalid') f.documents['buster-engine'].settings.clusterInvokers.runtimeSecurity.maximumExecutionMs = 0;
    if (scenario === 'invalid') f.documents['buster-engine'].settings.clusterInvokers.kubernetesFixture.pollIntervalMs = 0;
    if (scenario.startsWith('group')) environment.BUSTER_LEASE_API_GROUP = scenario.endsWith('empty') ? '' : 'kubeclaw.forgestack.ai';
    if (scenario.startsWith('version')) environment.BUSTER_LEASE_API_VERSION = scenario.endsWith('empty') ? '' : 'v1alpha1';
    if (scenario.startsWith('secrets')) environment.BUSTER_ALLOWED_SOURCE_SECRETS = scenario.endsWith('empty') ? ''
      : 'kubeclaw-fixture-preflight,prism-test-provider,prism-test-runtime,prism-test-postgresql-auth,prism-test-ghcr';
    writeTestBundle(f.entry, f.documents);
    const result = spawnSync('/bin/sh', [path.resolve('docker/buster-runtime-entrypoint.sh')],
      { env: environment, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.error, undefined); assert.equal(result.status, 1, result.stderr);
    const legacyKey = scenario.startsWith('group') ? 'BUSTER_LEASE_API_GROUP'
      : scenario.startsWith('version') ? 'BUSTER_LEASE_API_VERSION' : 'BUSTER_ALLOWED_SOURCE_SECRETS';
    assert.match(result.stderr, scenario === 'missing' || scenario === 'invalid' || scenario.startsWith('security-')
      ? /SWARM_CONFIG_INVALID:component:buster-engine/ : new RegExp('SWARM_CONFIG_LEGACY_OVERRIDE:' + legacyKey));
    assert.deepEqual(fs.readFileSync(f.log, 'utf8').trim().split('\n'), ['/app/scripts/buster-cluster-preflight.mjs']);
  });
}
test('relative executable uses the captured physical generation; component aliases reject', t => {
  const f = fixture(t);
  f.documents['buster-engine'].settings.clusterInvokers.shared.kubectlExecutable = './bin/kubectl';
  writeTestBundle(f.entry, f.documents);
  const alias = path.join(f.root, 'current.json'); fs.symlinkSync(f.entry, alias);
  const snapshot = loadSwarmSettings({ SWARM_CONFIG: alias });
  assert.equal(snapshot.buster.clusterInvokers.shared.kubectlExecutable, path.join(path.dirname(f.entry), 'bin/kubectl'));
  assert.equal(snapshot.identity.generationDirectory, path.dirname(f.entry));
  const component = path.join(path.dirname(f.entry), 'buster-engine.config.json');
  const actual = path.join(f.root, 'elsewhere.json'); fs.renameSync(component, actual); fs.symlinkSync(actual, component);
  assert.throws(() => loadSwarmSettings({ SWARM_CONFIG: alias }), /ELOOP|SWARM_CONFIG/);
  assert.equal(snapshot.buster.clusterInvokers.shared.kubectlExecutable, path.join(path.dirname(f.entry), 'bin/kubectl'));
});

test('actual read-only preflight accepts an explicit complete generation', t => {
  const f = fixture(t);
  const result = spawnSync(process.execPath, [path.resolve('scripts/buster-cluster-preflight.mjs')],
    { env: { SWARM_CONFIG: f.entry }, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), fs.realpathSync(f.entry));
  assert.equal(fs.existsSync(f.log), false);
});
