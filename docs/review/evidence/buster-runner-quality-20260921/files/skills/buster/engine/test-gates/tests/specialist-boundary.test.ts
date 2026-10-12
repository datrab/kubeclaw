import { runnerExecutionPolicy } from '../../../../../tests/fixtures/test-gate/execution-policy.mts';
const MAX_REPORT_RESULTS_BYTES = runnerExecutionPolicy.reports.maximumAggregateResultBytes;
// Module boundary tests: the adapter is a deterministic fake, not a native worker.
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { buildRegistry, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';
import type { ProviderResultV1, ReportAdapterResultV1 } from '@kubeclaw/pipeline-test-gate-contract';
import { validateBusterProviderResult } from '../provider-result-validation.ts';
import { finalizeBusterReports, type BusterReportFinalizationInput,
  type ReportAdapterExecutor } from '../specialist-report-finalization.ts';

const pluginRoot = path.resolve('skills/buster/plugins');
const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
  trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
  verifierId: 'specialist-boundary-test',
} }));
const entry = registry.testProviderContracts.get('kubeclaw.direct-command@1')!;
const limits = { cpuMillis: 1000, memoryBytes: 1024 * 1024, logBytes: 1024,
  artifactBytes: 1024 * 1024, artifactFiles: 4, processes: 4 };
const plan = resolveTestPlan({ planId: 'plan:boundary', runId: 'run:boundary', project: 'boundary',
  scope: { moduleId: 'app', gateId: null }, createdAt: '2026-09-21T00:00:00.000Z',
  declaration: { tests: { probe: { uses: 'kubeclaw.direct-command@1', mode: 'blocking',
    config: { executable: 'true', resultMode: 'junit-required', reports: [{ id: 'junit', format: 'junit', path: 'report.xml', mediaType: 'application/junit+xml' }] } } } },
  suiteTemplates: [], registry, facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' },
  policy: { defaultTimeoutMs: 1000, maximumTimeoutMs: 1000, defaultLimits: limits, maximumLimits: limits,
    maximumRetryCount: 1, maximumMatrixSize: 1, maximumNodes: 1, defaultConcurrencyLimit: 1,
    maximumConcurrencyLimits: {} } });
const digest = `sha256:${'a'.repeat(64)}`;
function provider(): ProviderResultV1 {
  return { schemaVersion: 'provider-result.v1', outcome: 'passed', summary: 'command passed',
    counts: { total: 1, passed: 1, failed: 0, skipped: 0 }, findings: [], metrics: [],
    evidenceFiles: [{ evidenceId: 'junit', type: 'test-report', file: 'report.xml', mediaType: 'application/junit+xml' }],
    reports: [{ evidenceId: 'junit', format: 'junit' }], outputs: [], exitCode: 0, signal: null, providerDetails: null };
}
function input(): BusterReportFinalizationInput {
  const result = provider();
  return JSON.parse(JSON.stringify({ node: plan.nodes[0], providerResult: result, cleanupTimeoutMs: 1700, reportPolicy: runnerExecutionPolicy.reports,
    evidence: [{ evidenceId: 'junit', type: 'test-report', artifact: { artifactId: 'artifact:report',
      type: 'test-report', mediaType: 'application/junit+xml', contentDigest: digest, sizeBytes: 20,
      storageUrl: 'file:///test-only/report.xml' } }], specialistResult: {
      schemaId: 'kubeclaw.buster-provider-result.v1', schemaDigest: digest, values: { providerResult: result },
    } }));
}
function report(data: BusterReportFinalizationInput): ReportAdapterResultV1 {
  return { schemaVersion: 'report-adapter-result.v1', adapter: data.node.reportAdapters[0]!,
    sourceArtifact: data.evidence[0]!.artifact, counts: { total: 1, passed: 0, failed: 1, errored: 0, skipped: 0 },
    durationMs: 1, cases: [], casesTruncated: false, omittedCaseCount: 0,
    findings: [], findingsTruncated: false, omittedFindingCount: 0 };
}
const signal = new AbortController().signal;
function run(data: BusterReportFinalizationInput, adapt: ReportAdapterExecutor['adapt']) {
  return finalizeBusterReports(data, { registry, signal, reportAdapterRuntime: { adapt } });
}

