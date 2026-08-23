import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = path.resolve('../../../..');
const core = await import(pathToFileURL(path.join(repository, 'skills/nova/core/src/index.ts')).href);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-preflight-'));
const project = path.join(temporary, 'repository');
const artifacts = path.join(temporary, 'artifacts');
fs.mkdirSync(path.join(project, 'modules/web/api'), { recursive: true });
fs.mkdirSync(path.join(project, 'modules/split/frontend'), { recursive: true });
fs.mkdirSync(path.join(project, 'modules/split/backend'), { recursive: true });
fs.writeFileSync(path.join(project, 'modules/web/FORGE.md'), 'Deliver Dockerfile and openapi.yaml.\n');
fs.writeFileSync(path.join(project, 'modules/split/frontend/FORGE.md'), 'Deliver index.html.\n');
fs.writeFileSync(path.join(project, 'modules/split/backend/FORGE.md'), 'Deliver openapi.yaml.\n');

function grantedRegistry() {
  const roots = [
    path.join(repository, 'skills/common/plugins'),
    path.join(repository, 'skills/nova/plugins'),
    path.join(repository, 'skills/buster/plugins'),
  ];
  const snapshot = core.buildRegistry(core.discoverPackages({
    installationRoots: roots,
    trustPolicy: {
      trustedBuiltinRoots: roots,
      allowedSourceDigests: new Map(),
      verifiedAttestations: new Map(),
      verifierId: 'test:preflight-live-function',
    },
    now: () => new Date('2026-07-26T00:00:00Z'),
  }));
  return core.resolveCapabilityGrants(snapshot, {
    enabledRegistrations: new Set(['kubeclaw.preflight-contract:validate']),
    providers: new Map([
      ['git.repository.read', 'kubeclaw.repository-adapter:repository'],
      ['artifacts.write', 'kubeclaw.artifact-store:artifact-store'],
    ]),
    grants: new Map([
      ['kubeclaw.preflight-contract:validate', new Map([
        ['git.repository.read', { allowedPrefixes: ['modules/'] }],
        ['artifacts.write', { allowedNamespaces: ['kubeclaw.preflight-contract'] }],
      ])],
    ]),
  });
}

async function run(id, input) {
  const granted = grantedRegistry();
  const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
  const adapters = new core.AdapterRuntime({
    granted,
    activated,
    configs: new Map([
      ['kubeclaw.repository-adapter:repository', { repositoryRoot: project }],
      ['kubeclaw.artifact-store:artifact-store', { artifactRoot: artifacts }],
    ]),
    effects: new core.EffectCoordinator(new core.FileEffectJournal(path.join(temporary, `${id}-effects.jsonl`)), undefined, undefined, new core.MemoryResourceLockManager()),
    shutdownTimeoutMs: 1000,
    async emitDomainEvent() {},
  });
  await adapters.start();
  const journalPath = path.join(temporary, `${id}-events.jsonl`);
  try {
    const runner = new core.PipelineRunner({
      definition: {
        schemaVersion: 'pipeline-definition.v2',
        id: `pipeline:${id}`,
        maxConcurrency: 1,
        stages: [
          {
            id: 'preflight',
            type: 'kubeclaw.validate.preflight-contract',
            dependsOn: [],
            config: {},
            input,
            on: { request_fix: 'preflight-remediation' },
            execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 10000 },
          },
          {
            id: 'preflight-remediation',
            type: 'kubeclaw.validate.preflight-contract',
            dependsOn: ['preflight'],
            config: {},
            input,
            execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 10000 },
          },
        ],
      },
      registry: granted,
      activated,
      adapters,
      journal: new core.FileJournal(journalPath),
    });
    const result = await runner.run(`run:${id}`);
    const records = fs.readFileSync(journalPath, 'utf8').trim().split('\n').map(JSON.parse);
    const completed = records.findLast(({ entry }) => entry.type === 'attempt.completed');
    return { status: result.status, outcome: completed?.entry.payload.outcome };
  } finally {
    await adapters.shutdown();
  }
}

const moduleInput = {
  moduleId: 'web',
  modulePath: 'modules/web',
  ownedPaths: ['docker/Dockerfile'],
  serveDockerfile: 'docker/Dockerfile',
  apiSpecFile: 'api/openapi.yaml',
};

try {
  assert.deepEqual(await run('pass', moduleInput), { status: 'succeeded', outcome: 'passed' });
  assert.equal((await run('undeclared', { ...moduleInput, apiSpecFile: 'api/asyncapi.yaml' })).outcome, 'request_fix');
  assert.equal((await run('missing', { ...moduleInput, modulePath: 'modules/missing' })).outcome, 'blocked');
  assert.equal((await run('invalid-path', { ...moduleInput, modulePath: '../outside' })).outcome, 'blocked');
  assert.equal((await run('substeps', {
    moduleId: 'split',
    modulePath: 'modules/split',
    substeps: ['frontend', 'backend'],
    ownedPaths: [],
    serveDockerfile: null,
    apiSpecFile: 'api/openapi.yaml',
  })).outcome, 'passed');
  const catalog = JSON.parse(fs.readFileSync(path.join(artifacts, 'records', 'store.json'), 'utf8')).records;
  assert.ok(catalog.length >= 5);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.preflight-contract', suite: 'live-function' }));
