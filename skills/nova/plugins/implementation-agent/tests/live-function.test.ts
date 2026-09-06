import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const repository = path.resolve('../../../..');
const core = await import(pathToFileURL(path.join(repository, 'skills/nova/core/src/index.ts')).href);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-implementation-'));
const agentWorkspace = path.join(temporary, 'agent-workspace');
let workerWorkspace = agentWorkspace;
let lockedRepository: string | undefined;
fs.mkdirSync(path.join(agentWorkspace, 'src'), { recursive: true });
const transcript = 'start forge\nhandoff task\nwrite src/api.ts\nrun unit\ncomplete\n';
const transcriptDigest = crypto.createHash('sha256').update(transcript).digest('hex');
const server = http.createServer((_request, response) => {
  fs.mkdirSync(path.join(workerWorkspace, 'src'), { recursive: true });
  fs.writeFileSync(path.join(workerWorkspace, 'src/api.ts'), 'export const ready = true;\n');
  execFileSync(process.execPath, ['--input-type=module', '-e', `import assert from 'node:assert/strict'; import { ready } from ${JSON.stringify(new URL('file://' + path.join(workerWorkspace, 'src/api.ts')).href)}; assert.equal(ready, true);`]);
  fs.writeFileSync(path.join(workerWorkspace, 'transcript.log'), transcript);
  if (lockedRepository) execFileSync('git', ['-C', lockedRepository, 'worktree', 'lock', workerWorkspace]);
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ result: {
    status: 'ready_for_testing',
    summary: 'Implemented.', changedPaths: ['src/api.ts'],
    checks: [{ name: 'node smoke.test.mjs', passed: true }],
    session: {
      sessionId: 'session:forge:run-1:api:1',
      startedAt: '2026-07-28T00:00:00.000Z',
      completedAt: '2026-07-28T00:00:01.000Z',
      transcriptDigest,
      handoffs: 1,
      termination: 'completed',
    },
  } }));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('server unavailable');
