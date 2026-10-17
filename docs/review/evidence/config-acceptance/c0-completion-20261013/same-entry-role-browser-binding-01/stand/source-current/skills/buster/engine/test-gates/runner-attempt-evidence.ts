import type { EvidenceRefV1, ExecutionState, ProviderResultV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { WorkerAttemptOperation } from '@kubeclaw/worker-core';
import { detail, selectedEvidenceTypes } from './runner-values.ts';
import { validateAndMapOutputs } from './provider-result-validation.ts';
import type { RunnerProviderInput, RunnerProviderState } from './runner-provider-state.ts';

type EvidencePhase = Parameters<NonNullable<WorkerAttemptOperation['collectEvidence']>>[0];

export function addOutputEvidenceTypes(result: ProviderResultV1, selected: Set<string>): void {
  for (const output of result.outputs) {
    if (output.kind !== 'artifact') continue;
    const declaration = result.evidenceFiles.find(item => item.evidenceId === output.evidenceId);
    if (!declaration) throw new Error(`TEST_PROVIDER_OUTPUT_EVIDENCE_MISSING:${output.evidenceId}`);
    selected.add(declaration.type);
  }
  for (const report of result.reports) selected.add(
    result.evidenceFiles.find(item => item.evidenceId === report.evidenceId)!.type);
}

async function appendRunnerLog(input: RunnerProviderInput, evidence: EvidenceRefV1[],
  signal: AbortSignal): Promise<void> {
  const logEvidence = input.busterLog.write(input.runnerEvidenceDirectory);
  if (!logEvidence) return;
  const { node } = input;
  const logRefs = await input.collectEvidence(input.entry, input.attemptId, input.runnerEvidenceDirectory,
    [logEvidence], node.limits.artifactFiles - evidence.length,
    node.limits.artifactBytes - evidence.reduce((sum, item) => sum + item.artifact.sizeBytes, 0), signal);
  evidence.push(...logRefs);
}

async function selectedEvidence(input: RunnerProviderInput, state: RunnerProviderState,
  executionState: ExecutionState, selected: Set<string>, signal: AbortSignal): Promise<EvidenceRefV1[]> {
  if (executionState === 'completed' && state.providerResult) addOutputEvidenceTypes(state.providerResult, selected);
  const useErrorStaging = executionState !== 'completed';
  const files = (useErrorStaging ? state.stagedErrorFiles : state.stagedFiles).filter(item => selected.has(item.type));
  const evidence = await input.collectEvidence(input.entry, input.attemptId,
    useErrorStaging ? input.stagedErrorEvidenceDirectory : input.stagedEvidenceDirectory,
    files, input.node.limits.artifactFiles, input.node.limits.artifactBytes, signal);
  if (executionState === 'completed' && state.providerResult) state.producedOutputs = validateAndMapOutputs(
    input.entry, state.providerResult, new Map(evidence.map(item => [item.evidenceId, item])));
  if (input.retainAnyLog && selected.has('log')) await appendRunnerLog(input, evidence, signal);
  return evidence;
}

async function retainedErrorEvidence(input: RunnerProviderInput, state: RunnerProviderState,
  signal: AbortSignal): Promise<EvidenceRefV1[]> {
  let evidence: EvidenceRefV1[] = [];
  if (state.stagedErrorFiles.length > 0) {
    try {
      evidence = await input.collectEvidence(input.entry, input.attemptId, input.stagedErrorEvidenceDirectory,
        state.stagedErrorFiles, input.node.limits.artifactFiles, input.node.limits.artifactBytes, signal);
    } catch {
      signal.throwIfAborted();
      evidence = [];
    }
  }
  if (input.retainAnyLog && input.node.evidence.onError.includes('log')) {
    try {
      await appendRunnerLog(input, evidence, signal);
    } catch {
      signal.throwIfAborted();
      evidence = [];
    }
  }
  return evidence;
}

export async function collectRunnerAttemptEvidence(input: RunnerProviderInput, state: RunnerProviderState,
  phase: EvidencePhase) {
  phase.signal.throwIfAborted();
  const executionState: ExecutionState = phase.state === 'interrupted' ? 'errored' : phase.state;
  const outcome = executionState === 'completed' && state.providerResult ? state.providerResult.outcome : null;
  const selected = selectedEvidenceTypes(input.node, executionState, outcome);
  let evidence: EvidenceRefV1[];
  try {
    evidence = await selectedEvidence(input, state, executionState, selected, phase.signal);
  } catch (error) {
    phase.signal.throwIfAborted();
    state.evidenceFault = detail(error);
    state.producedOutputs = [];
    evidence = await retainedErrorEvidence(input, state, phase.signal);
  }
  return { evidence, ...(state.evidenceFault ? { error: state.evidenceFault } : {}) };
}
