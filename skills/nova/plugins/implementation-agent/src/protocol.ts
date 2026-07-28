export interface ImplementationInput {
  readonly runId: string;
  readonly moduleId: string;
  readonly attempt: number;
  readonly task: string;
  readonly headBefore: string;
}
export interface ImplementationCompletion {
  readonly status: 'ready_for_testing' | 'blocked';
  readonly runId: string;
  readonly moduleId: string;
  readonly attempt: number;
  readonly summary: string;
  readonly changedPaths: readonly string[];
  readonly checks: readonly { readonly name: string; readonly passed: boolean }[];
  readonly session: {
    readonly sessionId: string;
    readonly startedAt: string;
    readonly completedAt: string;
    readonly transcriptDigest: string;
    readonly handoffs: number;
    readonly termination: 'completed' | 'blocked' | 'cancelled';
  };
}
const text = (value: unknown, name: string, max = 32768): string => {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || /[\0\r]/u.test(value)) throw new Error(`${name} is invalid`);
  return value;
};
export function buildRequest(agent: string, input: ImplementationInput, helperPrompt?: string): Readonly<Record<string, unknown>> {
  return {
    protocol: 'kubeclaw.implementation.v2', agent,
    identity: { runId: input.runId, moduleId: input.moduleId, attempt: input.attempt },
    headBefore: input.headBefore, task: input.task, helperPrompt: helperPrompt ?? null,
    requiredCompletion: { status: ['ready_for_testing', 'blocked'], fields: ['runId', 'moduleId', 'attempt', 'summary', 'changedPaths', 'checks', 'session'] },
  };
}
export function parseCompletion(value: unknown, input: ImplementationInput): ImplementationCompletion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('completion must be an object');
  const source = value as Record<string, unknown>;
  const allowed = new Set(['status', 'runId', 'moduleId', 'attempt', 'summary', 'changedPaths', 'checks', 'session']);
  if (Object.keys(source).some((key) => !allowed.has(key))) throw new Error('completion has unknown fields');
  const status = source.status;
  if (status !== 'ready_for_testing' && status !== 'blocked') throw new Error('completion status is invalid');
  if (source.runId !== input.runId || source.moduleId !== input.moduleId || source.attempt !== input.attempt) throw new Error('completion identity does not match the active attempt');
  if (!Array.isArray(source.changedPaths) || source.changedPaths.length > 512) throw new Error('changedPaths is invalid');
  const changedPaths = source.changedPaths.map((item) => {
    const path = text(item, 'changed path', 512);
    if (path.startsWith('/') || path.split('/').includes('..')) throw new Error('changed path escapes the repository');
    return path;
  });
  if (!Array.isArray(source.checks) || source.checks.length > 128) throw new Error('checks is invalid');
  const checks = source.checks.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('check is invalid');
    const check = item as Record<string, unknown>;
    if (Object.keys(check).some((key) => key !== 'name' && key !== 'passed') || typeof check.passed !== 'boolean') throw new Error('check is invalid');
    return { name: text(check.name, 'check name', 256), passed: check.passed };
  });
  const summary = text(source.summary, 'summary', 8192);
  if (!source.session || typeof source.session !== 'object' || Array.isArray(source.session)) throw new Error('session evidence is invalid');
  const sessionSource = source.session as Record<string, unknown>;
  if (Object.keys(sessionSource).some((key) => !['sessionId', 'startedAt', 'completedAt', 'transcriptDigest', 'handoffs', 'termination'].includes(key))) {
    throw new Error('session evidence has unknown fields');
  }
  const startedAt = text(sessionSource.startedAt, 'session startedAt', 64);
  const completedAt = text(sessionSource.completedAt, 'session completedAt', 64);
  if (!Number.isFinite(Date.parse(startedAt)) || !Number.isFinite(Date.parse(completedAt)) || Date.parse(completedAt) < Date.parse(startedAt)) {
    throw new Error('session timestamps are invalid');
  }
  if (typeof sessionSource.transcriptDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(sessionSource.transcriptDigest)) throw new Error('transcript digest is invalid');
  if (!Number.isSafeInteger(sessionSource.handoffs) || Number(sessionSource.handoffs) < 0) throw new Error('session handoffs are invalid');
  if (!['completed', 'blocked', 'cancelled'].includes(String(sessionSource.termination))) throw new Error('session termination is invalid');
  if (status === 'ready_for_testing' && sessionSource.termination !== 'completed') throw new Error('ready completion requires a completed session');
  if (status === 'blocked' && sessionSource.termination === 'completed') throw new Error('blocked completion contradicts session evidence');
  const session = {
    sessionId: text(sessionSource.sessionId, 'session id', 512),
    startedAt,
    completedAt,
    transcriptDigest: sessionSource.transcriptDigest,
    handoffs: Number(sessionSource.handoffs),
    termination: sessionSource.termination as 'completed' | 'blocked' | 'cancelled',
  };
  if (status === 'ready_for_testing' && (changedPaths.length === 0 || checks.length === 0 || checks.some((check) => !check.passed))) throw new Error('ready completion requires changed paths and successful checks');
  if (status === 'blocked' && (changedPaths.length > 0 || checks.some((check) => check.passed))) throw new Error('blocked completion contradicts implementation evidence');
  return { status, runId: input.runId, moduleId: input.moduleId, attempt: input.attempt, summary, changedPaths, checks, session };
}
