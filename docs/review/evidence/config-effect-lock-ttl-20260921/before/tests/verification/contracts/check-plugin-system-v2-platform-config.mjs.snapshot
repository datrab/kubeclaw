import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const core = await import(pathToFileURL(path.resolve('skills/nova/core/src/index.ts')).href);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-platform-v2-'));
const plugins = path.join(temporary, 'plugins');
fs.mkdirSync(plugins);

const platform = {
  schemaVersion: 'pipeline-platform.v2',
  installationRoots: ['./plugins'],
  trustedBuiltinRoots: ['./plugins'],
  externalTrust: {
    allowedSourceDigests: {},
    verifiedAttestations: {},
  },
  providers: {},
  grants: {},
  adapters: {},
  activeAdapters: [],
  observers: {},
  storageRoot: './state',
  shutdownTimeoutMs: 5000,
  effectLockTtlMs: 300_000,
  orchestratorIssuerId: 'nova',
  administrativeDecisionIssuers: [],
};

try {
  const file = path.join(temporary, 'platform.json');
  fs.writeFileSync(file, JSON.stringify(platform));
  const loaded = core.loadPlatformConfig(file);
  assert.deepEqual(loaded.installationRoots, [plugins]);
  assert.equal(Object.isFrozen(loaded), true);
  assert.equal(Object.isFrozen(loaded.externalTrust), true);
  assert.equal(Object.isFrozen(loaded.externalTrust.allowedSourceDigests), true);
  assert.equal(Object.isFrozen(loaded.providers), true);
  assert.equal(Object.isFrozen(loaded.grants), true);
  assert.equal(loaded.effectLockTtlMs, 300_000);

  fs.writeFileSync(file, JSON.stringify({ ...platform, effectLockTtlMs: 59_999 }));
  assert.throws(() => core.loadPlatformConfig(file), /PLATFORM_CONFIG_INVALID/);

  fs.writeFileSync(file, JSON.stringify({
    ...platform,
    projectInstallationRoots: ['./project-controlled-code'],
  }));
  assert.throws(
    () => core.loadPlatformConfig(file),
    /PLATFORM_CONFIG_INVALID/,
    'project configuration cannot add installation authority to platform policy',
  );

  assert.throws(() => core.validateContractValue('pipelineDefinition', {
    schemaVersion: 'pipeline-definition.v2',
    id: 'pipeline:authority-escalation',
    maxConcurrency: 1,
    installationRoots: ['./project-controlled-code'],
    stages: [],
  }), (error) => error?.code === 'REGISTRY_RESULT_INVALID');

  console.log(JSON.stringify({ ok: true, contract: 'plugin-system-v2-platform-config' }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
