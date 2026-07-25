
import fs from 'fs';

import { buildCompletionIdentityFields, ensureBusterOutputFile } from './pipeline-helpers.ts';
import { safeErrorMessage } from './runtime-diagnostics.ts';
import verifyAndPush from '../tools/verify-task.ts';
import {
  REDIS_PIPELINE_MESSAGE_SCHEMA_VERSION,
  assertRedisCompletionEntry,
  inferRedisTaskTarget,
} from './redis-message-contract.ts';
import { createRedisEventBus } from './task-transport-contract.ts';
import { writeTaskDeadLetter } from './task-dead-letter.ts';
import type { AnyTaskRecord, BusterTaskPayload, RedisTaskClient } from './task-contracts.ts';

import { selectDefinedValue } from '../optional-absence.ts';
type AnyRecord = AnyTaskRecord;
type RedisClient = RedisTaskClient;
type CompletionOptions = AnyRecord & {
  outcome?: string | undefined;
  reason?: string | undefined;
  moduleId?: string | undefined;
  sessionKey?: string | null | undefined;
  timestamp?: string | number | undefined;
  source?: string | undefined;
  summary?: string | undefined;
  failureClass?: string | undefined;
  rateLimitMaxPauses?: number | null | undefined;
  preTestVerdict?: unknown;
  ensureBusterOutputFile?: typeof ensureBusterOutputFile | undefined;
  verifyAndPush?: typeof verifyAndPush | undefined;
  emitTaskCompletion?: typeof emitTaskCompletion | undefined;
};
type CompletionState = { attempted: boolean; terminal: boolean; stream: string | null; error: unknown };
export { writeTaskDeadLetter } from './task-dead-letter.ts';

function compactRecord(obj: AnyRecord = {}): Record<string, string> {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]),
  );
}

function resolveModuleId(payload: BusterTaskPayload = {}): string {
  if (payload.module_id) return payload.module_id;
  if (payload.module) return payload.module;
  if (payload.gate_id) return payload.gate_id;
  return 'missing_task_target';
}

function normalizeRepoRelativePath(value: unknown): string {
  return String(selectDefinedValue(() => (value), () => ('')))
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^(?:\.\/)+/, '')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
    .trim();
}

function busterCompletionCommitPaths(payload: BusterTaskPayload = {}, outputFileResult: AnyRecord = {}): string[] {
  const outputFile = normalizeRepoRelativePath(payload?.output_file);
  if (!outputFile) throw new Error('Buster completion requires output_file artifact path');
  const paths = [outputFile];
  const verdictPath = `${outputFile}.agent-verdict.json`;
  const absoluteVerdictPath = typeof outputFileResult?.path === 'string'
    ? `${outputFileResult.path}.agent-verdict.json`
    : null;
  if (absoluteVerdictPath && fs.existsSync(absoluteVerdictPath)) {
    paths.push(verdictPath);
  }
  return [...new Set(paths)];
}

export function createTaskCompletionState(): CompletionState {
  return { attempted: false, terminal: false, stream: null, error: null };
}

function completionOptionalFields(opts: CompletionOptions): AnyRecord {
  const fields: AnyRecord = {};
  if (opts.failureClass) fields.failure_class = opts.failureClass;
  if (opts.outcome === 'RATE_LIMITED' && opts.rateLimitMaxPauses != null) {
    fields.max_rate_limit_pauses = String(opts.rateLimitMaxPauses);
  }
  if (opts.preTestVerdict) fields.verdict = JSON.stringify(opts.preTestVerdict);
  return fields;
}

function completionSummary(opts: CompletionOptions, reason: string): string {
  if (opts.summary) return opts.summary;
  return reason;
}

