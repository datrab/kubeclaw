// These are explicit remote contract vectors, not claims of a native Buster execution.
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { adapt } from '../../../skills/buster/plugins/junit-report-adapter/src/adapter.js';
import { finalizeDirectCommandReports } from '../../../skills/buster/engine/test-gates/report-finalizer.ts';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  attemptResultDigest, nodeResultDigest, remotePlanDigest, remotePlanResultDigest,
  remotePlanResultReceipt, resolvedTestPlanDigest,
  stableTestIdentity,
  attestSourceSnapshot,
  type ArtifactRefV1, type AttemptResultV1, type NodeResultV1, type ProviderResultV1, type ReportAdapterResultV1,
  type RemotePlanJobV1, type RemotePlanResultV1, type RemotePlanStatusV1, type ResolvedTestPlanV1,
} from '../../../contracts/pipeline-test-gate/v1/src/index.ts';
import { createRemotePlanJob, HttpRemotePlanTransport } from '../../../skills/nova/core/test-gates/remote-dispatch.ts';
import {
  FileNovaGateImportStore, NovaRemoteGateImporter, gateDecisionStageResult,
} from '../../../skills/nova/core/test-gates/remote-result-import.ts';

const digest = `sha256:${'a'.repeat(64)}`;
const provider = { packageId: 'provider', packageVersion: '1.0.0', contentDigest: digest,
  registrationId: 'provider.test', contractId: 'kubeclaw.direct-command@1' };
const limits = { cpuMillis: 1000, memoryBytes: 1024, logBytes: 1024,
  artifactBytes: 1024 * 1024, artifactFiles: 10, processes: 2 };

function plan(mode: 'blocking' | 'advisory', reviewAgent: string | null): ResolvedTestPlanV1 {
  const unsigned = { schemaVersion: 'resolved-test-plan.v1' as const, planId: 'plan:import', runId: 'run:import',
    project: 'project', scope: { moduleId: 'module', gateId: null }, registrySnapshotDigest: digest,
    createdAt: '2026-08-10T03:00:00.000Z', suites: [], nodes: [{ id: 'test', executionId: 'execution:test',
      testIdentity: stableTestIdentity({ project: 'project', moduleId: 'module', gateId: null,
        suiteInstanceId: null, nodeId: 'test', variation: {} }),
      suiteInstanceId: null, kind: 'test' as const, provider, reportAdapters: [], mode, reviewAgent,
      configuration: { schemaVersion: 'provider-configuration.v1' as const, contractId: provider.contractId,
        schemaDigest: digest, values: { resultMode: 'junit-required' } }, dependencies: [], timeoutMs: 1000, limits, retryCount: 0,
      concurrencyGroup: null, parentNodeId: null, variation: {},
      evidence: { onPass: ['log'], onFail: ['log'], onError: ['log'] }, skipReason: null }],
    links: [], concurrencyLimits: { default: 1 } };
  return { ...unsigned, planDigest: resolvedTestPlanDigest(unsigned) };
}

function authorityReceipt(planDigest: string, resultDigest: string, suffix: string) {
  const receiptId = `receipt:${suffix}`;
  return { receiptId, receiptDigest: remotePlanDigest({ authorityId: `test-runner:${planDigest}`, receiptId, resultDigest }) };
}

