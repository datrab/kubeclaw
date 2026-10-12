import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = path.resolve('../../../..');
const core = await import(pathToFileURL(path.join(repository, 'skills/nova/core/src/index.ts')).href);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-delivery-lint-'));
const project = path.join(temporary, 'repository');
const artifacts = path.join(temporary, 'artifacts');
fs.mkdirSync(project, { recursive: true });
fs.writeFileSync(path.join(project, 'Dockerfile'), 'FROM scratch\nCOPY dist public\n');

function registry() {
  const packages = core.discoverPackages({
    installationRoots: [
      path.join(repository, 'skills/common/plugins'),
      path.join(repository, 'skills/nova/plugins'),
      path.join(repository, 'skills/buster/plugins'),
    ],
    trustPolicy: {
      trustedBuiltinRoots: [
        path.join(repository, 'skills/common/plugins'),
        path.join(repository, 'skills/nova/plugins'),
        path.join(repository, 'skills/buster/plugins'),
      ],
      allowedSourceDigests: new Map(),
      verifiedAttestations: new Map(),
      verifierId: 'test:delivery-lint-live-function',
    },
    now: () => new Date('2026-07-26T00:00:00Z'),
  });
  const snapshot = core.buildRegistry(packages);
  return core.resolveCapabilityGrants(snapshot, {
    enabledRegistrations: new Set(['kubeclaw.delivery-lint:delivery-lint']),
    providers: new Map([
      ['git.repository.read', 'kubeclaw.repository-adapter:repository'],
      ['artifacts.write', 'kubeclaw.artifact-store:artifact-store'],
    ]),
    grants: new Map([
      ['kubeclaw.delivery-lint:delivery-lint', new Map([
        ['git.repository.read', { allowedPrefixes: ['Dockerfile', 'missing.Dockerfile'] }],
        ['artifacts.write', { allowedNamespaces: ['kubeclaw.delivery-lint'] }],
      ])],
    ]),
  });
}

