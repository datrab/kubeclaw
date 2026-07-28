import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = path.resolve('../../../..');
const core = await import(pathToFileURL(path.join(repository, 'skills/common/plugin-runtime/core/src/index.ts')).href);
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
    ]),
    grants: new Map([
      [registration, new Map([
        ['lint.execute', { repositoryRoots: [fixtureRepository], policyRoots: [temporary] }],
        ['artifacts.write', { namespace: 'kubeclaw.lint' }],
      ])],
    ]),
  });
}

async function run(changedFiles, runId, type = 'kubeclaw.lint.pre-check') {
  const granted = registry(type);
  const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
  const effects = new core.EffectCoordinator(new core.FileEffectJournal(path.join(temporary, `${runId}-effects.jsonl`)));
  const adapters = new core.AdapterRuntime({
    granted,
    activated,
    configs: new Map([
      ['kubeclaw.lint:executor', {
        allowedRepositoryRoots: [fixtureRepository],
        allowedPolicyRoots: [temporary],
      }],
      ['kubeclaw.artifact-store:artifact-store', { artifactRoot: artifacts }],
    ]),
    effects,
    shutdownTimeoutMs: 1000,
    async emitDomainEvent() {},
  });
  await adapters.start();
  try {
    const runner = new core.PipelineRunner({
      definition: {
        schemaVersion: 'pipeline-definition.v2',
        id: `pipeline:${runId}`,
        maxConcurrency: 1,
        stages: [{
          id: 'lint',
          type,
          dependsOn: [],
          config: { policyPath, policyProject: 'fixture' },
          input: {
            workingDirectory: fixtureRepository,
            project: 'fixture',
            changedFiles,
          },
          on: { request_fix: 'lint' },
          execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 120000 },
        }],
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
  const catalog = fs.readFileSync(path.join(artifacts, 'catalog.jsonl'), 'utf8').trim().split('\n');
  assert.ok(catalog.length >= 3);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.lint', suite: 'live-function' }));
