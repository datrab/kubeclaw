import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = path.resolve('../../../..');
const core = await import(pathToFileURL(path.join(repository, 'skills/nova/core/src/index.ts')).href);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-lint-plugin-'));
const fixtureRepository = path.join(temporary, 'repository');
const artifacts = path.join(temporary, 'artifacts');
const policyPath = path.join(temporary, 'lint-policy.json');

function createPolicy() {
  const policy = JSON.parse(fs.readFileSync(
    path.join(repository, 'charts/kubeclaw/files/config/lint-policy.json'),
    'utf8',
  ));
  policy.baseline_path = 'lint-baseline.json';
  policy.kubernetes_policy_packs = [];
  policy.projects = [{
    id: 'fixture',
    root: '.',
    discovery_max_depth: 4,
    languages: ['shell'],
    language_evidence: { shell: ['*.sh'] },
    go: { modules: [] },
    terraform: { roots: [] },
  }];
  policy.architecture = {
    layers: [{ id: 'fixture', roots: ['.'], may_depend_on: ['fixture'] }],
  };
  policy.experimental_tools = policy.tools
    .map((tool) => tool.id)
    .filter((id) => id !== 'shellcheck' && id !== 'shfmt');
  policy.tools = policy.tools.map((tool) => ({
    ...tool,
    targets: tool.languages.length === 1 && ['go', 'terraform'].includes(tool.languages[0])
      ? []
      : ['.'],
    config_path: null,
    ...(['go-vet', 'go-imports', 'staticcheck', 'govulncheck'].includes(tool.id)
      ? { arguments: [] }
      : {}),
  }));
  fs.mkdirSync(fixtureRepository, { recursive: true });
  fs.writeFileSync(path.join(temporary, 'lint-baseline.json'), JSON.stringify({
    schema_version: 'pipeline_lint_baseline.v2',
    groups: [],
  }));
  fs.writeFileSync(policyPath, JSON.stringify(policy));
  fs.writeFileSync(path.join(fixtureRepository, 'clean.sh'), '#!/bin/sh\nprintf "%s\\n" "clean"\n');
  fs.writeFileSync(path.join(fixtureRepository, 'invalid.sh'), '#!/bin/sh\nunused=1\necho "$missing"\n');
}

createPolicy();

function registry(type) {
  const registration = type === 'kubeclaw.lint.full' ? 'kubeclaw.lint:full' : 'kubeclaw.lint:pre-check';
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
      verifierId: 'test:lint-live-function',
    },
    now: () => new Date('2026-07-26T00:00:00Z'),
  });
  const snapshot = core.buildRegistry(packages);
  return core.resolveCapabilityGrants(snapshot, {
    enabledRegistrations: new Set([registration]),
    providers: new Map([
      ['lint.execute', 'kubeclaw.lint:executor'],
      ['artifacts.write', 'kubeclaw.artifact-store:artifact-store'],
    ['artifacts.read', 'kubeclaw.artifact-store:artifact-store'],
    ]),
    grants: new Map([
      [registration, new Map([
        ['lint.execute', {
          allowedProjects: ['fixture'],
          allowedRoots: [fixtureRepository],
          allowedPolicyRoots: [temporary],
        }],
        ['artifacts.write', { allowedNamespaces: ['kubeclaw.lint'] }],
      ['artifacts.read', { allowedNamespaces: ['kubeclaw.implementation-agent'] }],
      ])],
    ]),
  });
}

async function run(changedFiles, runId, type = 'kubeclaw.lint.pre-check', options = {}) {
  const granted = registry(type);
  const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
  const effects = new core.EffectCoordinator(new core.FileEffectJournal(path.join(temporary, `${runId}-effects.jsonl`)), undefined, undefined, new core.MemoryResourceLockManager());
  const adapters = new core.AdapterRuntime({
    granted,
    activated,
    configs: new Map([
      ['kubeclaw.lint:executor', {
        allowedRepositoryRoots: [fixtureRepository],
        allowedPolicyRoots: [temporary],
      }],
      ['kubeclaw.artifact-store:artifact-store', {
        artifactRoot: options.artifactRoot ?? artifacts,
      }],
    ]),
    effects,
    shutdownTimeoutMs: 1000,
    async emitDomainEvent() {},
  });
  await adapters.start();
  options.afterAdaptersStart?.();
  try {
    const runner = new core.PipelineRunner({
      definition: {
        schemaVersion: 'pipeline-definition.v2',
        id: `pipeline:${runId}`,
        maxConcurrency: 1,
        stages: [
          {
            id: 'lint',
            type,
            dependsOn: [],
            config: { policyPath, policyProject: 'fixture' },
            input: {
              workingDirectory: fixtureRepository,
              project: 'fixture',
              changedFiles,
              ...(options.revision ? { revision: options.revision } : {}),
            },
            on: { request_fix: 'lint-remediation' },
            execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 120000 },
          },
          {
            id: 'lint-remediation',
            type,
            dependsOn: ['lint'],
            config: { policyPath, policyProject: 'fixture' },
            input: {
              workingDirectory: fixtureRepository,
              project: 'fixture',
              changedFiles,
              ...(options.revision ? { revision: options.revision } : {}),
            },
            execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 120000 },
          },
        ],
      },
      registry: granted,
      activated,
      adapters,
      journal: new core.FileJournal(path.join(temporary, `${runId}-events.jsonl`)),
    });
    return await runner.run(`run:${runId}`);
  } finally {
    await adapters.shutdown();
  }
}

