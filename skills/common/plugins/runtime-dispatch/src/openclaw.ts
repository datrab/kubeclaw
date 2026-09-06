import crypto from 'node:crypto';
import path from 'node:path';
import { buildRuntimeAgentTask, canonicalJson, RUNTIME_RESULT_FILE_MAX_BYTES, type AdapterActivationContext } from '@kubeclaw/plugin-sdk';
import { getEncoding } from 'js-tiktoken';
import { readOpenClawResult } from './openclaw-result.ts';
export { attachRuntimeEvidence } from './openclaw-result.ts';
import { openClawToolDetails, record } from './openclaw-response.ts';
import { cancelSession, findRegisteredSession, gateway, pollSession, type OpenClawSessionIdentity, type OpenClawSessionState } from './openclaw-session.ts';

export interface OpenClawTarget {
  readonly endpoint: string; readonly tokenSecret: string; readonly runtime: 'acp' | 'subagent';
  readonly agentId: string; readonly agentRole: string; readonly model: string; readonly thinking: string;
  readonly controllerSessionKey?: string;
  readonly collectorMode?: boolean;
  readonly spawnIntervalMs: number;
  readonly cwd: string; readonly repositoryRoot: string; readonly pollMs: number; readonly maxPollMs: number;
  readonly maxPolls: number; readonly sessionTimeoutMs: number; readonly resultPathPrefix: string;
  readonly tokenizerEncoding: 'o200k_base' | 'cl100k_base'; readonly maxPromptBytes: number;
  readonly maxInputTokens: number; readonly maxOutputTokens: number; readonly maxContextTokens: number;
  readonly resultEndpoint?: string; readonly resultTokenSecret?: string;
}
export interface RuntimeSessionEvidence { readonly sessionId: string; readonly startedAt: string; readonly completedAt: string; readonly transcriptDigest: string; readonly termination: 'completed' | 'blocked' | 'cancelled'; }
type JsonRecord = Record<string, unknown>;
interface RuntimePromptBudget {
  readonly schemaVersion: 'runtime-prompt-budget.v1';
  readonly tokenizerEncoding: OpenClawTarget['tokenizerEncoding'];
  readonly reservedPromptBytes: number; readonly reservedInputTokens: number;
  readonly maxPromptBytes: number; readonly maxInputTokens: number;
  readonly maxOutputTokens: number; readonly maxContextTokens: number;
  readonly deadlineEpochMs?: number;
}
const ENCODERS = new Map<OpenClawTarget['tokenizerEncoding'], ReturnType<typeof getEncoding>>();
const SUCCESSFUL_SESSION_STATES = new Set(['completed', 'complete', 'done', 'succeeded', 'idle', 'ended', 'closed']);
const SPAWN_QUEUES = new WeakMap<AdapterActivationContext, Map<string, Promise<void>>>();

export function assertOpenClawSessionCompleted(session: OpenClawSessionState, expectedModel: string): void {
  if (!SUCCESSFUL_SESSION_STATES.has(session.state)) {
    if (session.schemaError) throw new Error(`OPENCLAW_COLLECTOR_SCHEMA_INVALID:${session.schemaError}`);
    throw new Error(`OPENCLAW_SESSION_FAILED:${session.state}`);
  }
  if (session.model !== expectedModel) throw new Error('OPENCLAW_SESSION_MODEL_MISMATCH');
}

