import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const repositoryRoot = path.resolve('../../../..');
const core = await import(pathToFileURL(path.join(repositoryRoot, 'skills/nova/core/src/index.ts')).href);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-blueprint-sync-'));
const repository = path.join(temporary, 'repository');
const workspaces = path.join(temporary, 'workspaces');
fs.mkdirSync(repository);
fs.mkdirSync(workspaces);
const git = (args) => execFileSync('/usr/bin/git', args, { cwd: repository, encoding: 'utf8' });
git(['init', '-b', 'main']);
git(['config', 'user.name', 'Fixture']);
git(['config', 'user.email', 'fixture@example.invalid']);
fs.mkdirSync(path.join(repository, 'module'), { recursive: true });
fs.writeFileSync(path.join(repository, 'module', 'FORGE.md'), 'old\n');
git(['add', '.']); git(['commit', '-m', 'initial']);
git(['checkout', '-b', 'project/architecture']);
fs.writeFileSync(path.join(repository, 'module', 'FORGE.md'), 'architecture\n');
git(['add', '.']); git(['commit', '-m', 'architecture controls']);
git(['checkout', 'main']);
const roots = [
  path.join(repositoryRoot, 'skills/common/plugins'), path.join(repositoryRoot, 'skills/nova/plugins'),
  path.join(repositoryRoot, 'skills/buster/plugins'),
];
const snapshot = core.buildRegistry(core.discoverPackages({
  installationRoots: roots,
  trustPolicy: {
    trustedBuiltinRoots: roots, allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
    verifierId: 'test:blueprint-sync',
  },
  now: () => new Date('2026-07-26T00:00:00Z'),
}));
const enabled = new Set(['kubeclaw.blueprint-sync:sync']);
const granted = core.resolveCapabilityGrants(snapshot, {
  enabledRegistrations: enabled,
  providers: new Map([
    ['git.sync', 'kubeclaw.git-workspace:git'], ['git.commit', 'kubeclaw.git-workspace:git'],
    ['state.append', 'kubeclaw.state-store:state'], ['artifacts.write', 'kubeclaw.artifact-store:artifact-store'],
  ]),
  grants: new Map([
    ['kubeclaw.blueprint-sync:sync', new Map([
      ['git.sync', { allowedRoots: [repository] }], ['git.commit', { allowedRoots: [repository] }],
      ['state.append', { allowedNamespaces: ['kubeclaw.blueprint-sync'] }],
      ['artifacts.write', { allowedNamespaces: ['kubeclaw.blueprint-sync'] }],
    ])],
  ]),
});
const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
const adapters = new core.AdapterRuntime({
  granted, activated,
  configs: new Map([
    ['kubeclaw.git-workspace:git', {
      allowedRepositoryRoots: [repository], workspaceRoot: workspaces, gitExecutable: '/usr/bin/git',
      authorName: 'KubeClaw Test', authorEmail: 'kubeclaw@example.invalid',
      maxExecutionMs: 5000, maxOutputBytes: 65536, terminationGraceMs: 100,
    }],
    ['kubeclaw.state-store:state', { root: path.join(temporary, 'state') }],
    ['kubeclaw.artifact-store:artifact-store', { artifactRoot: path.join(temporary, 'artifacts') }],
  ]),
  effects: new core.EffectCoordinator(new core.FileEffectJournal(path.join(temporary, 'effects.jsonl')), undefined, undefined, new core.MemoryResourceLockManager()),
  shutdownTimeoutMs: 1000, async emitDomainEvent() {},
});
try {
  await adapters.start();
  const runner = new core.PipelineRunner({
    definition: {
      schemaVersion: 'pipeline-definition.v2', id: 'pipeline:blueprint-sync', maxConcurrency: 1,
      stages: [{
        id: 'sync', type: 'kubeclaw.generate.blueprint-sync', dependsOn: [], config: {},
        input: {
          blueprintId: 'project', repositoryRoot: repository, branchRef: 'project/architecture',
          controlPaths: ['module/FORGE.md'],
        },
        execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 5000 },
      }],
    },
    registry: granted, activated, adapters, journal: new core.FileJournal(path.join(temporary, 'events.jsonl')),
  });
  const result = await runner.run('run:blueprint');
  assert.equal(result.status, 'succeeded', fs.readFileSync(path.join(temporary, 'effects.jsonl'), 'utf8'));
  assert.equal(fs.readFileSync(path.join(repository, 'module', 'FORGE.md'), 'utf8'), 'architecture\n');
  assert.match(git(['log', '-1', '--pretty=%s']), /blueprint-sync/);
  assert.match(fs.readFileSync(path.join(temporary, 'artifacts', 'records', 'store.json'), 'utf8'), /blueprint-sync:project/);
  assert.match(fs.readFileSync(path.join(temporary, 'state', 'records', 'store.json'), 'utf8'), /blueprint.controls.synced/);
} finally {
  await adapters.shutdown();
  fs.rmSync(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.blueprint-sync', suite: 'live-function' }));
