import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = path.resolve('../../../..');
const core = await import(pathToFileURL(
  path.join(repository, 'skills/nova/core/src/index.ts'),
).href);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-buster-quality-'));
const sourcePrivateKey = crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
fs.mkdirSync(path.join(temporary, 'dist'), { recursive: true });
fs.writeFileSync(path.join(temporary, 'dist', 'index.js'), 'export const fixture = true;\n');
execFileSync('git', ['init', '-q'], { cwd: temporary });
execFileSync('git', ['config', 'user.name', 'KubeClaw Test'], { cwd: temporary });
execFileSync('git', ['config', 'user.email', 'test@kubeclaw.invalid'], { cwd: temporary });
execFileSync('git', ['add', '.'], { cwd: temporary });
execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: temporary });

let contacts = 0;
const server = http.createServer((_request, response) => {
  contacts += 1;
  response.writeHead(500);
  response.end('No request is authorized for an invalid graph.');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('server unavailable');
const origin = `http://127.0.0.1:${address.port}`;
const secret = 'KUBECLAW_BUSTER_QUALITY_TOKEN';
const sourceKeyEnvironment = 'KUBECLAW_BUSTER_QUALITY_SOURCE_PRIVATE_KEY';
const token = `quality-${'a'.repeat(48)}`;
process.env[secret] = token;
process.env[sourceKeyEnvironment] = sourcePrivateKey;
const roots = ['common', 'nova', 'buster'].map(
  (role) => path.join(repository, `skills/${role}/plugins`),
);

try {
  const snapshot = core.buildRegistry(core.discoverPackages({
    installationRoots: roots,
    trustPolicy: {
      trustedBuiltinRoots: roots,
      allowedSourceDigests: new Map(),
      verifiedAttestations: new Map(),
      verifierId: 'test:buster-quality',
    },
    now: () => new Date('2026-07-26T00:00:00Z'),
  }));
  const enabled = new Set(['kubeclaw.buster-quality-gate:quality']);
  const granted = core.resolveCapabilityGrants(snapshot, {
    enabledRegistrations: enabled,
    providers: new Map([
      ['test.plan.execute', 'kubeclaw.remote-test-gate:plan'],
      ['runtime.dispatch', 'kubeclaw.runtime-dispatch:runtime'],
      ['network.http', 'kubeclaw.network-http:http'],
      ['secrets.read', 'kubeclaw.secret-resolver:secrets'],
      ['artifacts.read', 'kubeclaw.artifact-store:artifact-store'],
      ['artifacts.write', 'kubeclaw.artifact-store:artifact-store'],
    ]),
    grants: new Map([
      ['kubeclaw.buster-quality-gate:quality', new Map([
        ['test.plan.execute', { allowedRoots: [temporary] }],
        ['artifacts.read', { allowedNamespaces: ['kubeclaw.implementation-agent'] }],
        ['runtime.dispatch', { allowedAgents: ['gate'] }],
        ['artifacts.write', { allowedNamespaces: ['kubeclaw.buster-quality-gate'] }],
      ])],
      ['kubeclaw.runtime-dispatch:runtime', new Map([
        ['network.http', { allowedOrigins: [origin] }],
        ['secrets.read', { allowedNames: ['gate.agent'] }],
      ])],
      ['kubeclaw.remote-test-gate:plan', new Map([
        ['secrets.read', { allowedNames: ['buster.worker'] }],
      ])],
    ]),
  });
  const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
  const effectsPath = path.join(temporary, 'effects.jsonl');
  const adapters = new core.AdapterRuntime({
    granted,
    activated,
    configs: new Map([
      ['kubeclaw.runtime-dispatch:runtime', {
        targets: { gate: { endpoint: `${origin}/dispatch`, tokenSecret: 'gate.agent' } },
      }],
      ['kubeclaw.network-http:http', {
        allowedOrigins: [origin],
        allowedMethods: ['POST', 'GET', 'DELETE'],
        allowedHeaders: [
          'authorization',
          'content-type',
          'idempotency-key',
          'x-kubeclaw-signature',
        ],
      }],
      ['kubeclaw.secret-resolver:secrets', {
        environment: { 'gate.agent': secret, 'buster.worker': secret,
          'buster.source-private-key': sourceKeyEnvironment },
      }],
      ['kubeclaw.artifact-store:artifact-store', {
        artifactRoot: path.join(temporary, 'artifacts'),
      }],
      ['kubeclaw.remote-test-gate:plan', {
        endpoint: origin,
        authentication: 'bearer',
        tokenSecret: 'buster.worker',
        sourcePrivateKeySecret: 'buster.source-private-key',
        sourceAuthority: 'nova:production',
        stateRoot: path.join(temporary, 'provider-state'),
        allowedRepositoryRoots: [temporary],
      }],
    ]),
    effects: new core.EffectCoordinator(
      new core.FileEffectJournal(effectsPath),
      undefined,
      undefined,
      new core.MemoryResourceLockManager(),
    ),
    shutdownTimeoutMs: 1_000,
    async emitDomainEvent() {},
  });
  await adapters.start();
  try {
    assert.throws(() => new core.PipelineRunner({
      definition: {
        schemaVersion: 'pipeline-definition.v2',
        id: 'pipeline:buster-quality',
        maxConcurrency: 1,
        stages: [{
          id: 'quality',
          type: 'kubeclaw.test.quality-evaluation',
          dependsOn: [],
          config: { agent: 'gate' },
          input: {
            runId: 'run-1',
            gateId: 'quality',
            attempt: 1,
            task: 'Evaluate.',
            suiteEvidence: [{ suite: 'security', passed: true, summary: 'provider plan passed' }],
            suitePlan: {
              repositoryRoot: temporary,
              suites: [],
              testConfig: {},
              task: {},
            },
          },
          execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 5_000 },
        }],
      },
      registry: granted,
      activated,
      adapters,
      journal: new core.FileJournal(path.join(temporary, 'events.jsonl')),
    }), /schema/);
    assert.equal(contacts, 0, 'caller-owned evidence must fail before any external contact');

  } finally {
    await adapters.shutdown();
  }
} finally {
  delete process.env[secret];
  delete process.env[sourceKeyEnvironment];
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.buster-quality-gate',
  suite: 'real-runtime-rejects-caller-evidence',
}));