function promptTokens(text: string, name: OpenClawTarget['tokenizerEncoding']): number {
  let encoder = ENCODERS.get(name);
  if (!encoder) { encoder = getEncoding(name); ENCODERS.set(name, encoder); }
  return encoder.encode(text).length;
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}
function promptBudgetIntegers(value: JsonRecord): boolean {
  return [value.reservedPromptBytes, value.reservedInputTokens, value.maxPromptBytes,
    value.maxInputTokens, value.maxOutputTokens, value.maxContextTokens].every(positiveInteger);
}
function runtimePromptBudget(value: unknown): RuntimePromptBudget | undefined {
  if (value === undefined) return undefined;
  if (!record(value) || value.schemaVersion !== 'runtime-prompt-budget.v1') {
    throw new Error('OPENCLAW_RUNTIME_PROMPT_BUDGET_INVALID');
  }
  if (!['o200k_base', 'cl100k_base'].includes(String(value.tokenizerEncoding)) || !promptBudgetIntegers(value)) {
    throw new Error('OPENCLAW_RUNTIME_PROMPT_BUDGET_INVALID');
  }
  if (value.deadlineEpochMs !== undefined && !positiveInteger(value.deadlineEpochMs)) {
    throw new Error('OPENCLAW_RUNTIME_PROMPT_BUDGET_INVALID');
  }
  return value as unknown as RuntimePromptBudget;
}
function dispatchPayload(payload: JsonRecord): Readonly<{ modelPayload: JsonRecord; budget?: RuntimePromptBudget }> {
  const budget = runtimePromptBudget(payload.runtimePromptBudget);
  const { runtimePromptBudget: _control, runtimeDispatchAttempt: _attempt, ...modelPayload } = payload;
  return { modelPayload, ...(budget ? { budget } : {}) };
}
function runtimeDispatchAttempt(value: unknown): number {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 100) {
    throw new Error('OPENCLAW_RUNTIME_DISPATCH_ATTEMPT_INVALID');
  }
  return Number(value);
}
async function beforeAbort<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new Error('OPENCLAW_DISPATCH_DEADLINE_EXPIRED');
  let abort!: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = (): void => reject(new Error('OPENCLAW_DISPATCH_DEADLINE_EXPIRED'));
    signal.addEventListener('abort', abort, { once: true });
  });
  try { return await Promise.race([operation(), aborted]); }
  finally { signal.removeEventListener('abort', abort); }
}
function assertDispatchActive(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('OPENCLAW_DISPATCH_DEADLINE_EXPIRED');
}
function requiredText(value: unknown, label: string): string { if (typeof value !== 'string' || !value.trim()) throw new Error(`OPENCLAW_${label}_INVALID`); return value.trim(); }
function first(...values: readonly unknown[]): unknown { return values.find((value) => value !== undefined && value !== null); }
// eslint-disable-next-line complexity -- The identity parser accepts current and legacy field aliases but requires one complete identity.
function sessionIdentity(value: unknown, label: string): OpenClawSessionIdentity {
  const source = openClawToolDetails(value);
  if (!record(source)) throw new Error('OPENCLAW_SPAWN_RESULT_INVALID');
  if (typeof source.status === 'string' && source.status.toLowerCase() !== 'accepted') {
    throw new Error(`OPENCLAW_SESSIONS_SPAWN_STATUS_INVALID:${source.status.toLowerCase()}`);
  }
  const nested = record(source.session) ? source.session : undefined;
  const sessionKey = requiredText(first(source.childSessionKey, source.sessionKey, source.session_key,
    nested?.sessionKey, nested?.session_key), 'SESSION_KEY');
  const runId = requiredText(first(source.runId, source.run_id, nested?.runId, nested?.run_id), 'RUN_ID');
  const taskId = first(source.taskId, source.task_id, nested?.taskId, nested?.task_id);
  if (taskId !== undefined && (typeof taskId !== 'string' || !taskId.trim())) throw new Error('OPENCLAW_TASK_ID_INVALID');
  const model = first(source.resolvedModel, source.model, nested?.model);
  return Object.freeze({ sessionKey, runId, label, ...(typeof taskId === 'string' ? { taskId: taskId.trim() } : {}),
    ...(typeof model === 'string' ? { model } : {}) });
}

export function buildOpenClawTask(payload: JsonRecord, resultFile: string): string {
  return buildRuntimeAgentTask(payload, resultFile);
}

export function assertOpenClawPromptBudget(
  task: string,
  target: Pick<OpenClawTarget, 'tokenizerEncoding' | 'maxPromptBytes' | 'maxInputTokens' | 'maxOutputTokens' | 'maxContextTokens'>,
): void {
  const promptBytes = Buffer.byteLength(task, 'utf8');
  if (promptBytes > target.maxPromptBytes) throw new Error(`OPENCLAW_PROMPT_BYTES_EXCEEDED:${promptBytes}:${target.maxPromptBytes}`);
  const inputTokens = promptTokens(task, target.tokenizerEncoding);
  if (inputTokens > target.maxInputTokens || inputTokens + target.maxOutputTokens > target.maxContextTokens) {
    throw new Error(`OPENCLAW_PROMPT_TOKENS_EXCEEDED:${inputTokens}:${target.maxInputTokens}:${target.maxContextTokens}`);
  }
}

function assertDeclaredPromptBudget(
  task: string, target: OpenClawTarget, budget: RuntimePromptBudget,
): void {
  if (budget.tokenizerEncoding !== target.tokenizerEncoding) {
    throw new Error(`OPENCLAW_PROMPT_TOKENIZER_MISMATCH:${budget.tokenizerEncoding}:${target.tokenizerEncoding}`);
  }
  if (budget.maxOutputTokens !== target.maxOutputTokens) {
    throw new Error(`OPENCLAW_OUTPUT_TOKEN_CAP_MISMATCH:${budget.maxOutputTokens}:${target.maxOutputTokens}`);
  }
  const bytes = Buffer.byteLength(task, 'utf8'), tokens = promptTokens(task, target.tokenizerEncoding);
  if (budget.reservedPromptBytes > budget.maxPromptBytes || bytes > budget.reservedPromptBytes) {
    throw new Error(`OPENCLAW_DECLARED_PROMPT_BYTES_EXCEEDED:${bytes}:${budget.reservedPromptBytes}:${budget.maxPromptBytes}`);
  }
  if (budget.reservedInputTokens > budget.maxInputTokens
    || budget.reservedInputTokens + budget.maxOutputTokens > budget.maxContextTokens
    || tokens > budget.reservedInputTokens) {
    throw new Error(`OPENCLAW_DECLARED_PROMPT_TOKENS_EXCEEDED:${tokens}:${budget.reservedInputTokens}:${budget.maxInputTokens}:${budget.maxContextTokens}`);
  }
}

