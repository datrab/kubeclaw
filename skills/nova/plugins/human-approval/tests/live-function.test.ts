import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = path.resolve('../../../..');
const core = await import(pathToFileURL(
  path.join(repository, 'skills/common/plugin-runtime/core/src/index.ts'),
).href);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-human-approval-'));
const waitJournal = path.join(temporary, 'waits.jsonl');
const received = [];
const server = http.createServer((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    received.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
    });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ id: `message-${received.length}` }));
  });
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('test server address is unavailable');
const origin = `http://127.0.0.1:${address.port}`;
const endpoint = `${origin}/approval`;
const secretEnvironmentName = 'KUBECLAW_HUMAN_APPROVAL_TEST_TOKEN';
const previousSecret = process.env[secretEnvironmentName];
process.env[secretEnvironmentName] = 'real-local-test-token';

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
      verifierId: 'test:human-approval-live-function',
    },
    now: () => new Date('2026-07-26T00:00:00Z'),
  }));
  return core.resolveCapabilityGrants(snapshot, {
    enabledRegistrations: new Set(['kubeclaw.human-approval:approval']),
    providers: new Map([
      ['operator.request', 'kubeclaw.operator-messaging:operator'],
      ['signal.wait', 'kubeclaw.wait-store:waits'],
      ['network.http', 'kubeclaw.network-http:http'],
      ['secrets.read', 'kubeclaw.secret-resolver:secrets'],
    ]),
    grants: new Map([
      ['kubeclaw.human-approval:approval', new Map([
        ['operator.request', { allowedTargets: ['release-operators'] }],
        ['signal.wait', {
          allowedSignalTypes: ['approval.resolved'],
          allowedIssuerIds: ['operator:release'],
        }],
      ])],
      ['kubeclaw.operator-messaging:operator', new Map([
        ['network.http', { allowedOrigins: [origin] }],
        ['secrets.read', { allowedNames: ['approval-webhook-token'] }],
      ])],
    ]),
  });
}

async function run(id, guidance) {
  const granted = grantedRegistry();
  const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
  const effectsPath = path.join(temporary, `${id}-effects.jsonl`);
  const adapters = new core.AdapterRuntime({
    granted,
    activated,
    configs: new Map([
      ['kubeclaw.operator-messaging:operator', {
        targets: {
          'release-operators': {
            endpoint,
            tokenSecret: 'approval-webhook-token',
          },
        },
      }],
      ['kubeclaw.wait-store:waits', { journalPath: waitJournal }],
      ['kubeclaw.network-http:http', {
        allowedOrigins: [origin],
        allowedMethods: ['POST'],
        allowedHeaders: ['content-type', 'idempotency-key', 'x-kubeclaw-signature'],
      }],
      ['kubeclaw.secret-resolver:secrets', {
        environment: { 'approval-webhook-token': secretEnvironmentName },
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
  const journalPath = path.join(temporary, `${id}-events.jsonl`);
  try {
    const runner = new core.PipelineRunner({
      definition: {
        schemaVersion: 'pipeline-definition.v2',
        id: `pipeline:${id}`,
        maxConcurrency: 1,
        stages: [{
          id: 'approval',
          type: 'kubeclaw.decision.human-approval',
          dependsOn: [],
          config: {
            target: 'release-operators',
            issuerId: 'operator:release',
            timeoutMinutes: 5,
          },
          input: { summary: 'Approve the production release.' },
          execution: { maxAttempts: 2, maxRemediationCycles: 0, timeoutMs: 10_000 },
        }],
      },
      registry: granted,
      activated,
      adapters,
      journal: new core.FileJournal(journalPath),
      ...(guidance === undefined
        ? {}
        : { resumeGuidance: new Map([['approval', guidance]]) }),
    });
    const result = await runner.run(`run:${id}`);
    const records = fs.readFileSync(journalPath, 'utf8').trim().split('\n').map(JSON.parse);
    const completed = records.findLast(({ entry }) => entry.type === 'attempt.completed');
    return {
      status: result.status,
      stage: result.stages.get('approval'),
      outcome: completed?.entry.payload.outcome,
    };
  } finally {
    await adapters.shutdown();
  }
}

try {
  const approved = await run('approved', {
    decision: 'approved',
    issuer: { type: 'operator', id: 'operator:release' },
  });
  assert.equal(approved.status, 'succeeded');
  assert.equal(approved.outcome, 'passed');
  assert.equal(received.length, 0);
  assert.equal(fs.existsSync(waitJournal), false);

  const rejected = await run('rejected', {
    decision: 'rejected',
    issuer: { type: 'operator', id: 'operator:release' },
    reason: 'Release checklist is incomplete.',
  });
  assert.equal(rejected.status, 'blocked');
  assert.equal(rejected.outcome, 'blocked');
  assert.equal(received.length, 0);
  assert.equal(fs.existsSync(waitJournal), false);

  const pending = await run('pending', { decision: 'pending' });
  assert.equal(pending.status, 'waiting');
  assert.equal(pending.outcome, 'wait');
  assert.equal(pending.stage.wait.signalType, 'approval.resolved');
  assert.deepEqual(pending.stage.wait.authorizedIssuer, {
    type: 'operator',
    id: 'operator:release',
  });
  assert.equal(received.length, 1);
  assert.equal(received[0].method, 'POST');
  assert.equal(received[0].url, '/approval');
  assert.equal(received[0].headers.authorization, undefined);
  const exactBody = JSON.stringify(received[0].body);
  const expectedSignature = crypto
    .createHmac('sha256', 'real-local-test-token')
    .update(`${received[0].headers['idempotency-key']}.${exactBody}`, 'utf8')
    .digest('hex');
  assert.equal(received[0].headers['x-kubeclaw-signature'], `v1=${expectedSignature}`);
  assert.equal(received[0].body.type, 'approval.requested');
  assert.equal(received[0].body.summary, 'Approve the production release.');
  assert.equal(received[0].body.authorizedIssuer.id, 'operator:release');

  const waits = fs.readFileSync(waitJournal, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(waits.length, 1);
  assert.equal(waits[0].schemaVersion, 'wait-record.v2');
  assert.equal(waits[0].wait.signalType, 'approval.resolved');
  assert.equal(waits[0].wait.request.summary, 'Approve the production release.');
  assert.equal(waits[0].wait.expiresAt, received[0].body.expiresAt);
  const effectJournals = fs.readdirSync(temporary)
    .filter((entry) => entry.endsWith('-effects.jsonl'))
    .map((entry) => fs.readFileSync(path.join(temporary, entry), 'utf8'))
    .join('\n');
  assert.doesNotMatch(effectJournals, /real-local-test-token/);
  assert.doesNotMatch(effectJournals, /authorization/i);

  const denied = await run('invalid-issuer', {
    decision: 'approved',
    issuer: { type: 'operator', id: 'operator:other' },
  });
  assert.equal(denied.status, 'blocked');
  assert.equal(received.length, 1);
  assert.equal(fs.readFileSync(waitJournal, 'utf8').trim().split('\n').length, 1);
} finally {
  await new Promise((resolve) => server.close(resolve));
  if (previousSecret === undefined) delete process.env[secretEnvironmentName];
  else process.env[secretEnvironmentName] = previousSecret;
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.human-approval',
  suite: 'live-function',
}));