export function buildTaskCompletionRecord(payload: BusterTaskPayload = {}, opts: CompletionOptions = {}): AnyRecord {
  const { outcome, reason } = opts;
  if (!outcome || !reason) throw new Error('Buster completion requires explicit outcome and reason');
  const moduleId = opts.moduleId ? opts.moduleId : resolveModuleId(payload);
  const identityFields = buildCompletionIdentityFields(payload, {
    sessionKey: selectDefinedValue(() => (opts.sessionKey), () => (null)),
  });
  const target = inferRedisTaskTarget(payload, payload?.task_type);

  return {
    schema_version: REDIS_PIPELINE_MESSAGE_SCHEMA_VERSION,
    type: 'completion',
    stream_role: 'completion',
    project: payload?.project,
    target_kind: target.target_kind,
    target_id: target.target_id ?? moduleId,
    module: moduleId,
    gate_id: target.gate_id,
    gate_type: payload?.gate_type,
    status: outcome === 'PASS' ? 'PASS' : 'FAIL',
    outcome,
    source: opts.source ?? 'buster-pipeline',
    reason,
    summary: completionSummary(opts, reason),
    ...completionOptionalFields(opts),
    ...identityFields,
    timestamp: String(opts.timestamp ?? Date.now()),
  };
}

function buildTaskCompletionFields(payload: BusterTaskPayload = {}, opts: CompletionOptions = {}): Record<string, string> {
  const record = buildTaskCompletionRecord(payload, opts);
  assertRedisCompletionEntry(record, { requireStreamId: false, requireCanonicalEnvelope: true, expectedStreamRole: 'completion' });
  return compactRecord(record);
}

export async function emitTaskCompletion(redisClient: RedisClient, payload: BusterTaskPayload = {}, opts: CompletionOptions = {}) {
  if (!payload?.completion_stream) {
    return { ok: false, skipped: true, reason: 'missing_completion_stream' };
  }
  const eventBus = createRedisEventBus(redisClient);
  const published = await eventBus.publish(payload.completion_stream, buildTaskCompletionFields(payload, opts));
  return { ok: true, stream: payload.completion_stream, id: published.id };
}

function completionDependencies(opts: CompletionOptions) {
  return {
    ensureOutputFile: opts.ensureBusterOutputFile ?? ensureBusterOutputFile,
    verifyTask: opts.verifyAndPush ?? verifyAndPush,
    emitCompletion: opts.emitTaskCompletion ?? emitTaskCompletion,
  };
}

function artifactSummary(opts: CompletionOptions, reason: string): string {
  if (opts.artifactSummary) return String(opts.artifactSummary);
  return completionSummary(opts, reason);
}

function outputVerificationDetail(result: AnyRecord): string {
  if (result.error) return String(result.error);
  if (result.action) return String(result.action);
  return 'missing_verify_detail';
}

function validatedCompletionRequest(payload: BusterTaskPayload, opts: CompletionOptions) {
  if (!opts.outcome || !opts.reason) throw new Error('Buster completion requires explicit outcome and reason');
  if (!payload.completion_stream) return null;
  if (!payload.output_file) throw new Error('Buster completion requires output_file artifact path');
  if (!payload.project) throw new Error('Buster completion requires project identity');
  return {
    outcome: opts.outcome, reason: opts.reason, project: payload.project,
    moduleId: opts.moduleId ?? resolveModuleId(payload),
  };
}

function artifactData(value: unknown): AnyRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : null;
}

async function emitOutputContractFailure(
  redisClient: RedisClient,
  payload: BusterTaskPayload,
  opts: CompletionOptions,
  outputFileResult: AnyRecord,
  emitCompletion: typeof emitTaskCompletion,
) {
  const reason = outputFileResult.reason ?? 'output_file_contract_failed';
  const emitted = await emitCompletion(redisClient, payload, {
    ...opts, outcome: 'FAIL', reason,
    summary: `Buster output_file contract failed: ${reason}`,
    source: 'buster-pipeline', failureClass: opts.failureClass ?? 'output_contract_failed',
  });
  return { ...emitted, outputFileResult, verifyResult: null };
}