function completed(job: RemotePlanJobV1, options: {
  outcome: 'passed' | 'failed'; state?: 'completed' | 'errored'; artifact?: ArtifactRefV1;
  reportFailure?: boolean; cleanup?: boolean; reports: ReportAdapterResultV1[]; counts: ProviderResultV1['counts'];
}): { status: RemotePlanStatusV1; result: RemotePlanResultV1 } {
  const node = job.plan.nodes[0]!;
  const attemptUnsigned = { schemaVersion: 'attempt-result.v1' as const, planId: job.plan.planId,
    runId: job.plan.runId, moduleId: job.plan.scope.moduleId, gateId: job.plan.scope.gateId,
    suiteInstanceId: null, nodeId: node.id, executionId: node.executionId, testIdentity: node.testIdentity, nodeKind: node.kind,
    attemptId: 'attempt:test:1', attemptNumber: 1, provider: node.provider, mode: node.mode,
    executionState: options.state ?? 'completed', outcome: options.state === 'errored' ? null : options.outcome,
    startedAt: '2026-08-10T03:00:01.000Z', completedAt: '2026-08-10T03:00:02.000Z', durationMs: 1000,
    summary: options.outcome, counts: options.counts, findings: [], metrics: [],
    reports: options.reports,
    evidence: options.artifact ? [{ evidenceId: 'junit', type: options.artifact.type, artifact: options.artifact }] : [],
    outputs: [], resources: { logBytes: 0, artifactBytes: options.artifact?.sizeBytes ?? 0 },
    exitCode: options.state === 'errored' ? null : options.outcome === 'passed' ? 0 : 1,
    signal: null, providerDetails: null };
  const attemptDigest = attemptResultDigest(attemptUnsigned);
  const attempt: AttemptResultV1 = { ...attemptUnsigned, resultDigest: attemptDigest,
    receipt: authorityReceipt(job.plan.planDigest, attemptDigest, 'attempt') };
  const nodeUnsigned = { schemaVersion: 'node-result.v1' as const, planId: job.plan.planId, runId: job.plan.runId,
    moduleId: job.plan.scope.moduleId, gateId: job.plan.scope.gateId, suiteInstanceId: null,
    nodeId: node.id, executionId: node.executionId, testIdentity: node.testIdentity, nodeKind: node.kind, mode: node.mode,
    state: options.state ?? 'completed', outcome: options.state === 'errored' ? null : options.outcome,
    attemptIds: [attempt.attemptId], finalAttemptId: attempt.attemptId, unstable: false, skipReason: null };
  const nodeDigest = nodeResultDigest(nodeUnsigned);
  const resultNode: NodeResultV1 = { ...nodeUnsigned, resultDigest: nodeDigest,
    receipt: authorityReceipt(job.plan.planDigest, nodeDigest, 'node') };
  const resultUnsigned = { schemaVersion: 'buster-plan-result.v1' as const,
    workerRevision: 'a'.repeat(40), jobId: job.jobId,
    planId: job.plan.planId, planDigest: job.plan.planDigest, runId: job.plan.runId,
    attempts: [attempt], nodes: [resultNode], cleanupErrors: options.cleanup ? [{ nodeId: node.id, message: 'cleanup' }] : [],
    completedAt: '2026-08-10T03:00:03.000Z' };
  const resultDigest = remotePlanResultDigest(resultUnsigned);
  const result: RemotePlanResultV1 = { ...resultUnsigned, resultDigest, receipt: remotePlanResultReceipt(job.jobId, resultDigest) };
  const bytes = Buffer.from(JSON.stringify(result));
  const contentDigest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  return { result, status: { schemaVersion: 'buster-plan-status.v1', jobId: job.jobId, requestDigest: job.requestDigest,
    state: 'completed', submittedAt: job.submittedAt, updatedAt: result.completedAt,
    result: { schemaVersion: 'buster-plan-result-ref.v1', resultDigest, contentDigest, sizeBytes: bytes.byteLength }, error: null } };
}

const archive = Buffer.from('archive');
const sourceSnapshotPrivateKey = crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
const sourceSnapshot = attestSourceSnapshot({ schemaVersion: 'source-snapshot.v1' as const, sourceType: 'git-commit' as const,
  pipelineStageId: 'stage:test-gate',
  repositoryId: 'repository:import', revision: `git:${'a'.repeat(40)}`, tree: `git:${'b'.repeat(40)}`,
  archiveContentDigest: `sha256:${crypto.createHash('sha256').update(archive).digest('hex')}`,
  archiveSizeBytes: archive.byteLength, creatorAuthority: 'nova:test' }, sourceSnapshotPrivateKey);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'junit-execution-required-'));
