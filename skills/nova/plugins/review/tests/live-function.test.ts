import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { canonicalJson } from '@kubeclaw/plugin-sdk';
import {
  FileDurableBlobStore,
  FileDurableRecordStore,
} from '@kubeclaw/plugin-foundation/observability/durable-records';
import { getReviewPolicyProfile } from '../src/review-policy-profiles.ts';

const repository = path.resolve('../../../..');
const core = await import(pathToFileURL(path.join(repository, 'skills/nova/core/src/index.ts')).href);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-review-'));
const sourceRepository = path.join(temporary, 'repository');
const artifactRoot = path.join(temporary, 'artifacts');
fs.mkdirSync(path.join(sourceRepository, 'src'), { recursive: true });
execFileSync('git', ['init', '-q'], { cwd: sourceRepository });
execFileSync('git', ['config', 'user.email', 'review@example.invalid'], { cwd: sourceRepository });
execFileSync('git', ['config', 'user.name', 'Review Test'], { cwd: sourceRepository });
fs.writeFileSync(path.join(sourceRepository, 'src/index.ts'), 'export const value = 0;\n');
execFileSync('git', ['add', '.'], { cwd: sourceRepository });
execFileSync('git', ['commit', '-qm', 'base'], { cwd: sourceRepository });
const baseRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRepository, encoding: 'utf8' }).trim();
const sourceContent = 'export const value = 1;\n';
fs.writeFileSync(path.join(sourceRepository, 'src/index.ts'), sourceContent);
execFileSync('git', ['add', '.'], { cwd: sourceRepository });
execFileSync('git', ['commit', '-qm', 'head'], { cwd: sourceRepository });
const headRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRepository, encoding: 'utf8' }).trim();
const evidenceContent = { tests: 'passed' };
const evidenceDigest = `sha256:${crypto.createHash('sha256').update(JSON.stringify(evidenceContent)).digest('hex')}`;
const evidenceRef = { kind: 'test', digest: evidenceDigest };
const sourceRef = {
  kind: 'reviewed-source', digest: `sha256:${crypto.createHash('sha256').update(sourceContent).digest('hex')}`,
};
let reviewScenario: 'pass' | 'blockers' | 'advisories' = 'pass';
let semanticVerifierRequests = 0;