export function prepareOpenClawTask(payload: JsonRecord, resultFile: string, target: OpenClawTarget): string {
  const prepared = dispatchPayload(payload);
  const task = buildOpenClawTask(prepared.modelPayload, resultFile);
  assertOpenClawPromptBudget(task, target);
  if (prepared.budget) assertDeclaredPromptBudget(task, target, prepared.budget);
  return task;
}

export function assertOpenClawOutputBudget(
  outputText: string, target: Pick<OpenClawTarget, 'tokenizerEncoding' | 'maxOutputTokens'>,
  declaredMaximum?: number,
): void {
  const tokens = promptTokens(outputText, target.tokenizerEncoding);
  const maximum = Math.min(target.maxOutputTokens, declaredMaximum ?? target.maxOutputTokens);
  if (tokens > maximum) throw new Error(`OPENCLAW_OUTPUT_TOKENS_EXCEEDED:${tokens}:${maximum}`);
}

function resultLocation(target: OpenClawTarget, dispatchId: string): Readonly<{ file: string; relative: string }> {
  const resultId = crypto.createHash('sha256').update(dispatchId).digest('hex');
  const relative = `${target.resultPathPrefix.replace(/\/+$/u, '')}/${resultId}.json`;
  const file = path.join(target.repositoryRoot, relative);
  const repositoryRelative = path.relative(target.repositoryRoot, file);
  const workspaceRelative = path.relative(target.cwd, file);
  const outside = (value: string): boolean => !value || value.startsWith(`..${path.sep}`) || path.isAbsolute(value);
  if (outside(repositoryRelative)) throw new Error('OPENCLAW_RESULT_PATH_OUTSIDE_REPOSITORY');
  if (outside(workspaceRelative)) throw new Error('OPENCLAW_RESULT_PATH_OUTSIDE_WORKSPACE');
  if (Buffer.byteLength(file, 'utf8') > RUNTIME_RESULT_FILE_MAX_BYTES) {
    throw new Error('OPENCLAW_RESULT_PATH_TOO_LONG');
  }
  return { file, relative: repositoryRelative };
}

async function pacedSpawn<T>(
  context: AdapterActivationContext, target: OpenClawTarget, signal: AbortSignal,
  operation: () => Promise<T>,
): Promise<T> {
  let queues = SPAWN_QUEUES.get(context);
  if (!queues) { queues = new Map(); SPAWN_QUEUES.set(context, queues); }
  const key = `${target.endpoint}\u0000${target.controllerSessionKey ?? ''}`;
  const previous = queues.get(key) ?? Promise.resolve();
  const queued = previous.catch(() => undefined).then(async () => {
    assertDispatchActive(signal);
    try { return await operation(); }
    finally {
      if (target.spawnIntervalMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, target.spawnIntervalMs));
      }
    }
  });
  const tail = queued.then(() => undefined, () => undefined);
  queues.set(key, tail);
  void tail.finally(() => { if (queues?.get(key) === tail) queues.delete(key); });
  return queued;
}

// eslint-disable-next-line max-params -- Dispatch identity remains explicit at the external spawn boundary.
async function spawnSession(context: AdapterActivationContext, target: OpenClawTarget, token: string, payload: JsonRecord,
  resultFile: string, dispatchId: string, signal: AbortSignal): Promise<OpenClawSessionIdentity> {
  const identity = record(payload.identity) ? first(payload.identity.moduleId, payload.identity.gateId) : undefined;
  const task = prepareOpenClawTask(payload, resultFile, target);
  const label = `${target.agentRole}-${String(first(identity, payload.protocol) ?? 'dispatch')}-${crypto.createHash('sha256').update(dispatchId).digest('hex').slice(0, 8)}`;
  const existing = await findRegisteredSession(context, target, token, label);
  if (existing) return existing;
  const spawned = await pacedSpawn(context, target, signal, () => gateway(context, target, token, 'sessions_spawn', {
    runtime: target.runtime, mode: 'run', cleanup: 'keep', thread: false,
    ...(target.collectorMode ? { collect: true,
      groupId: `nova-${crypto.createHash('sha256').update(dispatchId).digest('hex').slice(0, 24)}` } : {}),
    task,
    label,
    ...(target.collectorMode && record(payload.outputContract) ? { outputSchema: payload.outputContract } : {}),
    cwd: target.cwd, model: target.model, agentId: target.agentId, thinking: target.thinking,
    ...(target.runtime === 'acp' ? { streamTo: 'parent' } : {}),
  }, `spawn:${dispatchId}`));
  return sessionIdentity(spawned, label);
}