export async function publishTaskCompletionWithArtifact(
  redisClient: RedisClient,
  payload: BusterTaskPayload = {},
  opts: CompletionOptions = {},
) {
  const request = validatedCompletionRequest(payload, opts);
  if (!request) return { ok: false, skipped: true, reason: 'missing_completion_stream' };
  const dependencies = completionDependencies(opts);
  const emitCompletion = dependencies.emitCompletion;
  const verifyTask = dependencies.verifyTask;
  const outputFileResult = dependencies.ensureOutputFile(payload, {
    outcome: request.outcome,
    reason: request.reason,
    summary: artifactSummary(opts, request.reason),
    source: opts.artifactSource ?? null,
    data: artifactData(opts.artifactData),
  });
  if (outputFileResult?.ok === false) {
    return emitOutputContractFailure(redisClient, payload, opts, outputFileResult, emitCompletion);
  }
  const verifyResult = await verifyTask('buster', request.project, {
    commitMessage: opts.commitMessage ?? `[BUSTER] ${payload.task_type ?? 'task'} ${request.moduleId}: output artifact`,
    addPaths: busterCompletionCommitPaths(payload, outputFileResult),
  });
  if (verifyResult?.status && verifyResult.status !== 'success') {
    throw new Error(`output_file verify failed: ${outputVerificationDetail(verifyResult)}`);
  }

  const emitted = await emitCompletion(redisClient, payload, opts);
  return { ...emitted, outputFileResult, verifyResult };
}

function didProcessResultEmitTerminalCompletion(processResult: AnyRecord | null): boolean {
  return processResult?.completion?.terminal === true;
}

function taskPayloadRecord(payload: unknown): BusterTaskPayload {
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as BusterTaskPayload : {};
}

function terminalFailureReason(opts: AnyRecord, processResult: AnyRecord | null, completionError: unknown, taskError: unknown): string {
  if (opts.reason) return String(opts.reason);
  if (processResult?.reason) return String(processResult.reason);
  if (completionError) return `task_completion_precondition_failed: ${safeErrorMessage(completionError)}`;
  if (!taskPayloadRecord(opts.payload).completion_stream) return 'missing_completion_stream';
  if (taskError) return `task_runtime_failure: ${safeErrorMessage(taskError)}`;
  return 'task_failed_before_completion';
}

async function synthesizeFailureCompletion(
  redisClient: RedisClient,
  payload: BusterTaskPayload,
  reason: string,
  opts: AnyRecord,
): Promise<AnyRecord | null> {
  if (!payload.completion_stream) return null;
  const completion = await emitTaskCompletion(redisClient, payload, {
    outcome: 'FAIL', reason, summary: reason, moduleId: opts.moduleId, source: 'buster-pipeline',
  });
  return completion?.ok ? completion : null;
}

export async function ensureTaskTerminalBeforeAck(redisClient: RedisClient, opts: AnyRecord = {}) {
  const payload = taskPayloadRecord(opts.payload);
  const processResult = selectDefinedValue(() => (opts.processResult), () => (null));
  const taskError = selectDefinedValue(() => (opts.error), () => (null));
  let completionError = completionErrorAuthority(opts, processResult);

  if (didProcessResultEmitTerminalCompletion(processResult)) {
    return { ok: true, mode: 'completion_already_emitted', stream: processResult.completion.stream };
  }

  const reason = terminalFailureReason(opts, processResult, completionError, taskError);

  if (!completionError) {
    try {
      const completion = await synthesizeFailureCompletion(redisClient, payload, reason, opts);
      if (completion) return { ok: true, mode: 'synthesized_failure_completion', stream: completion.stream };
    } catch (error) {
      if (!completionError) completionError = error;
    }
  }

  try {
    const streamKey = typeof opts.streamKey === 'string' ? opts.streamKey : '';
    if (!streamKey) throw new Error('Buster terminal guarantee requires task stream identity');
    const deadLetter = await writeTaskDeadLetter(redisClient, {
      ...opts,
      streamKey,
      reason: opts.deadLetterReason ? opts.deadLetterReason : 'task_failed_before_terminal_completion',
      detail: completionError ? completionError : taskError ? taskError : reason,
      phase: opts.phase ? opts.phase : (taskError ? 'process_task_error' : 'completion_missing'),
    });
    return { ok: true, mode: 'dead_letter', stream: deadLetter.stream };
  } catch (deadLetterError) {
    return {
      ok: false,
      mode: 'terminal_guarantee_failed',
      error: deadLetterError,
      detail: safeErrorMessage(deadLetterError),
    };
  }
}

function completionErrorAuthority(opts: AnyRecord, processResult: AnyRecord | null): unknown {
  if (opts.completionError) return opts.completionError;
  return processResult?.completion?.error;
}
