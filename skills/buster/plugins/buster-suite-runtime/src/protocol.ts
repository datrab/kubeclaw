import crypto from 'node:crypto';

export const JOB_SCHEMA = 'buster-suite-job.v2';
export const STATUS_SCHEMA = 'buster-suite-status.v2';
export const RESULT_SCHEMA = 'buster-suite-result.v2';

// This list is a deletion ledger for the old suite bridge. New resolved-plan
// work must never use these names.
export const LEGACY_UNMIGRATED_SUITES = Object.freeze([
  'perf',
  'security', 'visual-reg', 'e2e',
] as const);

const SUITE_CAPABILITIES = Object.freeze({
  e2e: Object.freeze(['browser_automation']),
  'visual-reg': Object.freeze(['browser_automation']),
  perf: Object.freeze(['lighthouse']),
} as const);

export function requiredCapabilitiesForSuites(suites: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(suites.flatMap((suite) => (
    SUITE_CAPABILITIES[suite as keyof typeof SUITE_CAPABILITIES] ?? []
  )))].sort());
}

export type JobState = 'accepted' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface BusterSuiteResult {
  readonly schemaVersion: typeof RESULT_SCHEMA;
  readonly jobId: string;
  readonly results: readonly Readonly<Record<string, unknown>>[];
  readonly suiteSummary: string;
  readonly suiteDetailSummary: string;
  readonly criticalFailed: boolean;
  readonly completedAt: string;
}

export interface BusterSuiteJob {
  readonly schemaVersion: typeof JOB_SCHEMA;
  readonly jobId: string;
  readonly idempotencyKey: string;
  readonly archive: {
    readonly encoding: 'base64';
    readonly sha256: string;
    readonly bytes: number;
    readonly data: string;
  };
  readonly suites: readonly string[];
  readonly testConfig: Readonly<Record<string, unknown>>;
  readonly task: Readonly<Record<string, unknown>>;
  readonly moduleId?: string;
  readonly attempt?: number;
  readonly capabilities: readonly string[];
  readonly timeoutMs: number;
}

const ID = /^[a-z0-9](?:[a-z0-9._:-]{0,190}[a-z0-9])?$/u;
const JOB_ID = /^job:[a-f0-9]{32}$/u;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function exact(value: Record<string, unknown>, fields: readonly string[], code: string): void {
  const allowed = new Set(fields);
  for (const field of Object.keys(value)) if (!allowed.has(field)) throw new Error(`${code}:${field}`);
}

export function stringList(value: unknown, label: string, allowEmpty = false, maxLength = 128): readonly string[] {
  if (
    !Array.isArray(value) || (!allowEmpty && value.length < 1)
    || value.some((entry) => typeof entry !== 'string' || entry.length < 1 || entry.length > maxLength)
    || new Set(value).size !== value.length
  ) throw new Error(`BUSTER_SUITE_INVALID:${label}`);
  return Object.freeze([...value] as string[]);
}

