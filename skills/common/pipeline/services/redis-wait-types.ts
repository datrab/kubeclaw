export type UnknownRecord = Record<string, any>;
export type GenericFunction = (...args: any[]) => any;

export type RedisClientLike = {
  disconnect?: () => unknown;
  quit?: () => Promise<unknown>;
  on?: (event: string, listener: (...args: any[]) => void) => unknown;
};

type RedisWaitBudget = { remainingMs?: () => number };

export type RedisWaitOptions = {
  config?: UnknownRecord;
  streamKey?: string;
  targetKind?: 'module' | 'gate';
  targetId?: string;
  expectedStatuses?: unknown;
  expectedIdentity?: UnknownRecord;
  timeoutMs?: number;
  watchPaths?: string[];
  getLocalStatus?: () => unknown;
  statusSource?: string;
  RedisCtor?: unknown;
  redisOptions?: UnknownRecord | null;
  budget?: RedisWaitBudget | null;
  redisBlockMs?: number;
  recoveryScanIntervalMs?: number;
  tailScanBatchSize?: number;
  tailScanLimit?: number;
  createRedisCompletionEventAdapter?: GenericFunction;
  createLocalEvidenceEventAdapter?: GenericFunction;
  createRedisClient?: GenericFunction;
  scanLatestCompletionFromTail?: GenericFunction;
  waitForCompletion?: GenericFunction;
  resolveCompletionEvent?: GenericFunction;
  log?: GenericFunction;
  logRedisOperation?: GenericFunction;
  logRedisReceived?: GenericFunction;
};

export type NormalizedRedisWaitOptions = {
  config: UnknownRecord;
  streamKey: string;
  targetKind: 'module' | 'gate';
  targetId: string;
  expectedStatuses: unknown;
  expectedIdentity: UnknownRecord;
  timeoutMs: number;
  watchPaths: string[];
  getLocalStatus: () => unknown;
  statusSource: string;
  RedisCtor: unknown;
  redisOptions: UnknownRecord;
  budget: RedisWaitBudget | null;
  redisBlockMs: number;
  recoveryScanIntervalMs: number;
  tailScanBatchSize: number;
  tailScanLimit: number;
  createRedisCompletionEventAdapter: GenericFunction;
  createLocalEvidenceEventAdapter: GenericFunction;
  createRedisClient: GenericFunction;
  scanLatestCompletionFromTail: GenericFunction;
  waitForCompletion: GenericFunction;
  resolveCompletionEvent: GenericFunction;
  log: GenericFunction;
  logRedisOperation: GenericFunction;
  logRedisReceived: GenericFunction;
};
