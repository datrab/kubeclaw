type AnyRecord = Record<string, any>;

export type CompletionStreamDependencies = {
  normalizeExpectedIdentity(expected: any): AnyRecord;
  hasStrongIdentity(identity: AnyRecord): boolean;
  matchesTarget(entry: AnyRecord, moduleId: any): boolean;
  matchesIdentity(entry: AnyRecord, expected: AnyRecord): boolean;
  isCanonical(entry: AnyRecord): boolean;
  validate(entry: AnyRecord, moduleId: any, expected: AnyRecord): AnyRecord;
  conflict(entries: AnyRecord[], moduleId: any, expected: AnyRecord): AnyRecord | null;
  attachDuplicates(entry: AnyRecord | null, entries: AnyRecord[]): AnyRecord | null;
  attachIgnored(entry: AnyRecord | null, entries: AnyRecord[]): AnyRecord | null;
  firstDefined(...values: any[]): any;
};

function decodeStreamEntry(id: any, fields: any): AnyRecord {
  const entry: AnyRecord = { _id: id };
  for (let index = 0; index < fields.length; index += 2) entry[fields[index]] = fields[index + 1];
  return entry;
}

function positiveFinite(value: unknown, name: string): number {
  const normalized = Math.max(1, Number(value));
  if (!Number.isFinite(normalized)) throw new TypeError(`${name} must be a finite number`);
  return normalized;
}

class CompletionTailScanner {
  private nextEnd = '+';
  private scanned = 0;
  private batches = 0;
  private latestMatch: AnyRecord | null = null;
  private readonly matched: AnyRecord[] = [];
  private readonly redis: any;
  private readonly streamKey: any;
  private readonly moduleId: any;
  private readonly expected: AnyRecord;
  private readonly batchSize: number;
  private readonly scanLimit: number;
  private readonly dependencies: CompletionStreamDependencies;

  constructor(
    redis: any,
    streamKey: any,
    moduleId: any,
    expected: AnyRecord,
    batchSize: number,
    scanLimit: number,
    dependencies: CompletionStreamDependencies,
  ) {
    this.redis = redis;
    this.streamKey = streamKey;
    this.moduleId = moduleId;
    this.expected = expected;
    this.batchSize = batchSize;
    this.scanLimit = scanLimit;
    this.dependencies = dependencies;
  }

  async scan(): Promise<AnyRecord> {
    while (this.scanned < this.scanLimit) {
      const result = await this.scanBatch();
      if (result.done) return result.value ?? this.finalResult();
    }
    return this.finalResult();
  }

  private async scanBatch(): Promise<{ done: boolean; value?: AnyRecord }> {
    const count = Math.min(this.batchSize, Math.max(1, this.scanLimit - this.scanned));
    const entries = await this.redis.xrevrange(this.streamKey, this.nextEnd, '-', 'COUNT', count);
    this.batches += 1;
    if (!Array.isArray(entries) || entries.length === 0) return { done: true };
    this.scanned += entries.length;

    for (const [id, fields] of entries) {
      const result = this.acceptEntry(decodeStreamEntry(id, fields));
      if (result) return { done: true, value: result };
    }
    if (entries.length < count) return { done: true };
    this.nextEnd = `(${entries[entries.length - 1][0]}`;
    return { done: false };
  }

  private acceptEntry(entry: AnyRecord): AnyRecord | null {
    const deps = this.dependencies;
    if (entry.type !== 'completion') return null;
    if (!deps.matchesTarget(entry, this.moduleId)) return null;
    if (!deps.matchesIdentity(entry, this.expected)) return null;
    if (!deps.isCanonical(entry)) {
      this.matched.push(entry);
      return null;
    }
    const validated = deps.validate(entry, this.moduleId, this.expected);
    if (!validated.valid) return this.invalidResult(validated.invalid);
    this.matched.push(entry);
    this.latestMatch ??= entry;
    return Object.keys(this.expected).length === 0 ? this.identityFreeResult(entry) : null;
  }

  private invalidResult(invalid: AnyRecord): AnyRecord {
    return { match: invalid, scanned: this.scanned, batches: this.batches, truncated: false, conflict: invalid };
  }

