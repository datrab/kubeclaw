export interface ImplementationInput {
  readonly runId: string;
  readonly moduleId: string;
  readonly attempt: number;
  readonly task: string;
  readonly headBefore: string;
  readonly workspace?: {
    readonly repositoryRoot: string;
    readonly workspacePath: string;
    readonly branch: string;
    readonly baseRef: string;
    readonly mergeTarget: string;
    readonly commitMessage: string;
  };
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
    headBefore: input.headBefore,
    task: [
      input.task,
      helperPrompt?.trim() || 'No additional implementation guidance was supplied.',
      'Return only the agent-owned output object described by outputContract.',
      'Do not copy protocol, agent, identity, headBefore, task, or outputContract into the output.',
      'Runtime/core attach invocation identity and session evidence.',
    ].join('\n\n'),
    outputContract: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'summary', 'changedPaths', 'checks'],
      properties: {
        status: { enum: ['ready_for_testing', 'blocked'] },
        summary: { type: 'string' },
        changedPaths: {
          type: 'array',
          description: 'Changed file paths relative to the Git repository root, never relative to a nested project or current working directory.',
          items: { type: 'string' },
        },
        checks: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'passed'],
            properties: { name: { type: 'string' }, passed: { type: 'boolean' } },
          },
        },
      },
    },
  };
}
function parseChangedPaths(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 512) throw new Error('changedPaths is invalid');
  return value.map((item) => {
    const changedPath = text(item, 'changed path', 512);
    if (changedPath.startsWith('/') || changedPath.split('/').includes('..')) {
      throw new Error('changed path escapes the repository');
    }
    return changedPath;
  });
}

function parseChecks(value: unknown): readonly { readonly name: string; readonly passed: boolean }[] {
  if (!Array.isArray(value) || value.length > 128) throw new Error('checks is invalid');
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('check is invalid');
    const check = item as Record<string, unknown>;
    if (Object.keys(check).some((key) => !['name', 'passed'].includes(key))
      || typeof check.passed !== 'boolean') throw new Error('check is invalid');
    return { name: text(check.name, 'check name', 256), passed: check.passed };
  });
}

function parseSession(value: unknown): ImplementationCompletion['session'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('session evidence is invalid');
  const source = value as Record<string, unknown>;
  if (Object.keys(source).some((key) => !['sessionId', 'startedAt', 'completedAt', 'transcriptDigest', 'handoffs', 'termination'].includes(key))) {
    throw new Error('session evidence has unknown fields');
  }
  const startedAt = text(source.startedAt, 'session startedAt', 64);
  const completedAt = text(source.completedAt, 'session completedAt', 64);
  if (!Number.isFinite(Date.parse(startedAt)) || !Number.isFinite(Date.parse(completedAt)) || Date.parse(completedAt) < Date.parse(startedAt)) throw new Error('session timestamps are invalid');
  if (typeof source.transcriptDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(source.transcriptDigest)) throw new Error('transcript digest is invalid');
  if (!Number.isSafeInteger(source.handoffs) || Number(source.handoffs) < 0) throw new Error('session handoffs are invalid');
  if (!['completed', 'blocked', 'cancelled'].includes(String(source.termination))) throw new Error('session termination is invalid');
  return {
    sessionId: text(source.sessionId, 'session id', 512), startedAt, completedAt,
    transcriptDigest: source.transcriptDigest, handoffs: Number(source.handoffs),
    termination: source.termination as 'completed' | 'blocked' | 'cancelled',
  };
}

function assertCompletionConsistency(
  status: ImplementationCompletion['status'],
  changedPaths: readonly string[],
  checks: readonly { readonly passed: boolean }[],
  session: ImplementationCompletion['session'],
): void {
  if (status === 'ready_for_testing' && session.termination !== 'completed') throw new Error('ready completion requires a completed session');
  if (status === 'blocked' && session.termination === 'completed') throw new Error('blocked completion contradicts session evidence');
  if (status === 'ready_for_testing' && (changedPaths.length === 0 || checks.length === 0 || checks.some((check) => !check.passed))) throw new Error('ready completion requires changed paths and successful checks');
  if (status === 'blocked' && (changedPaths.length > 0 || checks.some((check) => check.passed))) throw new Error('blocked completion contradicts implementation evidence');
}
export function parseCompletion(value: unknown, input: ImplementationInput): ImplementationCompletion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('completion must be an object');
  const source = value as Record<string, unknown>;
  const allowed = new Set(['status', 'summary', 'changedPaths', 'checks', 'session']);
  if (Object.keys(source).some((key) => !allowed.has(key))) throw new Error('completion has unknown fields');
  const status = source.status;
  if (status !== 'ready_for_testing' && status !== 'blocked') throw new Error('completion status is invalid');
  const changedPaths = parseChangedPaths(source.changedPaths);
  const checks = parseChecks(source.checks);
  const summary = text(source.summary, 'summary', 8192);
  const session = parseSession(source.session);
  assertCompletionConsistency(status, changedPaths, checks, session);
  return { status, runId: input.runId, moduleId: input.moduleId, attempt: input.attempt, summary, changedPaths, checks, session };
}