async function requestJson(request: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

function echoBlockers() {
  const finding = {
    category: 'correctness', priority: 'P0', impact: 'The public contract is broken.',
    locations: [{ path: 'src/index.ts', symbol: 'value', lineHint: 1 }],
    evidence: [evidenceRef, sourceRef], recommendedFix: 'Return the required contract value.',
    changeRelation: 'introduced', scopeRelation: 'inside', evidenceStrength: 'direct',
    rootCauseHint: 'invalid-contract-value',
  };
  return {
    schemaVersion: 'echo-review-output.v1', summary: 'Three blocking instances were found.',
    inspectedEvidence: [evidenceRef, sourceRef],
    requirementAssessments: { 'REQ-1': {
      assessment: 'violated', explanation: 'The immutable evidence proves the contract break.',
      evidence: [evidenceRef],
    } },
    proposedFindings: [
      { ...finding, claim: 'The changed value violates the first caller contract.' },
      { ...finding, claim: 'The changed value violates the second caller contract.' },
      { ...finding, claim: 'A separate validation defect breaks the contract.', rootCauseHint: 'missing-contract-validation', recommendedFix: 'Validate the contract value.' },
    ],
  };
}

function echoAdvisories(payload: Record<string, unknown>) {
  const review = payload.review as Record<string, unknown>;
  const bundle = review.bundle as Record<string, unknown>;
  const evidence = bundle.evidence as Array<{ kind: string; digest: string; content: string }>;
  const candidateEvidence = evidence.find(({ kind }) => kind === 'simplification-candidates');
  assert.ok(candidateEvidence);
  const manifest = JSON.parse(candidateEvidence.content) as {
    candidates: Array<{
      candidateId: string; category: string; path: string; smallestReplacement: string;
      estimatedNetLocReduction?: number;
    }>;
  };
  const manifestRef = { kind: candidateEvidence.kind, digest: candidateEvidence.digest };
  return {
    ...passOutput,
    summary: 'The deterministic candidates support bounded simplification advice.',
    inspectedEvidence: [evidenceRef, manifestRef, sourceRef],
    proposedFindings: manifest.candidates.map((candidate, index) => ({
      category: 'simplification', priority: 'P3',
      claim: `Candidate ${index + 1} removes unused code.`, impact: 'The change reduces code size.',
      locations: [{ path: candidate.path, symbol: `unused${index + 1}`, lineHint: 1 }],
      evidence: [manifestRef, sourceRef], recommendedFix: candidate.smallestReplacement,
      changeRelation: 'introduced', scopeRelation: 'inside', evidenceStrength: 'direct',
      simplification: {
        category: candidate.category, candidateIds: [candidate.candidateId],
        smallestReplacement: candidate.smallestReplacement,
        ...(candidate.estimatedNetLocReduction === undefined
          ? {} : { estimatedNetLocReduction: candidate.estimatedNetLocReduction }),
      },
    })),
  };
}

const passOutput = {
  schemaVersion: 'echo-review-output.v1',
  summary: 'All acceptance evidence is present.',
  inspectedEvidence: [evidenceRef],
  requirementAssessments: {
    'REQ-1': {
      assessment: 'satisfied',
      explanation: 'The supplied test evidence passed.',
      evidence: [evidenceRef],
    },
  },
  proposedFindings: [],
};

const server = http.createServer((request, response) => {
  void requestJson(request).then((payload) => {
    if (payload.role === 'semantic-verifier') semanticVerifierRequests += 1;
    const review = payload.review as Record<string, unknown> | undefined;
    const bundle = review?.bundle as Record<string, unknown> | undefined;
    const task = bundle?.task as Record<string, unknown> | undefined;
    const verification = payload.verification as Record<string, unknown> | undefined;
    const proposals = verification?.proposals as Record<string, unknown> | undefined;
    const result = typeof task?.id === 'string' && task.id.startsWith('REPAIR-') ? passOutput
      : reviewScenario === 'pass' ? passOutput
      : reviewScenario === 'advisories' ? echoAdvisories(payload)
        : payload.role === 'semantic-verifier'
      ? {
          schemaVersion: 'echo-review-verification.v1',
          bundleDigest: verification?.bundleDigest,
          policyDigest: verification?.policyDigest,
          proposalSetDigest: verification?.proposalSetDigest,
          results: Object.fromEntries(Object.keys(proposals ?? {}).map((proposalId) => [proposalId, {
            verdict: 'confirmed', reason: 'The immutable evidence confirms the complete proposal.',
            evidence: [evidenceRef],
          }])),
        }
      : echoBlockers();
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ result }));
  }).catch((error: unknown) => {
    response.statusCode = 500;
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('server address unavailable');
const origin = `http://127.0.0.1:${address.port}`;
const secretName = 'KUBECLAW_REVIEW_TEST_TOKEN';
process.env[secretName] = 'local-token';

const artifactRecords = new FileDurableRecordStore(artifactRoot, {
  maximumRecords: 100_000,
  maximumBytes: 256 * 1024 * 1024,
  maximumRecordBytes: 64 * 1024,
});
const artifactBlobs = new FileDurableBlobStore(artifactRoot, 16 * 1024 * 1024);

async function storedReport(runId: string): Promise<Record<string, unknown>> {
  const catalog = (await artifactRecords.read<{ digest: string; producer: { runId: string } }>(
    'artifacts/kubeclaw.review',
  )).map(({ payload }) => payload);
  const artifact = catalog.findLast(({ producer }) => producer.runId === runId);
  assert.ok(artifact);
  return JSON.parse((await artifactBlobs.get(artifact.digest)).toString('utf8')) as Record<string, unknown>;
}

async function storedReports(runId: string, stageId: string): Promise<Record<string, unknown>[]> {
  const catalog = (await artifactRecords.read<{
    digest: string;
    producer: { runId: string; stageId: string };
  }>('artifacts/kubeclaw.review')).map(({ payload }) => payload);
  return Promise.all(catalog
    .filter(({ producer }) => producer.runId === runId && producer.stageId === stageId)
    .map(async ({ digest }) => JSON.parse((await artifactBlobs.get(digest)).toString('utf8')) as Record<string, unknown>));
}
const roots = [
  path.join(repository, 'skills/common/plugins'),
  path.join(repository, 'skills/nova/plugins'),
  path.join(repository, 'skills/buster/plugins'),
];
try {
  const snapshot = core.buildRegistry(core.discoverPackages({
    installationRoots: roots,
    trustPolicy: {
      trustedBuiltinRoots: roots,
      allowedSourceDigests: new Map(),
      verifiedAttestations: new Map(),
      verifierId: 'test:review-live',
    },
    now: () => new Date('2026-07-26T00:00:00Z'),
  }));
  const granted = core.resolveCapabilityGrants(snapshot, {
    enabledRegistrations: new Set(['kubeclaw.review:review', 'kubeclaw.repository-adapter:repository']),
    providers: new Map([
      ['runtime.dispatch', 'kubeclaw.runtime-dispatch:runtime'],
      ['network.http', 'kubeclaw.network-http:http'],
      ['secrets.read', 'kubeclaw.secret-resolver:secrets'],
      ['git.repository.read', 'kubeclaw.repository-adapter:repository'],
      ['artifacts.read', 'kubeclaw.artifact-store:artifact-store'],
      ['artifacts.write', 'kubeclaw.artifact-store:artifact-store'],
    ]),
    grants: new Map([
      ['kubeclaw.review:review', new Map([
        ['runtime.dispatch', { allowedAgents: ['reviewer'] }],
        ['git.repository.read', { allowedPrefixes: ['src'] }],
        ['artifacts.read', { allowedNamespaces: ['kubeclaw.review'] }],
        ['artifacts.write', { allowedNamespaces: ['kubeclaw.review'] }],
      ])],
      ['kubeclaw.runtime-dispatch:runtime', new Map([
        ['network.http', { allowedOrigins: [origin] }],
        ['secrets.read', { allowedNames: ['review-token'] }],
      ])],
    ]),
  });
  const activated = await core.activateRegistry(granted.snapshot, new Set([
    ...granted.grants.keys(), 'kubeclaw.repository-adapter:repository',
  ]));
  const adapters = new core.AdapterRuntime({
    granted,
    activated,
    configs: new Map([
      ['kubeclaw.runtime-dispatch:runtime', {
        targets: {
          reviewer: {
            endpoint: `${origin}/dispatch`,
            tokenSecret: 'review-token',
          },
        },
      }],
      ['kubeclaw.network-http:http', {
        allowedOrigins: [origin],
        allowedMethods: ['POST'],
        allowedHeaders: ['content-type', 'idempotency-key', 'x-kubeclaw-signature'],
      }],
      ['kubeclaw.secret-resolver:secrets', { environment: { 'review-token': secretName } }],
      ['kubeclaw.repository-adapter:repository', { repositoryRoot: sourceRepository, expectedHead: headRevision }],
      ['kubeclaw.artifact-store:artifact-store', { artifactRoot }],
    ]),
    effects: new core.EffectCoordinator(new core.FileEffectJournal(path.join(temporary, 'effects.jsonl')), undefined, undefined, new core.MemoryResourceLockManager()),
    shutdownTimeoutMs: 1000,
    async emitDomainEvent() {},
  });
  await adapters.start();
  try {
    const initialJournal = new core.FileJournal(path.join(temporary, 'events.jsonl'));
    const runner = new core.PipelineRunner({
      definition: {
        schemaVersion: 'pipeline-definition.v2',
        id: 'pipeline:review-live',
        maxConcurrency: 1,
        stages: [{
          id: 'review',
          type: 'kubeclaw.decision.review',
          dependsOn: [],
          config: { agent: 'reviewer', profile: 'gate' },
          input: {
            task: { id: 'TASK-1', statement: 'Review the implementation.' },
            revisions: { base: baseRevision },
            scope: { allowedPrefixes: ['src'] },
            requirements: [{ id: 'REQ-1', statement: 'The tests pass.' }],
            evidence: [{ kind: 'test', digest: evidenceDigest, content: evidenceContent }],
            contextCandidates: [],
          },
          execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 5000 },
        }],
      },
      registry: granted,
      activated,
      adapters,
      journal: initialJournal,
    });
    const result = await runner.run('run:review-live');
    assert.equal(result.status, 'succeeded', JSON.stringify({
      status: result.status,
      stages: [...result.stages.entries()],
      records: initialJournal.records(),
    }));
    assert.equal(result.stages.get('review')?.status, 'succeeded');

    const changedManifestDigest = `sha256:${crypto.createHash('sha256').update(canonicalJson([
      { path: 'src/index.ts', status: 'modified' },
    ])).digest('hex')}`;
    const simplificationFacts = {
      schemaVersion: 'simplification-facts.v1', revision: {
        base: baseRevision, head: headRevision, changedManifestDigest,
      },
      facts: Array.from({ length: 5 }, (_, index) => ({
        factId: `unused.value.${index + 1}`, ruleId: 'SIM001', confidence: 'high',
        path: 'src/index.ts', symbol: `unused${index + 1}`,
        basis: `Static analysis found unused value ${index + 1}.`,
        smallestReplacement: `Delete unused value ${index + 1}.`,
        estimatedNetLocReduction: index + 1,
      })),
    };
    const simplificationDigest = `sha256:${crypto.createHash('sha256').update(canonicalJson(simplificationFacts)).digest('hex')}`;
    reviewScenario = 'advisories';
    const verifierRequestsBeforeAdvisories = semanticVerifierRequests;
    for (const [profile, expectedIncluded, expectedOmitted] of [
      ['lean', 3, 2], ['audit', 5, 0],
    ] as const) {
      const runId = `run:review-live-${profile}`;
      const profileRunner = new core.PipelineRunner({
        definition: {
          schemaVersion: 'pipeline-definition.v2', id: `pipeline:review-live-${profile}`, maxConcurrency: 1,
          stages: [{
            id: 'review', type: 'kubeclaw.decision.review', dependsOn: [],
            config: { agent: 'reviewer', profile },
            input: {
              task: { id: `TASK-${profile.toUpperCase()}`, statement: `Run the ${profile} profile.` },
              revisions: { base: baseRevision }, scope: { allowedPrefixes: ['src'] },
              requirements: [{ id: 'REQ-1', statement: 'The tests pass.' }],
              evidence: [
                { kind: 'test', digest: evidenceDigest, content: evidenceContent },
                { kind: 'simplification-facts', digest: simplificationDigest, content: simplificationFacts },
              ],
              contextCandidates: [],
            },
            execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 5000 },
          }],
        },
        registry: granted, activated, adapters,
        journal: new core.FileJournal(path.join(temporary, `${profile}-events.jsonl`)),
      });
      const profileResult = await profileRunner.run(runId);
      assert.equal(profileResult.status, 'succeeded');
      const report = await storedReport(runId) as {
        profile: string; omitted: { advisory: number };
        items: Record<string, { disposition: string }>;
      };
      assert.equal(report.profile, profile);
      assert.equal(Object.values(report.items).filter(({ disposition }) => disposition === 'advisory').length, expectedIncluded);
      assert.equal(report.omitted.advisory, expectedOmitted);
    }
    assert.equal(
      semanticVerifierRequests, verifierRequestsBeforeAdvisories,
      'Simplification advisories never dispatch the semantic blocker verifier',
    );

    reviewScenario = 'blockers';
    const blockerJournal = new core.FileJournal(path.join(temporary, 'blocker-events.jsonl'));
    const gatePolicy = getReviewPolicyProfile('gate');
    const blockerStage = {
      id: 'review', type: 'kubeclaw.decision.review', dependsOn: [],
      config: { agent: 'reviewer', profile: 'gate', policy: {
        ...gatePolicy,
        limits: { ...gatePolicy.limits, maxRootCauses: 1, maxInstancesPerCluster: 1 },
      } },
      input: {
        task: { id: 'TASK-2', statement: 'Review the blocking implementation.' },
        revisions: { base: baseRevision }, scope: { allowedPrefixes: ['src'] },
        requirements: [{ id: 'REQ-1', statement: 'The contract holds.' }],
        evidence: [{ kind: 'test', digest: evidenceDigest, content: evidenceContent }],
        contextCandidates: [],
      },
      execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 5000 },
      on: { request_fix: 'repair' },
    };
    const { on: _repairRouting, ...repairTemplate } = blockerStage;
    const blockerRunner = new core.PipelineRunner({
      definition: {
        schemaVersion: 'pipeline-definition.v2', id: 'pipeline:review-live-blockers', maxConcurrency: 1,
        stages: [blockerStage, { ...repairTemplate, id: 'repair', dependsOn: ['review'] }],
      },
      registry: granted, activated, adapters, journal: blockerJournal,
    });
    const blockerResult = await blockerRunner.run('run:review-live-blockers');
    assert.equal(blockerResult.status, 'blocked');
    const completed = blockerJournal.records().find(({ entry }) => (
      entry.type === 'attempt.completed' && entry.identity.stageId === 'review'
    ));
    assert.ok(completed);
    const stageResult = completed.entry.payload.result as {
      outcome: string;
      reason: { code: string; details: { repairBatch: Record<string, unknown> } };
    };
    assert.equal(stageResult.outcome, 'request_fix');
    assert.equal(stageResult.reason.code, 'kubeclaw.review.verified_blockers');
    assert.equal(stageResult.reason.details.repairBatch.totalRootCauseCount, 2);
    assert.equal(stageResult.reason.details.repairBatch.omittedRootCauseCount, 1);
    assert.equal(stageResult.reason.details.repairBatch.totalFindingCount, 3);
    assert.equal(stageResult.reason.details.repairBatch.omittedFindingCount, 2);

    const governedRunId = 'run:review-live-governed';
    const governedJournal = new core.FileJournal(path.join(temporary, 'governed-events.jsonl'));
    const governedReview = {
      ...blockerStage,
      execution: { maxAttempts: 4, maxRemediationCycles: 4, timeoutMs: 5000 },
    };
    const governedRepair = {
      ...repairTemplate, id: 'repair', dependsOn: ['review'],
      input: {
        ...repairTemplate.input,
        task: { id: 'REPAIR-1', statement: 'Complete one deterministic repair cycle.' },
      },
      execution: { maxAttempts: 3, maxRemediationCycles: 0, timeoutMs: 5000 },
    };
    const governedRunner = new core.PipelineRunner({
      definition: {
        schemaVersion: 'pipeline-definition.v2', id: 'pipeline:review-live-governed', maxConcurrency: 1,
        stages: [governedReview, governedRepair],
      },
      registry: granted, activated, adapters, journal: governedJournal,
    });
    const governedResult = await governedRunner.run(governedRunId);
    assert.equal(governedResult.status, 'waiting');
    const reports = await storedReports(governedRunId, 'review') as Array<{
      governor: { baselineId: string; decision: string; current: { remediationCyclesUsed: number } };
      outcome: string;
    }>;
    assert.equal(reports.length, 3);
    assert.deepEqual(reports.map(({ governor }) => governor.current.remediationCyclesUsed), [0, 1, 2]);
    assert.equal(new Set(reports.map(({ governor }) => governor.baselineId)).size, 1);
    assert.deepEqual(reports.map(({ governor }) => governor.decision), ['within_scope', 'within_scope', 'cycle_exhausted']);
    assert.deepEqual(reports.map(({ outcome }) => outcome), ['request_fix', 'request_fix', 'orchestrator_required']);
    assert.equal(governedJournal.records().filter(({ entry }) => (
      entry.type === 'stage.retrying' && entry.identity.stageId === 'review'
    )).length, 0, 'ordinary retries are not used as repair cycles');
  } finally {
    await adapters.shutdown();
  }
} finally {
  delete process.env[secretName];
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'live-function' }));