export function sha256(value: Buffer | string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function parseArchive(value: unknown, maxArchiveBytes: number): BusterSuiteJob['archive'] {
  if (!isRecord(value)) throw new Error('BUSTER_JOB_ARCHIVE_INVALID');
  exact(value, ['encoding', 'sha256', 'bytes', 'data'], 'BUSTER_JOB_ARCHIVE_UNKNOWN_FIELD');
  const valid = [value.encoding === 'base64', typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/u.test(value.sha256),
    Number.isSafeInteger(value.bytes) && Number(value.bytes) >= 1 && Number(value.bytes) <= maxArchiveBytes,
    typeof value.data === 'string'].every(Boolean);
  if (!valid) throw new Error('BUSTER_JOB_ARCHIVE_INVALID');
  const archive = Buffer.from(value.data as string, 'base64');
  if (archive.byteLength !== value.bytes || sha256(archive) !== value.sha256) throw new Error('BUSTER_JOB_ARCHIVE_DIGEST_MISMATCH');
  return Object.freeze({ encoding: 'base64', sha256: value.sha256 as string, bytes: Number(value.bytes), data: value.data as string });
}

function validateJobMetadata(value: Record<string, unknown>): void {
  if (value.schemaVersion !== JOB_SCHEMA) throw new Error('BUSTER_JOB_SCHEMA_INVALID');
  if (typeof value.jobId !== 'string' || !JOB_ID.test(value.jobId)) throw new Error('BUSTER_JOB_ID_INVALID');
  if (typeof value.idempotencyKey !== 'string' || !ID.test(value.idempotencyKey)) throw new Error('BUSTER_JOB_IDEMPOTENCY_INVALID');
  if (!Number.isSafeInteger(value.timeoutMs) || Number(value.timeoutMs) < 1 || Number(value.timeoutMs) > 7_200_000) throw new Error('BUSTER_JOB_TIMEOUT_INVALID');
  if (value.moduleId !== undefined && (typeof value.moduleId !== 'string' || !ID.test(value.moduleId))) throw new Error('BUSTER_JOB_MODULE_INVALID');
  if (value.attempt !== undefined && (!Number.isSafeInteger(value.attempt) || Number(value.attempt) < 1)) throw new Error('BUSTER_JOB_ATTEMPT_INVALID');
}

export function parseJob(value: unknown, maxArchiveBytes: number): BusterSuiteJob {
  if (!isRecord(value)) throw new Error('BUSTER_JOB_INVALID');
  exact(value, [
    'schemaVersion', 'jobId', 'idempotencyKey', 'archive', 'suites', 'testConfig',
    'task', 'moduleId', 'attempt', 'capabilities', 'timeoutMs',
  ], 'BUSTER_JOB_UNKNOWN_FIELD');
  validateJobMetadata(value);
  const archive = parseArchive(value.archive, maxArchiveBytes);
  const suites = stringList(value.suites, 'suites');
  if (suites.some((suite) => !LEGACY_UNMIGRATED_SUITES.includes(suite as typeof LEGACY_UNMIGRATED_SUITES[number]))) {
    throw new Error('BUSTER_JOB_SUITE_UNSUPPORTED');
  }
  if (!isRecord(value.testConfig) || !isRecord(value.task)) throw new Error('BUSTER_JOB_PAYLOAD_INVALID');
  const capabilities = stringList(value.capabilities, 'capabilities', true);
  const requiredCapabilities = requiredCapabilitiesForSuites(suites);
  if (
    capabilities.length !== requiredCapabilities.length
    || capabilities.some((capability, index) => capability !== requiredCapabilities[index])
  ) throw new Error('BUSTER_JOB_CAPABILITIES_INVALID');
  return Object.freeze({
    schemaVersion: JOB_SCHEMA,
    jobId: value.jobId as string,
    idempotencyKey: value.idempotencyKey as string,
    archive,
    suites,
    testConfig: Object.freeze({ ...value.testConfig }),
    task: Object.freeze({ ...value.task }),
    ...(value.moduleId === undefined ? {} : { moduleId: value.moduleId as string }),
    ...(value.attempt === undefined ? {} : { attempt: Number(value.attempt) }),
    capabilities,
    timeoutMs: Number(value.timeoutMs),
  });
}

export function parseResult(value: unknown, expectedJobId?: string): BusterSuiteResult {
  if (!isRecord(value)) throw new Error('BUSTER_RESULT_INVALID');
  exact(value, [
    'schemaVersion', 'jobId', 'results', 'suiteSummary', 'suiteDetailSummary',
    'criticalFailed', 'completedAt',
  ], 'BUSTER_RESULT_UNKNOWN_FIELD');
  if (value.schemaVersion !== RESULT_SCHEMA) throw new Error('BUSTER_RESULT_SCHEMA_INVALID');
  const validJob = typeof value.jobId === 'string' && JOB_ID.test(value.jobId)
    && (expectedJobId === undefined || value.jobId === expectedJobId);
  if (!validJob) throw new Error('BUSTER_RESULT_JOB_INVALID');
  const validPayload = [Array.isArray(value.results) && value.results.every(isRecord),
    typeof value.suiteSummary === 'string' && value.suiteSummary.length <= 65_536,
    typeof value.suiteDetailSummary === 'string' && value.suiteDetailSummary.length <= 1_048_576,
    typeof value.criticalFailed === 'boolean', typeof value.completedAt === 'string' && Number.isFinite(Date.parse(value.completedAt))].every(Boolean);
  if (!validPayload) throw new Error('BUSTER_RESULT_PAYLOAD_INVALID');
  const results = value.results as Record<string, unknown>[];
  return Object.freeze({
    schemaVersion: RESULT_SCHEMA,
    jobId: value.jobId as string,
    results: Object.freeze(results.map((entry) => Object.freeze({ ...entry }))),
    suiteSummary: value.suiteSummary as string,
    suiteDetailSummary: value.suiteDetailSummary as string,
    criticalFailed: value.criticalFailed as boolean,
    completedAt: value.completedAt as string,
  });
}

export function relocateRepositoryValues(
  value: unknown,
  sourceRoot: string,
  marker = 'repo://',
): unknown {
  if (typeof value === 'string') {
    if (value === sourceRoot) return marker;
    if (value.startsWith(`${sourceRoot}/`)) return `${marker}${value.slice(sourceRoot.length + 1)}`;
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => relocateRepositoryValues(entry, sourceRoot, marker));
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    relocateRepositoryValues(entry, sourceRoot, marker),
  ]));
}

export function materializeRepositoryValues(value: unknown, repositoryRoot: string): unknown {
  if (typeof value === 'string') {
    if (value === 'repo://') return repositoryRoot;
    if (value.startsWith('repo://')) {
      const relative = value.slice('repo://'.length);
      if (
        relative.length < 1 || pathLikeAbsolute(relative)
        || relative.split('/').some((segment) => segment === '..' || segment === '')
      ) throw new Error('BUSTER_JOB_REPOSITORY_PATH_INVALID');
      return `${repositoryRoot}/${relative}`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => materializeRepositoryValues(entry, repositoryRoot));
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    materializeRepositoryValues(entry, repositoryRoot),
  ]));
}

function pathLikeAbsolute(value: string): boolean {
  return value.startsWith('/') || /^[a-z]:[\\/]/iu.test(value) || value.includes('\\');
}
