import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadBusterSettings, validateBusterDependencyReadinessSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { validateRuntimeRoot } from '../../../skills/buster/engine/test-gates/production-config-values.ts';
import { canonicalSwarmEntry, readTestBundle, writeTestBundle } from '../../fixtures/config/swarm-bundle.mjs';

const bounds = { maximumExecutionMs: 30000, maximumOutputBytes: 1048576 };

test('readiness policy is required and strictly validated at file and direct boundaries', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-readiness-config-'));
  const file = path.join(root, 'swarm.config.json');
  const baseline = readTestBundle(canonicalSwarmEntry);
  const original = baseline['buster-engine'].settings.dependencyReadiness;
  try {
    for (const [field, maximum] of Object.entries(bounds)) {
      for (const value of [undefined, null, false, true, '1000', [], {}, 0, -1, 1.5, maximum + 1, Number.MAX_SAFE_INTEGER + 1]) {
        const documents = structuredClone(baseline);
        const policy = { ...original, [field]: value };
        if (value === undefined) delete policy[field];
        documents['buster-engine'].settings.dependencyReadiness = policy;
        writeTestBundle(file, documents);
        assert.throws(() => loadBusterSettings({ SWARM_CONFIG: file }), /SWARM_CONFIG_INVALID/);
        assert.throws(() => validateBusterDependencyReadinessSettings(policy), /SWARM_CONFIG_BUSTER_DEPENDENCY_READINESS_INVALID/);
      }
      for (const value of [1, maximum]) {
        const documents = structuredClone(baseline);
        const policy = { ...original, [field]: value };
        documents['buster-engine'].settings.dependencyReadiness = policy;
        writeTestBundle(file, documents);
        assert.deepEqual(loadBusterSettings({ SWARM_CONFIG: file }).dependencyReadiness, policy);
        assert.deepEqual(validateBusterDependencyReadinessSettings(policy), policy);
      }
    }
    for (const policy of [undefined, null, [], {}, { ...original, extra: 1 }]) {
      const documents = structuredClone(baseline);
      documents['buster-engine'].settings.dependencyReadiness = policy;
      writeTestBundle(file, documents);
      assert.throws(() => loadBusterSettings({ SWARM_CONFIG: file }), /SWARM_CONFIG_INVALID/);
      assert.throws(() => validateBusterDependencyReadinessSettings(policy), /SWARM_CONFIG_BUSTER_DEPENDENCY_READINESS_INVALID/);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('readiness policy captures immutable values rather than retaining the caller object', () => {
  const input = { maximumExecutionMs: 1000, maximumOutputBytes: 65536 };
  const captured = validateBusterDependencyReadinessSettings(input);
  input.maximumExecutionMs = 2000;
  input.maximumOutputBytes = 131072;
  assert.deepEqual(captured, { maximumExecutionMs: 1000, maximumOutputBytes: 65536 });
  assert.ok(Object.isFrozen(captured));
});

test('retired runtime JSON readiness author is rejected even when equal, empty or null', () => {
  const runtime = { schemaVersion: 'buster-remote-plan-runtime.v1', platformConfig: '/fixture/platform.json',
    host: '127.0.0.1', sourceAttestationPublicKeyEnvironmentVariable: 'FIXTURE_PUBLIC_KEY',
    trustedSourceAuthority: 'fixture:source', stateRoot: '/fixture/state', runtimeRoot: '/fixture/runtime',
    tarExecutable: '/usr/bin/tar' };
  assert.doesNotThrow(() => validateRuntimeRoot(runtime));
  for (const dependencyReadiness of [undefined, null, {}, { maximumExecutionMs: 1000, maximumOutputBytes: 65536 }]) {
    assert.throws(() => validateRuntimeRoot({ ...runtime, dependencyReadiness }), /SWARM_CONFIG_LEGACY_OVERRIDE:dependencyReadiness/);
  }
});