function runtimeAttestation(targetId: string, target: OpenClawTarget): Readonly<Record<string, unknown>> {
  const identity = { targetId, runtime: target.runtime, agentId: target.agentId, model: target.model, thinking: target.thinking };
  return Object.freeze({ schemaVersion: 'runtime-agent-attestation.v1', ...identity,
    identityDigest: `sha256:${crypto.createHash('sha256').update(canonicalJson(identity)).digest('hex')}` });
}

// eslint-disable-next-line max-lines-per-function, max-params, complexity -- One transaction owns secret resolution, spawn, cancellation, polling, import, and attestation.
export async function dispatchOpenClaw(
  context: AdapterActivationContext, targetId: string, target: OpenClawTarget, payload: JsonRecord,
  signal: AbortSignal, dispatchId: string,
): Promise<Readonly<{ result: unknown; runtimeEvidence: Readonly<Record<string, unknown>> }>> {
  const deadlineEpochMs = runtimePromptBudget(payload.runtimePromptBudget)?.deadlineEpochMs;
  if (deadlineEpochMs !== undefined && Date.now() >= deadlineEpochMs) {
    throw new Error('OPENCLAW_DISPATCH_DEADLINE_EXPIRED');
  }
  const deadlineSignal = deadlineEpochMs === undefined ? undefined
    : AbortSignal.timeout(Math.max(1, deadlineEpochMs - Date.now()));
  const dispatchSignal = deadlineSignal ? AbortSignal.any([signal, deadlineSignal]) : signal;
  const secret = await beforeAbort(() => context.invokeConfidential('secrets.read', {
    operation: 'resolve', resource: { type: 'secret.name', canonicalId: target.tokenSecret }, payload: {},
  }), dispatchSignal);
  const token = requiredText(secret.value, 'TOKEN');
  const startedAt = new Date().toISOString();
  // Rotate the collector generation when a previously terminal collector result can no longer
  // be trusted. The generation is intentionally outside modelPayload so it changes only the
  // transport identity: valid review-cache entries remain reusable while poisoned OpenClaw
  // collector completions cannot be reattached after an authenticated package upgrade.
  const transport = target.collectorMode ? 'collector-v5' : 'session-v1';
  const attempt = runtimeDispatchAttempt(payload.runtimeDispatchAttempt);
  const stableDispatchId = `${transport}:attempt:${attempt}:payload:${crypto.createHash('sha256')
    .update(canonicalJson({ dispatchId, payload: dispatchPayload(payload).modelPayload })).digest('hex')}`;
  const result = resultLocation(target, stableDispatchId);
  assertDispatchActive(dispatchSignal);
  const spawning = spawnSession(context, target, token, payload, result.file, stableDispatchId, dispatchSignal);
  let identity: OpenClawSessionIdentity;
  try { identity = await beforeAbort(() => spawning, dispatchSignal); }
  catch (error) {
    void spawning.then((lateIdentity) => cancelSession(context, target, token, lateIdentity)).catch(() => undefined);
    throw error;
  }
  if (identity.model && identity.model !== target.model) {
    await cancelSession(context, target, token, identity);
    throw new Error('OPENCLAW_SESSION_MODEL_MISMATCH');
  }
  const abort = (): void => { void cancelSession(context, target, token, identity); };
  dispatchSignal.addEventListener('abort', abort, { once: true });
  if (dispatchSignal.aborted) {
    await cancelSession(context, target, token, identity);
    throw new Error('OPENCLAW_DISPATCH_DEADLINE_EXPIRED');
  }
  try {
    const state = await pollSession(context, target, token, identity, dispatchSignal);
    assertOpenClawSessionCompleted(state, target.model);
    const resolved = await beforeAbort(() => readOpenClawResult(context, target,
      { payload, relative: result.relative, key: identity.sessionKey, startedAt, state, token }), dispatchSignal);
    assertDispatchActive(dispatchSignal);
    assertOpenClawOutputBudget(resolved.outputText, target,
      runtimePromptBudget(payload.runtimePromptBudget)?.maxOutputTokens);
    return Object.freeze({ result: resolved.result, runtimeEvidence: runtimeAttestation(targetId, target) });
  } finally { dispatchSignal.removeEventListener('abort', abort); }
}
