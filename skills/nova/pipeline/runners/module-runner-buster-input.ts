import path from 'path';
import { getRunId } from '../core/runtime.ts';
import { normalizeTypedWorkerControlResult } from '../services/contracts/worker-control-result.ts';
import { cloneSerializable } from '../services/serialization.ts';
import { coerceModuleBusterWorkerControlResult } from '../agents/orchestration.ts';
import { collectExistingArtifactRefs } from './stage-envelope-primitives.ts';
import {
  buildModuleStateSnapshotBase, buildModuleWorkerDeadline, buildModuleWorkerRunInputBase,
  cloneArrayOrEmpty, cloneOrNull, initialBusterAttempt, invocationAttempt,
  moduleRoot, optionalText, repoRoot, requiredAttempt, requiredText,
} from './module-runner-shared.ts';

type AnyRecord = Record<string, any>;

function artifactRefs(config: AnyRecord, dir: string, mod: AnyRecord) {
  const refs: AnyRecord[] = [
    { type: 'buster_instructions', role: 'input', format: 'md', path: path.join(moduleRoot(config, dir), 'BUSTER.md') },
    { type: 'test_spec', role: 'input', format: 'json', path: path.join(moduleRoot(config, dir), 'test-spec.json') },
  ];
  for (const suite of cloneArrayOrEmpty(mod?.test_suites)) refs.push({
    type: 'test_suite', role: 'input', format: 'ts',
    path: path.join(repoRoot(config), 'skills', 'buster', 'pipeline', 'suites', `${suite}.ts`),
  });
  return collectExistingArtifactRefs(refs);
}

function stateSnapshot(config: AnyRecord, moduleId: string, mod: AnyRecord, dir: string, status: AnyRecord, opts: AnyRecord) {
  const base = buildModuleStateSnapshotBase(config, moduleId, mod, dir, status);
  return {
    pipeline: base.pipeline,
    module: { ...base.module, completion_summary: status?.completion_summary ?? null, test_suites: cloneArrayOrEmpty(mod?.test_suites), test_config: cloneOrNull(mod?.test_config) },
    dispatch: { run_id: optionalText(opts?.runId), attempt: invocationAttempt(status, opts), dispatch_id: optionalText(opts?.dispatchId), gateway_label: optionalText(opts?.gatewayLabel) },
  };
}

function workerConfig(mod: AnyRecord, opts: AnyRecord) {
  return { maxFails: opts?.maxFails ?? null, maxCrashRetries: opts?.maxCrashRetries ?? null, testSuites: cloneArrayOrEmpty(mod?.test_suites), testConfig: cloneOrNull(mod?.test_config) };
}

function backendConfig(opts: AnyRecord) {
  return {
    agentType: 'buster', model: optionalText(opts?.model), modelSource: optionalText(opts?.modelSource),
    thinking: optionalText(opts?.thinking), thinkingSource: optionalText(opts?.thinkingSource),
    thinkingSupported: opts?.thinkingSupported ?? null,
    reasoningLevel: opts?.thinkingSupported === false ? 'not supported' : (optionalText(opts?.thinking) ?? 'thinking_not_configured'),
    runtimeKind: 'session',
  };
}

function executionContext(mod: AnyRecord, dir: string, status: AnyRecord, opts: AnyRecord, attempt: number, dispatchId: string | null) {
  return {
    phase: 'buster', moduleDir: dir, timeoutMinutes: opts?.timeoutMinutes ?? null,
    busterAttempt: initialBusterAttempt(opts?.busterAttempt), queuedSuites: cloneArrayOrEmpty(mod?.test_suites),
    completionIdentity: { runId: optionalText(opts?.runId), attempt, dispatchId, gatewayLabel: optionalText(opts?.gatewayLabel) },
    validation: cloneSerializable(status?.validation ?? null),
  };
}

export function buildModuleBusterRunInput(config: AnyRecord, moduleId: string, mod: AnyRecord, dir: string, status: AnyRecord, opts: AnyRecord = {}) {
  const attempt = requiredAttempt(opts?.attempt, status);
  const dispatchId = optionalText(opts?.dispatchId);
  return buildModuleWorkerRunInputBase(config, moduleId, mod, dir, status, {
    attempt, stageId: 'worker:module_buster',
    refs: { workerDispatchRef: dispatchId ? { prefix: 'worker_dispatch', parts: [getRunId(config), moduleId, attempt, dispatchId] } : null },
    ids: dispatchId ? { dispatchId } : {},
    worker: { workerType: 'module_buster', config: workerConfig(mod, opts), backendConfig: backendConfig(opts) },
    artifacts: artifactRefs(config, dir, mod), stateSnapshot: stateSnapshot(config, moduleId, mod, dir, status, opts),
    executionContext: executionContext(mod, dir, status, opts, attempt, dispatchId),
    deadline: buildModuleWorkerDeadline(status, opts?.timeoutMinutes),
  });
}

export function normalizeModuleBusterWorkerResult(config: AnyRecord, workerInput: AnyRecord, rawResult: unknown, opts: AnyRecord = {}) {
  return normalizeTypedWorkerControlResult(rawResult, {
    producerType: 'module_buster', label: 'Module Buster',
    stageId: requiredText(opts?.stageId, 'module_buster.stageId'), moduleId: requiredText(opts?.moduleId, 'module_buster.moduleId'),
    input: workerInput, invocation: opts?.pluginInvocation ?? null,
    coerce: (result: unknown) => coerceModuleBusterWorkerControlResult(config, workerInput, result, opts),
  });
}