try {
  const clean = await run(['clean.sh'], 'clean');
  if (clean.status !== 'succeeded') {
    console.error(fs.readFileSync(path.join(temporary, 'clean-events.jsonl'), 'utf8'));
    console.error(fs.readFileSync(path.join(temporary, 'clean-effects.jsonl'), 'utf8'));
  }
  assert.equal(clean.status, 'succeeded');
  assert.equal(clean.stages.get('lint')?.status, 'succeeded');

  const failing = await run(['invalid.sh'], 'failing');
  assert.equal(failing.status, 'blocked');
  assert.equal(failing.stages.get('lint')?.status, 'blocked');

  const full = await run(['clean.sh'], 'full', 'kubeclaw.lint.full');
  assert.equal(full.status, 'succeeded');
  assert.equal(full.stages.get('lint')?.status, 'succeeded');
  const fullFailing = await run(['invalid.sh'], 'full-failing', 'kubeclaw.lint.full');
  assert.equal(fullFailing.status, 'blocked');
  assert.equal(fullFailing.stages.get('lint')?.status, 'blocked');

  for (const [id, type] of [
    ['pre-check-crash', 'kubeclaw.lint.pre-check'],
    ['full-crash', 'kubeclaw.lint.full'],
  ]) {
    const unusableArtifactRoot = path.join(temporary, `${id}-artifacts`);
    const crashed = await run(['clean.sh'], id, type, {
      artifactRoot: unusableArtifactRoot,
      afterAdaptersStart: () => fs.mkdirSync(path.join(unusableArtifactRoot, 'records', 'store.json'), { recursive: true }),
    });
    assert.equal(crashed.status, 'blocked');
    assert.equal(crashed.stages.get('lint')?.status, 'blocked');
    const events = fs.readFileSync(path.join(temporary, `${id}-events.jsonl`), 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse);
    const completed = events.findLast((record) => record.entry?.type === 'attempt.completed');
    assert.equal(completed?.entry?.payload?.reason?.code, 'core.plugin_runtime_failed');
  }
  const git = (args) => execFileSync('git', ['-C', fixtureRepository, ...args], { encoding: 'utf8' }).trim();
  git(['init', '-q']);
  git(['add', '.']);
  git(['-c', 'user.name=Lint', '-c', 'user.email=lint@example.invalid', 'commit', '-qm', 'actual shell defect']);
  const brokenRevision = git(['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(fixtureRepository, 'invalid.sh'), '#!/bin/sh\nprintf "%s\\n" "fixed"\n');
  git(['add', '.']);
  git(['-c', 'user.name=Lint', '-c', 'user.email=lint@example.invalid', 'commit', '-qm', 'repair shell defect']);
  const fixedRevision = git(['rev-parse', 'HEAD']);
  assert.equal((await run(['invalid.sh'], 'candidate-broken', 'kubeclaw.lint.full', { revision: brokenRevision })).status, 'blocked');
  fs.writeFileSync(path.join(fixtureRepository, 'invalid.sh'), '#!/bin/sh\necho "$missing"\n');
  assert.equal((await run(['invalid.sh'], 'candidate-fixed', 'kubeclaw.lint.full', { revision: fixedRevision })).status, 'succeeded');
  assert.equal(git(['rev-parse', 'HEAD']), fixedRevision);
  assert.match(fs.readFileSync(path.join(fixtureRepository, 'invalid.sh'), 'utf8'), /missing/);
  const catalog = JSON.parse(fs.readFileSync(path.join(artifacts, 'records', 'store.json'), 'utf8')).records;
  assert.ok(catalog.length >= 4);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.lint',
  suite: 'live-function',
  registrations: {
    'stage:pre-check': ['pass', 'fail', 'crash'],
    'stage:full': ['pass', 'fail', 'crash'],
    'adapter:executor': ['pass', 'fail', 'crash'],
  },
}));
