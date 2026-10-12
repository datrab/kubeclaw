import fs from 'node:fs';
import type { TestProviderExecutionContext } from '@kubeclaw/plugin-sdk';
import { sha256Digest, type WorkerAttemptOperation, type WorkerAttemptOperationResult } from '@kubeclaw/worker-core';
import { stageEvidenceFiles } from './artifacts.ts';
import { validateBusterProviderResult } from './provider-result-validation.ts';
import { finalizeBusterReports } from './specialist-report-finalization.ts';
import { freeze, selectedEvidenceTypes } from './runner-values.ts';
import { addOutputEvidenceTypes, collectRunnerAttemptEvidence } from './runner-attempt-evidence.ts';
import type { RunnerProviderInput, RunnerProviderState } from './runner-provider-state.ts';

type ExecutionContext = Parameters<WorkerAttemptOperation['execute']>[0];

function providerContext(input: RunnerProviderInput, context: ExecutionContext): TestProviderExecutionContext {
  return input.context(context.signal, (stream, value) => {
    input.busterLog.contextLog(stream, value);
    context.log(stream, value);
  }, new Set(input.granted), input.invocation.inputs);
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new Error('TEST_PROVIDER_CANCELLED');
}

async function initializeProvider(input: RunnerProviderInput, state: RunnerProviderState,
  workerContext: ExecutionContext, context: TestProviderExecutionContext): Promise<void> {
  state.loadWork = input.loader.load(input.entry, input.invocation, input.workspaceRoot, workerContext.signal);
  state.instance = await state.loadWork;
  assertNotAborted(workerContext.signal);
  if (input.node.kind === 'fixture') {
    state.fixtureInitializationStarted = true;
    const supportsCleanup = await state.instance.supportsCleanup(context);
    assertNotAborted(workerContext.signal);
    if (!supportsCleanup) throw new Error('TEST_PROVIDER_FIXTURE_CLEANUP_REQUIRED');
  }
  assertNotAborted(workerContext.signal);
}

async function stageProviderEvidence(input: RunnerProviderInput, state: RunnerProviderState,
  selected: Set<string>, signal: AbortSignal): Promise<void> {
  const candidates = state.providerResult!.evidenceFiles.filter(item => input.node.evidence.onError.includes(item.type));
  try {
    await stageEvidenceFiles(input.evidenceDirectory, input.stagedErrorEvidenceDirectory, candidates,
      input.node.limits.artifactFiles, input.node.limits.artifactBytes, signal);
    state.stagedErrorFiles = candidates;
  } catch (error) {
    await fs.promises.rm(input.stagedErrorEvidenceDirectory, { recursive: true, force: true });
    state.stagedErrorFiles = [];
    if (signal.aborted) throw error;
  }
  state.stagedFiles = state.providerResult!.evidenceFiles.filter(item => selected.has(item.type));
  await stageEvidenceFiles(input.evidenceDirectory, input.stagedEvidenceDirectory, state.stagedFiles,
    input.node.limits.artifactFiles, input.node.limits.artifactBytes, signal);
}

async function executeProvider(input: RunnerProviderInput, state: RunnerProviderState,
  workerContext: ExecutionContext): Promise<WorkerAttemptOperationResult> {
  const context = providerContext(input, workerContext);
  await initializeProvider(input, state, workerContext, context);
  state.executionStarted = true;
  state.providerResult = await state.instance!.execute(input.invocation, context);
  validateBusterProviderResult(input.entry, state.providerResult, input.providerResultLimit);
  state.providerResult = freeze(structuredClone(state.providerResult));
  const selected = selectedEvidenceTypes(input.node, 'completed', state.providerResult.outcome);
  addOutputEvidenceTypes(state.providerResult, selected);
  state.stagingWork = stageProviderEvidence(input, state, selected, workerContext.signal);
  await state.stagingWork;
  state.retainFixture = input.node.kind === 'fixture' && state.providerResult.outcome === 'passed';
  return {
    summary: state.providerResult.summary,
    specialistResult: {
      schemaId: 'kubeclaw.buster-provider-result.v1',
      schemaDigest: sha256Digest({ schemaId: 'kubeclaw.buster-provider-result.v1' }),
      values: { providerResult: structuredClone(state.providerResult) } as never,
    },
    evidence: [], exitCode: state.providerResult.exitCode, signal: state.providerResult.signal,
  };
}

async function cleanupProviderOperation(input: RunnerProviderInput, state: RunnerProviderState,
  workerContext: ExecutionContext): Promise<void> {
  if (!state.executionStarted && !state.fixtureInitializationStarted) {
    await state.instance?.discard?.();
    return;
  }
  if (!state.instance?.cleanup || state.retainFixture) return;
  await state.instance.cleanup(input.invocation, providerContext(input, workerContext));
}

export function createRunnerProviderOperation(input: RunnerProviderInput, state: RunnerProviderState,
  preparationFault: Error | null, missingCapability: string | undefined): WorkerAttemptOperation {
  return {
    prepare: () => {
      if (preparationFault) throw preparationFault;
      if (missingCapability) throw new Error(`TEST_PROVIDER_CAPABILITY_DENIED:${missingCapability}`);
      return undefined;
    },
    execute: context => executeProvider(input, state, context),
    terminate: async () => {
      const loaded = state.instance ?? (await state.loadWork?.catch(() => null));
      await loaded?.terminate();
      await state.stagingWork?.catch(() => undefined);
    },
    measure: async () => {
      const measured = state.instance?.resources() ?? { cpuTimeMs: 0, maximumMemoryBytes: 0, maximumProcesses: 0 };
      return { cpuTimeMs: Math.ceil(measured.cpuTimeMs ?? 0),
        maximumMemoryBytes: Math.ceil(measured.maximumMemoryBytes ?? 0),
        maximumProcesses: Math.ceil(measured.maximumProcesses ?? 0) };
    },
    cleanup: context => cleanupProviderOperation(input, state, context),
    collectEvidence: phase => collectRunnerAttemptEvidence(input, state, phase),
    finalizeResult: ({ evidence, specialistResult, signal }) => finalizeBusterReports(
      { node: input.node, providerResult: state.providerResult, evidence, specialistResult, cleanupTimeoutMs: input.cleanupTimeoutMs, reportPolicy: input.options.executionPolicy.reports },
      { registry: input.options.registry, reportAdapterRuntime: input.reportAdapterRuntime, signal },
    ),
  };
}