const origin = `http://127.0.0.1:${address.port}`;
const secret = 'KUBECLAW_IMPLEMENTATION_TEST_TOKEN'; process.env[secret] = 'implementation-secret';
const roots = ['common', 'nova', 'buster'].map((role) => path.join(repository, `skills/${role}/plugins`));
try {
  const snapshot = core.buildRegistry(core.discoverPackages({ installationRoots: roots, trustPolicy: {
    trustedBuiltinRoots: roots, allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'test:implementation',
  }, now: () => new Date('2026-07-26T00:00:00Z') }));
  const enabled = new Set(['kubeclaw.implementation-agent:implementation']);
  const granted = core.resolveCapabilityGrants(snapshot, {
    enabledRegistrations: enabled,
    providers: new Map([['runtime.dispatch','kubeclaw.runtime-dispatch:runtime'],['network.http','kubeclaw.network-http:http'],['secrets.read','kubeclaw.secret-resolver:secrets'],['artifacts.write','kubeclaw.artifact-store:artifact-store'],
      ['git.workspace.create','kubeclaw.git-workspace:git'],['git.workspace.remove','kubeclaw.git-workspace:git'],['git.commit','kubeclaw.git-workspace:git'],['git.merge','kubeclaw.git-workspace:git']]),
    grants: new Map([
      ['kubeclaw.implementation-agent:implementation', new Map([['runtime.dispatch',{allowedAgents:['forge']}],['artifacts.write',{allowedNamespaces:['kubeclaw.implementation-agent']}],
        ['git.workspace.create',{allowedRoots:[temporary],allowedWorkspaceRoots:[temporary]}],['git.workspace.remove',{allowedRoots:[temporary],allowedWorkspaceRoots:[temporary]}],
        ['git.commit',{allowedRoots:[temporary]}],['git.merge',{allowedRoots:[temporary]}]])],
      ['kubeclaw.runtime-dispatch:runtime', new Map([['network.http',{allowedOrigins:[origin]}],['secrets.read',{allowedNames:['forge.agent']} ]])],
    ]),
  });
  const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
  const effectsPath = path.join(temporary, 'effects.jsonl');
  const adapters = new core.AdapterRuntime({ granted, activated, configs: new Map([
    ['kubeclaw.runtime-dispatch:runtime',{targets:{forge:{endpoint:`${origin}/dispatch`,tokenSecret:'forge.agent'}}}],
    ['kubeclaw.network-http:http',{allowedOrigins:[origin],allowedMethods:['POST'],allowedHeaders:['content-type','idempotency-key','x-kubeclaw-signature']}],
    ['kubeclaw.secret-resolver:secrets',{environment:{'forge.agent':secret}}],
    ['kubeclaw.artifact-store:artifact-store',{artifactRoot:path.join(temporary,'artifacts')}],
    ['kubeclaw.git-workspace:git',{allowedRepositoryRoots:[temporary],workspaceRoot:path.join(temporary,'worktrees'),
      gitExecutable:fs.realpathSync(execFileSync('sh',['-lc','command -v git'],{encoding:'utf8'}).trim()),
      authorName:'KubeClaw Test',authorEmail:'test@kubeclaw.invalid',maxExecutionMs:5000,maxOutputBytes:65536,terminationGraceMs:100}],
  ]), effects: new core.EffectCoordinator(new core.FileEffectJournal(effectsPath), undefined, undefined, new core.MemoryResourceLockManager()), shutdownTimeoutMs:1000, async emitDomainEvent(){} });
  await adapters.start();
  try {
    const runner = new core.PipelineRunner({ definition:{schemaVersion:'pipeline-definition.v2',id:'pipeline:implementation',maxConcurrency:1,stages:[{
      id:'implementation',type:'kubeclaw.agent.implementation',dependsOn:[],config:{agent:'forge'},
      input:{runId:'run-1',moduleId:'api',attempt:1,task:'Implement API.',headBefore:'a'.repeat(40)},
      execution:{maxAttempts:1,maxRemediationCycles:0,timeoutMs:5000},
    }]}, registry:granted, activated, adapters, journal:new core.FileJournal(path.join(temporary,'events.jsonl')) });
    assert.equal((await runner.run('run:implementation')).status,'succeeded');
    assert.equal(fs.readFileSync(path.join(agentWorkspace, 'src/api.ts'), 'utf8'), 'export const ready = true;\n');
    assert.equal(
      crypto.createHash('sha256').update(fs.readFileSync(path.join(agentWorkspace, 'transcript.log'))).digest('hex'),
      transcriptDigest,
    );
    assert.match(fs.readFileSync(path.join(temporary,'artifacts','records','store.json'),'utf8'),/implementation:api:1/);
    assert.equal(fs.readFileSync(effectsPath,'utf8').includes('implementation-secret'),false);
    // A locked real Git worktree makes cleanup fail after a real commit/merge.
    // This verifies the lifecycle boundary without substituting a Git adapter.
    lockedRepository = path.join(temporary, 'cleanup-repository');
    fs.mkdirSync(lockedRepository);
    execFileSync('git', ['-C', lockedRepository, 'init', '-q']);
    execFileSync('git', ['-C', lockedRepository, 'config', 'user.name', 'KubeClaw Test']);
    execFileSync('git', ['-C', lockedRepository, 'config', 'user.email', 'test@kubeclaw.invalid']);
    fs.writeFileSync(path.join(lockedRepository, 'README.md'), 'cleanup test\n');
    execFileSync('git', ['-C', lockedRepository, 'add', 'README.md']);
    execFileSync('git', ['-C', lockedRepository, 'commit', '-qm', 'base']);
    const headBefore = execFileSync('git', ['-C', lockedRepository, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    workerWorkspace = path.join(temporary, 'worktrees', 'cleanup');
    const cleanup = new core.PipelineRunner({ definition: { schemaVersion: 'pipeline-definition.v2', id: 'pipeline:cleanup', maxConcurrency: 1, stages: [{
      id: 'implementation', type: 'kubeclaw.agent.implementation', dependsOn: [], config: { agent: 'forge' },
      input: { runId: 'stale-input', moduleId: 'api', attempt: 99, task: 'Implement API.', headBefore,
        workspace: { repositoryRoot: lockedRepository, workspacePath: workerWorkspace, branch: 'cleanup-work', baseRef: 'HEAD', mergeTarget: lockedRepository, commitMessage: 'Implement API' } },
      execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 10000 },
    }] }, registry: granted, activated, adapters, journal: new core.FileJournal(path.join(temporary, 'cleanup-events.jsonl')) });
    const cleanupResult = await cleanup.run('run:cleanup');
    assert.equal(cleanupResult.status, 'succeeded', new core.FileJournal(path.join(temporary, 'cleanup-events.jsonl')).records().filter(({ entry }) => entry.type === 'stage.blocked' || entry.type === 'stage.failed').map(({ entry }) => JSON.stringify(entry.payload.reason)).join('\n'));
    const sourceRevision = execFileSync('git', ['-C', lockedRepository, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    assert.notEqual(sourceRevision, headBefore);
    assert.equal(cleanupResult.stages.get('implementation')?.facts?.['implementation.source_revision'], sourceRevision);
    assert.equal(fs.readFileSync(path.join(lockedRepository, 'src/api.ts'), 'utf8'), 'export const ready = true;\n');
    assert.match(fs.readFileSync(effectsPath, 'utf8'), /implementation-cleanup.v1/);
    const effects = new core.FileJournal(effectsPath).records().map(({ entry }) => entry);
    const removal = effects.find(entry => entry.type === 'requested' && entry.request.attempt.runId === 'run:cleanup' && entry.request.capability === 'git.workspace.remove');
    const removalReceipt = effects.find(entry => entry.type === 'completed' && entry.receipt.effectId === removal?.request.effectId)?.receipt;
    assert.equal(removalReceipt?.status, 'failed');
    assert.match(removalReceipt?.error?.message ?? '', /locked working tree/);
    assert.ok(fs.existsSync(workerWorkspace), 'failed cleanup remains available for recovery');

  } finally { await adapters.shutdown(); }
} finally {
  delete process.env[secret]; await new Promise((resolve)=>server.close(resolve)); fs.rmSync(temporary,{recursive:true,force:true});
}

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.implementation-agent', suite: 'http-worker-and-real-git' }));
