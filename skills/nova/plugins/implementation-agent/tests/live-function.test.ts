import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const repository = path.resolve('../../../..');
const core = await import(pathToFileURL(path.join(repository, 'skills/common/plugin-runtime/core/src/index.ts')).href);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-implementation-'));
const agentWorkspace = path.join(temporary, 'agent-workspace');
fs.mkdirSync(path.join(agentWorkspace, 'src'), { recursive: true });
const transcript = 'start forge\nhandoff task\nwrite src/api.ts\nrun unit\ncomplete\n';
const transcriptDigest = crypto.createHash('sha256').update(transcript).digest('hex');
const server = http.createServer((_request, response) => {
  fs.writeFileSync(path.join(agentWorkspace, 'src/api.ts'), 'export const ready = true;\n');
  fs.writeFileSync(path.join(agentWorkspace, 'transcript.log'), transcript);
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
    assert.match(fs.readFileSync(path.join(temporary,'artifacts','catalog.jsonl'),'utf8'),/implementation:api:1/);
    assert.equal(fs.readFileSync(effectsPath,'utf8').includes('implementation-secret'),false);
  } finally { await adapters.shutdown(); }
} finally {
  delete process.env[secret]; await new Promise((resolve)=>server.close(resolve)); fs.rmSync(temporary,{recursive:true,force:true});
}
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.implementation-agent', suite: 'live-function' }));