test('serialized provider results retain size, schema, count and declaration checks', () => {
  const result = JSON.parse(JSON.stringify(provider()));
  validateBusterProviderResult(entry, result, 10000);
  assert.throws(() => validateBusterProviderResult(entry, result, 1), /TEST_PROVIDER_RESULT_LIMIT/u);
  assert.throws(() => validateBusterProviderResult(entry, { ...result, counts: {} }, 10000));
  assert.throws(() => validateBusterProviderResult(entry, { ...result,
    counts: { total: 3, passed: 1, failed: 0, skipped: 0 } }, 10000), /COUNTS_INVALID/u);
  assert.throws(() => validateBusterProviderResult(entry, { ...result,
    evidenceFiles: [result.evidenceFiles[0], result.evidenceFiles[0]] }, 10000), /EVIDENCE_DUPLICATE/u);
  assert.throws(() => validateBusterProviderResult(entry, { ...result,
    reports: [{ evidenceId: 'missing', format: 'junit' }] }, 10000), /REPORT_EVIDENCE_MISSING/u);
});

test('serialized finalization data binds retained source, adapter, limits and cancellation signal', async () => {
  const data = input(); let calls = 0;
  const result = await run(data, async (adapter, artifact, runtimeLimits, passedSignal) => {
    calls++;
    assert.equal(adapter.registration.adapterId, data.node.reportAdapters[0]!.adapterId);
    assert.equal(artifact, data.evidence[0]!.artifact); assert.equal(passedSignal, signal);
    assert.deepEqual(runtimeLimits, { maximumCases: 5000, maximumFindings: 5000, maximumCaseFindings: 100,
      maximumSourceBytes: 20, maximumResultBytes: MAX_REPORT_RESULTS_BYTES - 2, timeoutMs: 1700,
      memoryBytes: 512 * 1024 * 1024, cpuMillis: 1000, openFiles: 64 });
    return report(data);
  });
  assert.equal(calls, 1);
  assert.equal((result.values.providerResult as unknown as ProviderResultV1).outcome, 'failed');
  assert.deepEqual((result.values.providerResult as unknown as ProviderResultV1).counts,
    { total: 1, passed: 0, failed: 1, skipped: 0 });
  assert.equal(data.providerResult!.outcome, 'passed', 'input remains unchanged');
});

test('missing retained evidence and mismatched adapter package fail before adapter execution', async () => {
  const never = async (): Promise<ReportAdapterResultV1> => { throw new Error('ADAPTER_MUST_NOT_RUN'); };
  await assert.rejects(run({ ...input(), evidence: [] }, never), /REPORT_NOT_RETAINED/u);
  const data = input();
  const reference = data.node.reportAdapters[0]!;
  await assert.rejects(run({ ...data, node: { ...data.node, reportAdapters: [{ ...reference,
    package: { ...reference.package, contentDigest: `sha256:${'b'.repeat(64)}` } }] } }, never), /ADAPTER_MISSING/u);
});

test('exit-code and absent reports bypass adapters; adapter rejection remains authoritative', async () => {
  const data = input(); const never = async (): Promise<ReportAdapterResultV1> => { throw new Error('CANCELLED'); };
  assert.equal(await run({ ...data, providerResult: null }, never), data.specialistResult);
  assert.equal(await run({ ...data, node: { ...data.node, configuration: { ...data.node.configuration,
    values: { ...data.node.configuration.values, resultMode: 'exit-code' } } } }, never), data.specialistResult);
  await assert.rejects(run(data, never), /CANCELLED/u);
});

test('combined adapter output is bounded even if a fake adapter ignores its allowance', async () => {
  const data = input();
  await assert.rejects(run(data, async () => ({ ...report(data),
    findings: [{ message: 'x'.repeat(MAX_REPORT_RESULTS_BYTES) }] } as unknown as ReportAdapterResultV1)), /TEST_REPORT_RESULT_LIMIT/u);
});

test('blocking JUnit with only skipped cases fails; advisory mode preserves its result', async () => {
  const data = input();
  const adapt = async () => ({ ...report(data), counts: { total: 2, passed: 0, failed: 0, errored: 0, skipped: 2 } });
  const blocking = await run(data, adapt);
  assert.equal((blocking.values.providerResult as unknown as ProviderResultV1).outcome, 'failed');
  assert.match((blocking.values.providerResult as unknown as ProviderResultV1).summary, /NO_EXECUTED_CASES/u);
  const advisory = await run({ ...data, node: { ...data.node, mode: 'advisory' } }, adapt);
  assert.equal((advisory.values.providerResult as unknown as ProviderResultV1).outcome, 'passed');
});

test('non-command provider retains provider verdict and receives copied reports', async () => {
  const data = input(); const adapted = report(data);
  const result = await run({ ...data, node: { ...data.node,
    provider: { ...data.node.provider, contractId: 'example.custom@1' } } }, async () => adapted);
  assert.equal(result.values.providerResult, data.specialistResult.values.providerResult);
  assert.deepEqual(result.values.reports, [adapted]);
  assert.notEqual((result.values.reports as unknown[])[0], adapted);
});