  private identityFreeResult(entry: AnyRecord): AnyRecord {
    const ignored = this.matched.filter((candidate) => !this.dependencies.isCanonical(candidate));
    return {
      match: this.dependencies.attachIgnored(entry, ignored),
      scanned: this.scanned,
      batches: this.batches,
      truncated: false,
    };
  }

  private finalResult(): AnyRecord {
    const deps = this.dependencies;
    const selectable = this.matched.filter((entry) => deps.isCanonical(entry));
    const ignored = this.matched.filter((entry) => !deps.isCanonical(entry));
    const conflict = deps.conflict(selectable, this.moduleId, this.expected);
    const preferred = deps.firstDefined(selectable[0], this.latestMatch);
    return {
      match: deps.firstDefined(conflict, deps.attachIgnored(deps.attachDuplicates(preferred, selectable), ignored)),
      scanned: this.scanned,
      batches: this.batches,
      truncated: this.scanned >= this.scanLimit,
      conflict: conflict ?? null,
    };
  }
}

export async function scanCompletionTail(
  redis: any,
  streamKey: any,
  moduleId: any,
  expected: any,
  opts: any,
  dependencies: CompletionStreamDependencies,
): Promise<AnyRecord> {
  if (opts.batchSize === undefined || opts.scanLimit === undefined) {
    throw new TypeError('scanLatestCompletionFromTail requires explicit batchSize and scanLimit');
  }
  const batchSize = positiveFinite(opts.batchSize, 'scanLatestCompletionFromTail batchSize');
  const scanLimit = Math.max(batchSize, positiveFinite(opts.scanLimit, 'scanLatestCompletionFromTail scanLimit'));
  return new CompletionTailScanner(
    redis,
    streamKey,
    moduleId,
    dependencies.normalizeExpectedIdentity(expected),
    batchSize,
    scanLimit,
    dependencies,
  ).scan();
}

export async function archiveCompletionEntries(
  redis: any,
  streamKey: any,
  archiveStreamKey: any,
  moduleId: any,
  maxLen: any,
  opts: any,
  dependencies: CompletionStreamDependencies,
): Promise<AnyRecord> {
  if (maxLen === undefined || opts.batchSize === undefined) {
    throw new TypeError('archiveCompletionsChunked requires explicit maxLen and batchSize');
  }
  const archiveMaxLen = positiveFinite(maxLen, 'archiveCompletionsChunked maxLen');
  const batchSize = positiveFinite(opts.batchSize, 'archiveCompletionsChunked batchSize');
  let expected = {};
  if (opts.activeIdentity !== undefined) expected = opts.activeIdentity;
  else if (opts.expectedIdentity !== undefined) expected = opts.expectedIdentity;
  else if (opts.expected !== undefined) expected = opts.expected;
  const activeIdentity = dependencies.normalizeExpectedIdentity(expected);
  const hasActiveIdentity = dependencies.hasStrongIdentity(activeIdentity);
  const counts = { scanned: 0, archived: 0, batches: 0 };
  let nextStart = '-';

  while (true) {
    const entries = await redis.xrange(streamKey, nextStart, '+', 'COUNT', batchSize);
    counts.batches += 1;
    if (!Array.isArray(entries) || entries.length === 0) break;
    counts.scanned += entries.length;
    const matching = entries.filter(([id, fields]: any) => {
      const entry = decodeStreamEntry(id, fields);
      if (entry.type !== 'completion') return false;
      if (!dependencies.matchesTarget(entry, moduleId)) return false;
      return !(hasActiveIdentity && dependencies.matchesIdentity(entry, activeIdentity));
    });
    if (matching.length > 0) {
      const tx = redis.multi();
      const archivedAt = Date.now().toString();
      for (const [id, fields] of matching) {
        tx.xadd(archiveStreamKey, '*', ...fields, 'archived_at', archivedAt);
        tx.xdel(streamKey, id);
      }
      await tx.exec();
      counts.archived += matching.length;
    }
    if (entries.length < batchSize) break;
    nextStart = `(${entries[entries.length - 1][0]}`;
  }
  await redis.xtrim(archiveStreamKey, 'MAXLEN', '~', archiveMaxLen);
  return {
    archived: counts.archived,
    scanned: counts.scanned,
    batches: counts.batches,
    active_identity: activeIdentity,
    identity_scoped: hasActiveIdentity,
  };
}
