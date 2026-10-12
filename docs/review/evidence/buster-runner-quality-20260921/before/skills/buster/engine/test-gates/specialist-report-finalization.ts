import { canonical } from './canonical-value.ts';
import type { EvidenceRefV1, ProviderResultV1, ReportAdapterRefV1, ReportAdapterResultV1,
  ResolvedPlanNodeV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { RegistrySnapshot, ReportAdapterRegistryEntry } from '@kubeclaw/plugin-foundation/registry/types';
import type { WorkerAttemptOperation } from '@kubeclaw/worker-core';
import type { ReportAdapterRuntimeLimits } from './report-adapter-runtime.ts';
import { finalizeDirectCommandReports } from './report-finalizer.ts';
import { validateProviderResultCounts } from './provider-result-validation.ts';

export const MAX_REPORT_RESULTS_BYTES = 16 * 1024 * 1024;
export interface ReportAdapterExecutor {
  adapt(entry: ReportAdapterRegistryEntry, artifact: EvidenceRefV1['artifact'], limits: ReportAdapterRuntimeLimits,
    signal?: AbortSignal): Promise<ReportAdapterResultV1>;
}

type FinalizationContext = Parameters<NonNullable<WorkerAttemptOperation['finalizeResult']>>[0];
/** Existing contract data only; executable dependencies are supplied separately. */
export interface BusterReportFinalizationInput {
  readonly node: ResolvedPlanNodeV1;
  readonly providerResult: ProviderResultV1 | null;
  readonly evidence: FinalizationContext['evidence'];
  readonly specialistResult: FinalizationContext['specialistResult'];
  readonly cleanupTimeoutMs: number;
}
export interface BusterReportFinalizationDependencies {
  readonly registry: RegistrySnapshot;
  readonly reportAdapterRuntime: ReportAdapterExecutor;
  readonly signal: AbortSignal;
}

function reportAdapterEntry(registry: RegistrySnapshot, reference: ReportAdapterRefV1): ReportAdapterRegistryEntry {
  const entry = [...registry.reportAdapters.values()].find((candidate) =>
    candidate.registration.adapterId === reference.adapterId
    && candidate.registration.format === reference.format
    && candidate.registration.contractVersion === reference.contractVersion
    && canonical(candidate.registration.package) === canonical(reference.package));
  if (!entry) throw new Error(`TEST_REPORT_ADAPTER_MISSING:${reference.format}`);
  return entry;
}

export async function finalizeBusterReports(
  { node, providerResult, evidence, specialistResult, cleanupTimeoutMs }: BusterReportFinalizationInput,
  { registry, reportAdapterRuntime, signal }: BusterReportFinalizationDependencies,
): Promise<FinalizationContext['specialistResult']> {
  if (node.provider.contractId === 'kubeclaw.direct-command@1'
    && node.configuration.values.resultMode === 'exit-code') return specialistResult;
  if (!providerResult || providerResult.reports.length === 0) return specialistResult;
  const evidenceById = new Map(evidence.map((item) => [item.evidenceId, item]));
  const reports: ReportAdapterResultV1[] = [];
  for (const declared of providerResult.reports) {
    const usedReportBytes = Buffer.byteLength(JSON.stringify(reports));
    const remainingReportBytes = MAX_REPORT_RESULTS_BYTES - usedReportBytes;
    if (remainingReportBytes < 1) throw new Error('TEST_REPORT_RESULT_LIMIT');
    const source = evidenceById.get(declared.evidenceId);
    if (!source) throw new Error(`TEST_PROVIDER_REPORT_NOT_RETAINED:${declared.evidenceId}`);
    const reference = node.reportAdapters.find((item) => item.format === declared.format);
    if (!reference) throw new Error(`TEST_REPORT_ADAPTER_NOT_RESOLVED:${declared.format}`);
    const adapter = reportAdapterEntry(registry, reference);
    const maximumSourceBytes = Math.max(1, Math.min(64 * 1024 * 1024, source.artifact.sizeBytes));
    const adapterTimeoutMs = Math.min(5 * 60 * 1_000, cleanupTimeoutMs);
    reports.push(await reportAdapterRuntime.adapt(adapter, source.artifact, {
      maximumCases: 5_000,
      maximumFindings: 5_000,
      maximumCaseFindings: 100,
      maximumSourceBytes,
      maximumResultBytes: remainingReportBytes,
      timeoutMs: adapterTimeoutMs,
      memoryBytes: 512 * 1024 * 1024,
      cpuMillis: Math.max(1_000, Math.floor(adapterTimeoutMs / 1_000) * 1_000),
      openFiles: 64,
    }, signal));
    if (Buffer.byteLength(JSON.stringify(reports)) > MAX_REPORT_RESULTS_BYTES) {
      throw new Error('TEST_REPORT_RESULT_LIMIT');
    }
  }
  const providerValue = specialistResult.values.providerResult as unknown as ProviderResultV1;
  if (node.provider.contractId !== 'kubeclaw.direct-command@1') {
    return {
      ...specialistResult,
      values: { ...specialistResult.values, reports: structuredClone(reports) } as never,
    };
  }
  const finalizedProvider = finalizeDirectCommandReports(providerValue, reports,
    node.mode === 'blocking' && node.configuration.values.resultMode === 'junit-required');
  validateProviderResultCounts(finalizedProvider);
  return {
    ...specialistResult,
    values: { ...specialistResult.values, providerResult: finalizedProvider,
      reports: structuredClone(reports) } as never,
  };
}
