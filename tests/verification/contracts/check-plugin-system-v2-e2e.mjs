import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const core = await import(pathToFileURL(path.resolve('skills/common/plugin-runtime/core/src/index.ts')).href);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-v2-e2e-'));
const repository = path.join(temporary, 'repository');
const artifacts = path.join(temporary, 'artifacts');
fs.mkdirSync(repository, { recursive: true });
fs.writeFileSync(path.join(repository, 'Dockerfile'), 'COPY dist /app/public\n');

const packages = core.discoverPackages({
  installationRoots: ['skills/common/plugins', 'skills/nova/plugins', 'skills/buster/plugins'],
  trustPolicy: {
    trustedBuiltinRoots: ['skills/common/plugins', 'skills/nova/plugins', 'skills/buster/plugins'],
    allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(),
    verifierId: 'test:e2e',
  },
  now: () => new Date('2026-07-25T22:00:00Z'),
});
const snapshot = core.buildRegistry(packages);
const granted = core.resolveCapabilityGrants(snapshot, {
  enabledRegistrations: new Set(['kubeclaw.delivery-lint:delivery-lint']),
  providers: new Map([
    ['git.repository.read', 'kubeclaw.repository-adapter:repository'],
    ['artifacts.read', 'kubeclaw.artifact-store:artifact-store'],
    ['artifacts.write', 'kubeclaw.artifact-store:artifact-store'],
  ]),
  grants: new Map([
    ['kubeclaw.delivery-lint:delivery-lint', new Map([
      ['git.repository.read', { allowedPrefixes: ['Dockerfile'] }],
      ['artifacts.write', { allowedNamespaces: ['kubeclaw.delivery-lint'] }],
    ])],
  ]),
});
const activated = await core.activateRegistry(snapshot, new Set(granted.grants.keys()));
const effects = new core.EffectCoordinator(
  new core.FileEffectJournal(path.join(temporary, 'effects.jsonl')),
  undefined,
  undefined,
  new core.MemoryResourceLockManager(),
);
const adapters = new core.AdapterRuntime({
  granted,
  activated,
  configs: new Map([
    ['kubeclaw.repository-adapter:repository', { repositoryRoot: repository }],
    ['kubeclaw.artifact-store:artifact-store', { artifactRoot: artifacts }],
  ]),
  effects,
  shutdownTimeoutMs: 1000,
  async emitDomainEvent() {},
});
await adapters.start();
const runner = new core.PipelineRunner({
  definition: {
    schemaVersion: 'pipeline-definition.v2',
    id: 'pipeline:e2e',
    maxConcurrency: 1,
    stages: [{
      id: 'delivery',
      type: 'kubeclaw.lint.delivery',
      dependsOn: [],
      config: {},
      input: {
        moduleId: 'web',
        dockerfile: 'Dockerfile',
        staticPath: '/app/public',
      },
      execution: { maxAttempts: 2, maxRemediationCycles: 1, timeoutMs: 5000 },
    }],
  },
  registry: granted,
  activated,
  adapters,
  journal: new core.FileJournal(path.join(temporary, 'events.jsonl')),
});
const result = await runner.run('run:e2e');
assert.equal(result.status, 'succeeded');
assert.equal(result.stages.get('delivery')?.status, 'succeeded');
const catalog = fs.readFileSync(path.join(artifacts, 'catalog.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .map(JSON.parse);
assert.equal(catalog.length, 1);
assert.equal(catalog[0].artifactId, 'delivery-lint:web');
assert.match(catalog[0].digest, /^sha256:[a-f0-9]{64}$/);
await adapters.shutdown();
fs.rmSync(temporary, { recursive: true, force: true });
console.log(JSON.stringify({ ok: true, contract: 'plugin-system-v2-e2e' }));
