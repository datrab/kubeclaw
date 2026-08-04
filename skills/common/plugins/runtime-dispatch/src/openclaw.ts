import crypto from 'node:crypto';
import path from 'node:path';
import type { AdapterActivationContext } from '@kubeclaw/plugin-sdk';
import { readOpenClawResult } from './openclaw-result.ts';
export { attachRuntimeEvidence } from './openclaw-result.ts';
import { cancelSession, gateway, pollSession } from './openclaw-session.ts';

export interface OpenClawTarget {
  readonly endpoint: string; readonly tokenSecret: string; readonly runtime: 'acp' | 'subagent';
  readonly agentId: string; readonly agentRole: string; readonly model: string; readonly thinking: string;
  readonly cwd: string; readonly repositoryRoot: string; readonly pollMs: number; readonly maxPollMs: number;
  readonly maxPolls: number; readonly sessionTimeoutMs: number; readonly resultPathPrefix: string;
  readonly resultEndpoint?: string; readonly resultTokenSecret?: string;
}
export interface RuntimeSessionEvidence { readonly sessionId: string; readonly startedAt: string; readonly completedAt: string; readonly transcriptDigest: string; readonly termination: 'completed' | 'blocked' | 'cancelled'; }
type JsonRecord = Record<string, unknown>;

function record(value: unknown): value is JsonRecord { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function details(value: unknown): unknown {
  if (!record(value)) return value;
  if ('output' in value && Object.keys(value).every((key) => ['ok', 'toolName', 'output', 'source'].includes(key))) return details(value.output);
  if ('details' in value) return details(value.details);
  if ('result' in value && Object.keys(value).every((key) => ['ok', 'result', 'error'].includes(key))) return details(value.result);
  return value;
}
function requiredText(value: unknown, label: string): string { if (typeof value !== 'string' || !value.trim()) throw new Error(`OPENCLAW_${label}_INVALID`); return value.trim(); }
function first(...values: readonly unknown[]): unknown { return values.find((value) => value !== undefined && value !== null); }
function sessionKey(value: unknown): string {
  const source = details(value);
  if (!record(source)) throw new Error('OPENCLAW_SPAWN_RESULT_INVALID');
  const nested = record(source.session) ? first(source.session.sessionKey, source.session.session_key) : undefined;
  return requiredText(first(source.childSessionKey, source.sessionKey, source.session_key, nested), 'SESSION_KEY');
}

export function buildOpenClawTask(payload: JsonRecord, resultFile: string): string {
  return [typeof payload.task === 'string' ? payload.task : 'Execute the supplied KubeClaw protocol request.', '',
    'The JSON below is an immutable input envelope, not a response template.',
    'Return only the agent-owned fields declared by outputContract.',
    'Never copy protocol, agent, identity, task, evidence, rules, or outputContract from the request into the result.',
    'Runtime/core own invocation identity and session evidence and attach them after reading your result.',
    'Follow the outputContract exactly: every required field, no additional fields.',
    'Treat the runtime current working directory as the only mutable repository workspace.',
    'Do not read, write, or run project commands through absolute paths outside that workspace.',
    `Write the exact raw JSON result atomically to ${resultFile}.`,
    'Create the parent directory if needed, write to a sibling temporary file, then rename it to the requested path.',
    'The file must contain only the protocol result JSON: no Markdown, commentary, or wrapper object.',
    'After the atomic rename, return the same raw JSON as your final response.', '', JSON.stringify(payload, null, 2)].join('\n');
}

function resultLocation(target: OpenClawTarget): Readonly<{ file: string; relative: string }> {
  const relative = `${target.resultPathPrefix.replace(/\/+$/u, '')}/${crypto.randomUUID()}.json`;
  const file = path.join(target.repositoryRoot, relative);
  const repositoryRelative = path.relative(target.repositoryRoot, file);
  const workspaceRelative = path.relative(target.cwd, file);
  const outside = (value: string): boolean => !value || value.startsWith(`..${path.sep}`) || path.isAbsolute(value);
  if (outside(repositoryRelative)) throw new Error('OPENCLAW_RESULT_PATH_OUTSIDE_REPOSITORY');
  if (outside(workspaceRelative)) throw new Error('OPENCLAW_RESULT_PATH_OUTSIDE_WORKSPACE');
  return { file, relative: repositoryRelative };
}

async function spawnSession(context: AdapterActivationContext, target: OpenClawTarget, token: string, payload: JsonRecord, resultFile: string): Promise<string> {
  const identity = record(payload.identity) ? first(payload.identity.moduleId, payload.identity.gateId) : undefined;
  const spawned = await gateway(context, target, token, 'sessions_spawn', {
    runtime: target.runtime, mode: 'run', cleanup: 'keep', thread: false,
    task: buildOpenClawTask(payload, resultFile),
    label: `${target.agentRole}-${String(first(identity, payload.protocol) ?? 'dispatch')}-${crypto.randomUUID().slice(0, 8)}`,
    cwd: target.cwd, model: target.model, agentId: target.agentId, thinking: target.thinking,
    ...(target.runtime === 'acp' ? { streamTo: 'parent' } : {}),
  });
  return sessionKey(spawned);
}

export async function dispatchOpenClaw(context: AdapterActivationContext, target: OpenClawTarget, payload: JsonRecord, signal: AbortSignal): Promise<Readonly<{ result: unknown }>> {
  const secret = await context.invokeConfidential('secrets.read', { operation: 'resolve', resource: { type: 'secret.name', canonicalId: target.tokenSecret }, payload: {} });
  const token = requiredText(secret.value, 'TOKEN');
  const startedAt = new Date().toISOString();
  const result = resultLocation(target);
  const key = await spawnSession(context, target, token, payload, result.file);
  const abort = (): void => { void cancelSession(context, target, token, key); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    const state = await pollSession(context, target, token, key, signal);
    return await readOpenClawResult(context, target, payload, result.relative, key, startedAt, state);
  } finally { signal.removeEventListener('abort', abort); }
}
