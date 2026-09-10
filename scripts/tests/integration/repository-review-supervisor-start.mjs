import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { repositoryReviewRunRoot } from '../../lib/repository-review-run-root.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');

test('original supervisor visibly rejects missing platform, then starts a genuine finite original pipeline', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'supervisor-native-start-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = name => path.join(root, name);
  const write = (name, value) => fs.writeFileSync(file(name), JSON.stringify(value));
  const runId = 'supervisor-native-start';
  const storageRoot = file('state'), artifactRoot = file('artifacts');
  const roots = ['skills/common/plugins', 'skills/nova/plugins', 'skills/buster/plugins'].map(value => path.join(repositoryRoot, value));
  const args = [path.join(repositoryRoot, 'scripts/supervise-repository-review.mjs'),
    '--workdir', repositoryRoot, '--platform', file('platform.json'), '--graph', file('pipeline.json'),
    '--run-id', runId, '--heartbeat', file('heartbeat.json'), '--resource-log', file('resources.jsonl'),
    '--diagnostic-dir', file('diagnostics'), '--log', file('pipeline.log'), '--lease', file('lease.json'),
    '--max-recoveries', '0', '--initial-mode', 'start'];
  const invoke = () => spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30000 });
  const missing = invoke();
  console.log(JSON.stringify({ phase: 'missing-platform', status: missing.status, stdout: missing.stdout, stderr: missing.stderr }));
  assert.equal(missing.error, undefined);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /REVIEW_SUPERVISOR_STATUS_FAILED/u);
  assert.equal(missing.stdout, '');
  assert.equal(fs.existsSync(file('lease.json')), false);
  assert.equal(fs.existsSync(storageRoot), false);
  fs.mkdirSync(file('repository/modules/supervisor'), { recursive: true });
  fs.writeFileSync(file('repository/modules/supervisor/FORGE.md'), 'Original finite preflight declaration.\n```kubeclaw-deliverables\n'
    + JSON.stringify({ schemaVersion: 'forge-deliverables.v1', moduleId: 'supervisor', substep: null, deliverables: ['proof.txt'] }) + '\n```\n');
  write('platform.json', { schemaVersion: 'pipeline-platform.v2', installationRoots: roots, trustedBuiltinRoots: roots,
    externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} }, storageRoot, shutdownTimeoutMs: 1000,
    orchestratorIssuerId: 'supervisor-native-test', administrativeDecisionIssuers: [],
    providers: { 'git.repository.read': 'kubeclaw.repository-adapter:repository', 'artifacts.write': 'kubeclaw.artifact-store:artifact-store' },
    grants: { 'kubeclaw.preflight-contract:validate': { 'git.repository.read': { allowedPrefixes: ['modules/'] }, 'artifacts.write': { allowedNamespaces: ['kubeclaw.preflight-contract'] } } },
    adapters: { 'kubeclaw.repository-adapter:repository': { repositoryRoot: file('repository') }, 'kubeclaw.artifact-store:artifact-store': { artifactRoot } },
    activeAdapters: [], observers: {} });
  write('pipeline.json', { schemaVersion: 'pipeline-definition.v2', id: 'pipeline:supervisor-native-start', maxConcurrency: 1,
    stages: [{ id: 'original-preflight', type: 'kubeclaw.validate.preflight-contract', dependsOn: [], config: {},
      input: { moduleId: 'supervisor', modulePath: 'modules/supervisor', ownedPaths: ['proof.txt'], serveDockerfile: null, apiSpecFile: null },
      execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 10000 } }] });
  const started = invoke();
  const pipelineOutput = fs.existsSync(file('pipeline.log')) ? fs.readFileSync(file('pipeline.log'), 'utf8') : '';
  console.log(JSON.stringify({ phase: 'readable-platform', status: started.status, stdout: started.stdout, stderr: started.stderr, pipelineOutput }));
  assert.equal(started.error, undefined);
  assert.equal(started.status, 0, pipelineOutput + started.stderr);
  assert.equal(JSON.parse(started.stdout).status, 'succeeded');
  const events = fs.readFileSync(path.join(repositoryReviewRunRoot(storageRoot, runId), 'events.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line).entry);
  for (const type of ['run.started', 'stage.started', 'attempt.created', 'effect.requested', 'effect.completed', 'stage.succeeded', 'run.succeeded']) assert(events.some(event => event.type === type), type);
  const effects = events.filter(event => event.type === 'effect.requested').map(event => event.payload.capability);
  assert(effects.includes('git.repository.read'));
  assert(effects.includes('artifacts.write'));
  const artifacts = JSON.parse(fs.readFileSync(path.join(artifactRoot, 'records/store.json'), 'utf8')).records;
  assert(artifacts.some(record => record.payload.producer.runId === runId));
  assert.equal(fs.existsSync(file('lease.json')), false);
  const diagnostic = JSON.parse(fs.readFileSync(file('diagnostics/attempt-1-exit.json'), 'utf8'));
  assert.equal(diagnostic.mode, 'start');
  assert.equal(diagnostic.exit.code, 0);
  assert.equal(diagnostic.exit.signal, null);
  console.log(JSON.stringify({ phase: 'original-core-evidence', eventTypes: events.map(event => event.type), effects, artifacts: artifacts.length, diagnostic }));
});