async function run(id, input, options = {}) {
  const granted = registry();
  const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
  const adapters = new core.AdapterRuntime({
    granted,
    activated,
    configs: new Map([
      ['kubeclaw.repository-adapter:repository', { repositoryRoot: project }],
      ['kubeclaw.artifact-store:artifact-store', {
        artifactRoot: options.artifactRoot ?? artifacts,
      }],
    ]),
    effects: new core.EffectCoordinator(new core.FileEffectJournal(path.join(temporary, `${id}-effects.jsonl`)), undefined, undefined, new core.MemoryResourceLockManager()),
    shutdownTimeoutMs: 1000,
    async emitDomainEvent() {},
  });
  await adapters.start();
  options.afterAdaptersStart?.();
  const journalPath = path.join(temporary, `${id}-events.jsonl`);
  try {
    const runner = new core.PipelineRunner({
      definition: {
        schemaVersion: 'pipeline-definition.v2',
        id: `pipeline:${id}`,
        maxConcurrency: 1,
        stages: [
          {
            id: 'delivery',
            type: 'kubeclaw.lint.delivery',
            dependsOn: [],
            config: {},
            input,
            on: { request_fix: 'delivery-remediation' },
            execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 10000 },
          },
          {
            id: 'delivery-remediation',
            type: 'kubeclaw.lint.delivery',
            dependsOn: ['delivery'],
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
    const events = fs.readFileSync(journalPath, 'utf8').trim().split('\n').map(JSON.parse);
    const completed = events.findLast((record) => record.entry?.type === 'attempt.completed');
    return {
      result,
      outcome: completed?.entry?.payload?.outcome,
      reason: completed?.entry?.payload?.reason ?? completed?.entry?.payload?.result?.reason,
    };
  } finally {
    await adapters.shutdown();
  }
}

try {
  assert.deepEqual(await run('pass', {
    moduleId: 'web', dockerfile: 'Dockerfile', staticPath: 'public',
  }).then(({ result, outcome }) => [result.status, outcome]), ['succeeded', 'passed']);
  assert.equal((await run('mismatch', {
    moduleId: 'web', dockerfile: 'Dockerfile', staticPath: 'static',
  })).outcome, 'request_fix');
  assert.equal((await run('missing', {
    moduleId: 'web', dockerfile: 'missing.Dockerfile', staticPath: null,
  })).outcome, 'request_fix');
  assert.equal((await run('unsafe', {
    moduleId: 'web', dockerfile: '../Dockerfile', staticPath: null,
  })).outcome, 'blocked');
  assert.equal((await run('skip', {
    moduleId: 'api', dockerfile: null, staticPath: null,
  })).outcome, 'passed');
  const copyCases = [
    { name: 'json', source: 'FROM scratch\nCOPY ["dist", "public"]\n', target: 'public', outcome: 'passed' },
    { name: 'json-spaces', source: 'FROM scratch\nCOPY ["dist files", "public files/"]\n', target: 'public files', outcome: 'passed' },
    { name: 'multi-source', source: 'FROM scratch\nCOPY one two public/\n', target: 'public', outcome: 'passed' },
    { name: 'source-is-not-target', source: 'FROM scratch\nCOPY public two other/\n', target: 'public', outcome: 'request_fix' },
    { name: 'continuation', source: 'FROM scratch\nCOPY --chown=1000:1000 ["dist", \\\n "public"]\n', target: 'public', outcome: 'passed' },
    { name: 'workdir', source: 'FROM scratch\nWORKDIR /app\nCOPY dist public/\n', target: '/app/public', outcome: 'passed' },
    { name: 'relative-workdir', source: 'FROM scratch\nWORKDIR /app\nWORKDIR sub\nCOPY dist public/\n', target: 'public', outcome: 'passed' },
    { name: 'builder-only', source: 'FROM scratch AS build\nCOPY dist public\nFROM scratch\nCOPY --from=build /public /other\n', target: 'public', outcome: 'request_fix' },
    { name: 'inherited-stage', source: 'FROM scratch AS build\nCOPY dist public\nFROM build\n', target: 'public', outcome: 'passed' },
    { name: 'invalid-json', source: 'FROM scratch\nCOPY ["dist", "public"\n', target: 'public', outcome: 'request_fix' },
    { name: 'variable', source: 'FROM scratch\nCOPY dist $DEST\n', target: 'public', outcome: 'request_fix' },
  ];
  for (const item of copyCases) {
    fs.writeFileSync(path.join(project, 'Dockerfile'), item.source);
    const result = await run(`copy-${item.name}`, { moduleId: 'web', dockerfile: 'Dockerfile', staticPath: item.target });
    assert.equal(result.outcome, item.outcome, item.name);
    if (['invalid-json', 'variable'].includes(item.name)) assert.equal(result.reason?.code, 'delivery_lint.static_path_unverifiable');
  }
  fs.writeFileSync(path.join(project, 'Dockerfile'), 'FROM scratch\nCOPY dist public\n');
  const unusableArtifactRoot = path.join(temporary, 'crash-artifacts');
  const crashed = await run('crash', {
    moduleId: 'web', dockerfile: 'Dockerfile', staticPath: 'public',
  }, {
    artifactRoot: unusableArtifactRoot,
    afterAdaptersStart: () => fs.mkdirSync(path.join(unusableArtifactRoot, 'records', 'store.json'), { recursive: true }),
  });
  assert.equal(crashed.result.status, 'blocked');
  assert.equal(crashed.outcome, 'retry');
  assert.equal(crashed.reason?.code, 'core.plugin_runtime_failed');
  const catalog = JSON.parse(fs.readFileSync(path.join(artifacts, 'records', 'store.json'), 'utf8')).records;
  assert.ok(catalog.length >= 5);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.delivery-lint',
  suite: 'live-function',
  registrations: {
    'stage:delivery-lint': ['pass', 'fail', 'blocked', 'crash'],
  },
}));