const recordLimits = { maximumRecords: 100, maximumBytes: 8 * 1024 * 1024, maximumRecordBytes: 2 * 1024 * 1024 };
const scenarios = [
  { name: 'all-skipped', source: "test('skip', {skip:true},()=>{});", executed: false, failed: false },
  { name: 'mixed', source: "test('skip', {skip:true},()=>{}); test('pass',()=>{});", executed: true, failed: false },
  { name: 'passed', source: "test('pass',()=>{});", executed: true, failed: false },
  { name: 'failed', source: "test('fail',()=>{throw new Error('actual failure')});", executed: true, failed: true },
  { name: 'zero', source: '', executed: false, failed: false, xml: '<testsuite/>' },
  { name: 'errored', source: '', executed: true, failed: true, xml: '<testsuite><testcase name="error"><error message="runtime error"/></testcase></testsuite>' },
];
try {
  for (const scenario of scenarios) {
    const source = path.join(root, `${scenario.name}.mjs`);
    const reportFile = path.join(root, `${scenario.name}.xml`);
    fs.writeFileSync(source, `import test from 'node:test';\n${scenario.source}`);
    const child = spawnSync(process.execPath, ['--test', '--test-reporter=junit', `--test-reporter-destination=${reportFile}`, source]);
    assert.equal(child.status, scenario.failed && !scenario.xml ? 1 : 0, child.stderr.toString());
    // Explicit XML contract vectors cover cases Node's reporter does not emit.
    if (scenario.xml) fs.writeFileSync(reportFile, scenario.xml);
    const bytes = fs.readFileSync(reportFile);
    const artifact: ArtifactRefV1 = { artifactId: `artifact:${scenario.name}`, type: 'test-report', mediaType: 'application/junit+xml',
      contentDigest: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`, sizeBytes: bytes.length, storageUrl: pathToFileURL(reportFile).href };
    const parsed = adapt({bytes, mediaType: artifact.mediaType, limits: {maximumCases: 100, maximumFindings: 100, maximumCaseFindings: 10}});
    const report: ReportAdapterResultV1 = { schemaVersion: 'report-adapter-result.v1',
      adapter: {adapterId:'junit',format:'junit',contractVersion:1,package:{packageId:'kubeclaw.junit-report',packageVersion:'1.0.0',contentDigest:digest}},
      sourceArtifact: artifact, ...parsed };
    for (const mode of ['blocking', 'advisory'] as const) {
      const base: ProviderResultV1 = {schemaVersion:'provider-result.v1',outcome:scenario.failed?'failed':'passed',summary:'actual Node exit',
        counts:{total:1,passed:scenario.failed?0:1,failed:scenario.failed?1:0,skipped:0},
        findings:[],metrics:[],evidenceFiles:[],reports:[{evidenceId:'junit',format:'junit'}],outputs:[],exitCode:child.status,signal:null,providerDetails:null};
      const zero = scenario.name === 'zero';
      if (zero) assert.throws(()=>finalizeDirectCommandReports(base,[report],mode==='blocking'), /TEST_REPORT_ZERO_CASES/u);
      // A zero-case terminal is a defensive Nova input vector; Buster rejects it above.
      const finalized = zero ? {...base, counts:{total:0,passed:0,failed:0,skipped:0}}
        : finalizeDirectCommandReports(base,[report],mode==='blocking');
      const missing = !scenario.executed && mode==='blocking';
      if (!zero) assert.equal(finalized.outcome, missing||scenario.failed?'failed':'passed');
      assert.equal(finalized.counts.failed, parsed.counts.failed + parsed.counts.errored);
      if (missing && !zero) assert.match(finalized.summary,/TEST_REPORT_NO_EXECUTED_CASES/u);
      if (scenario.name==='mixed') assert.match(finalized.summary,/1 JUnit case\(s\) passed; 1 skipped/u);
      // A forged/old passed outcome must also fail Nova's independent report check.
      for (const remoteOutcome of new Set([finalized.outcome, 'passed'] as const)) {
        const key = `${scenario.name}:${mode}:${remoteOutcome}`;
        const job = createRemotePlanJob({idempotencyKey:key,pipelineStageId:'stage:test-gate',plan:plan(mode,'buster'),
          sourceSnapshot,repositoryArchive:archive,grants:new Map([['test',[]]]),maximumConcurrency:1,submittedAt:'2026-08-10T03:00:00.000Z'});
        const terminal = completed(job,{outcome:remoteOutcome,artifact,reports:[report],counts:finalized.counts});
        const server = http.createServer((request,response)=>{
          if (request.url?.includes('/evidence/')) response.end(bytes);
          else if(request.url?.includes('/results/')) response.end(JSON.stringify(terminal.result));
          else {response.statusCode=404;response.end();}
        });
        server.listen(0,'127.0.0.1'); await once(server,'listening');
        try {
          const address=server.address(); assert(address&&typeof address!=='string');
          const transport=new HttpRemotePlanTransport({endpoint:`http://127.0.0.1:${address.port}`,authentication:'spiffe-proxy',maximumResponseBytes:2*1024*1024});
          const storePath=path.join(root,key);
          const store=new FileNovaGateImportStore(storePath,{recordLimits,maximumEvidenceStoreBytes:2*1024*1024});
          const importer=new NovaRemoteGateImporter({store,evidence:transport,results:transport,maximumEvidenceBytes:2*1024*1024,maximumResultBytes:2*1024*1024});
          const decision=await importer.import(job,terminal.status);
          assert.equal(decision.state,mode==='blocking'&&(missing||scenario.failed)?'failed':'passed');
          assert.equal(decision.reviews.length,0);
          if(missing) assert.match(decision.nodes[0]!.reason,/TEST_REPORT_NO_EXECUTED_CASES/u);
          assert.equal(gateDecisionStageResult(decision).outcome,decision.state==='failed'?'request_fix':'passed');
          const reopened=new FileNovaGateImportStore(storePath,{recordLimits,maximumEvidenceStoreBytes:2*1024*1024});
          assert.equal((await reopened.readExecutionGraphs())[0]!.decisionDigest,decision.decisionDigest);
        } finally {server.close();await once(server,'close');}
      }
    }
  }
  console.log('PASS actual Node JUnit files -> original parser/finalizer; HTTP import and durable decision reconstruction; no native runner claim');
} finally {fs.rmSync(root,{recursive:true,force:true});}
