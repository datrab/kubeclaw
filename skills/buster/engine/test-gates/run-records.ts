import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { canonicalJson } from '@kubeclaw/pipeline-observability-contract';
import { remotePlanJobId, validatePipelineTestGateContract, type RemotePlanStatusV1 } from '@kubeclaw/pipeline-test-gate-contract';
import { type DurableRecord, type DurableRecordLimits } from '@kubeclaw/plugin-foundation/observability/durable-records';
import { ensureDirectoryDurable, withDurableStoreLock } from '@kubeclaw/plugin-foundation/observability/durable-delivery';
import type { StoredPlanJob } from './remote-plan-compaction.ts';
export interface RunHeader {
  readonly jobId: string;
  readonly requestDigest: string;
  readonly status: RemotePlanStatusV1;
  readonly committedAt: string;
  readonly quiescent?: true;
}
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const digest = (value: unknown) => 'sha256:' + hash(canonicalJson(value));
export function runDirectory(root: string, jobId: string): string {
  if (!/^job:[a-f0-9]{64}$/u.test(jobId))
    throw new Error('BUSTER_REMOTE_JOB_ID_INVALID');
  return path.join(root, hash(jobId));
}
/** One atomic, two-line document per run: bounded status header, then full record.
 * No cross-run JSON parsing/serialization, and no archive reads on status paths. */
export class BusterRunRecords {
  readonly directory: string;
  readonly root: string;
  readonly limits: DurableRecordLimits;
  constructor(root: string, limits: DurableRecordLimits, allowLegacyStartup = false) { if ([limits.maximumRecords,limits.maximumBytes,limits.maximumRecordBytes].some(n => !Number.isSafeInteger(n) || n < 1))
    throw new Error('BUSTER_RUN_LIMIT_INVALID'); this.root = path.resolve(root); this.limits = limits; this.directory = path.join(this.root, 'jobs'); if (!allowLegacyStartup && existsSync(path.join(this.root, 'records', 'store.json')))
    throw new Error('BUSTER_LEGACY_JOURNAL_PRESENT'); }
  file(jobId: string) { return path.join(runDirectory(this.directory, jobId), 'run.ndjson'); }
  async #exists(file: string) { try {
    const s = await fs.lstat(file);
    if (!s.isFile() || s.isSymbolicLink() || await fs.realpath(file) !== path.resolve(file))
      throw new Error('BUSTER_RUN_FILE_INVALID');
    return s;
  }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT')
      return null;
    throw e;
  } }
  #assertLayout() { if (existsSync(path.join(this.root, 'records', 'store.json')))
    throw new Error('BUSTER_LEGACY_JOURNAL_PRESENT'); }
  async headers(): Promise<RunHeader[]> {
    this.#assertLayout();
    await ensureDirectoryDurable(this.directory);
    const entries = await fs.readdir(this.directory, { withFileTypes: true });
    if (entries.length > this.limits.maximumRecords * 2)
      throw new Error('DURABLE_RECORD_STORE_FULL');
    const result: RunHeader[] = [];
    for (const e of entries) {
      if (!e.isDirectory() || !(/^[a-f0-9]{64}$/u.test(e.name)))
        throw new Error('BUSTER_RUN_FILE_INVALID');
      const h = await this.headerFile(path.join(this.directory, e.name, 'run.ndjson'));
      if (h) {
        if (hash(h.jobId) !== e.name)
          throw new Error('BUSTER_RUN_FILE_INVALID');
        result.push(h);
      }
    }
    return result.sort((a, b) => a.committedAt.localeCompare(b.committedAt) || a.jobId.localeCompare(b.jobId));
  }
  async headerFile(file: string): Promise<RunHeader | null> {
    this.#assertLayout();
    if (!await this.#exists(file))
      return null;
    const handle = await fs.open(file, 'r');
    try {
      const b = Buffer.alloc(65536);
      const { bytesRead } = await handle.read(b, 0, b.length, 0);
      const end = b.subarray(0, bytesRead).indexOf(10);
      if (end < 0)
        throw new SyntaxError('BUSTER_RUN_HEADER_INVALID');
      const h = JSON.parse(b.subarray(0, end).toString()) as RunHeader;
      validatePipelineTestGateContract('remotePlanStatus', h.status);
      if (typeof h.committedAt !== 'string' || !Number.isFinite(Date.parse(h.committedAt)) || h.jobId !== h.status.jobId || h.requestDigest !== h.status.requestDigest)
        throw new Error('BUSTER_RUN_HEADER_INVALID');
      runDirectory(this.directory, h.jobId);
      return h;
    }
    finally {
      await handle.close();
    }
  }
  async header(jobId: string) { return this.headerFile(this.file(jobId)); }
  async one(jobId: string): Promise<DurableRecord<StoredPlanJob> | null> {
    this.#assertLayout();
    const file = this.file(jobId);
    const stat = await this.#exists(file);
    if (!stat)
      return null;
    if (stat.size > this.limits.maximumRecordBytes + 32768)
      throw new Error('DURABLE_RECORD_SIZE_EXCEEDED');
    const text = await fs.readFile(file, 'utf8');
    const line = text.indexOf('\n');
    const h = JSON.parse(text.slice(0, line)) as RunHeader;
    const record = JSON.parse(text.slice(line + 1)) as DurableRecord<StoredPlanJob>;
    if (record.payload.job.jobId !== jobId || record.payloadDigest !== digest(record.payload) || canonicalJson(h) !== canonicalJson({ jobId, requestDigest: record.payload.job.requestDigest, status: record.payload.status, committedAt: record.committedAt, ...(record.payload.quiescent ? { quiescent: true } : {}) }))
      throw new Error('BUSTER_RUN_RECORD_INVALID');
    return record;
  }
  async read<T>(_stream: string): Promise<ReadonlyArray<DurableRecord<T>>> { const result = []; for (const h of await this.headers()) {
    const r = await this.one(h.jobId);
    if (r)
      result.push(r);
  } return result as unknown as DurableRecord<T>[]; }
  async #write(record: DurableRecord<StoredPlanJob>) {
    const jobId = record.payload.job.jobId;
    const file = this.file(jobId);
    const body = canonicalJson(record);
    if (Buffer.byteLength(canonicalJson(record.payload)) > this.limits.maximumRecordBytes)
      throw new Error('DURABLE_RECORD_SIZE_EXCEEDED');
    const bytes = Buffer.from(canonicalJson({ jobId, requestDigest: record.payload.job.requestDigest, status: record.payload.status, committedAt: record.committedAt, ...(record.payload.quiescent ? { quiescent: true } : {}) }) + '\n' + body + '\n');
    let total = 0, count = 0;
    for (const e of await fs.readdir(this.directory, { withFileTypes: true })) {
      if (!e.isDirectory() || !(/^[a-f0-9]{64}$/u.test(e.name)))
        throw new Error('BUSTER_RUN_FILE_INVALID');
      const p = path.join(this.directory, e.name, 'run.ndjson');
      const s = await this.#exists(p);
      if (s) {
        count++;
        if (p !== file)
          total += s.size;
      }
    }
    if (count + (await this.#exists(file) ? 0 : 1) > this.limits.maximumRecords || total + bytes.length > this.limits.maximumBytes)
      throw new Error('DURABLE_RECORD_STORE_FULL');
    await ensureDirectoryDurable(path.dirname(file));
    const temp = file + '.' + crypto.randomUUID() + '.tmp';
    let renamed = false;
    try {
      const f = await fs.open(temp, 'wx', 0o600);
      try {
        await f.writeFile(bytes);
        await f.sync();
      }
      finally {
        await f.close();
      }
      await fs.rename(temp, file);
      renamed = true;
      const d = await fs.open(path.dirname(file), 'r');
      try {
        await d.sync();
      }
      finally {
        await d.close();
      }
    }
    finally {
      if (!renamed)
        await fs.unlink(temp).catch(() => undefined);
    }
  }
  async append(_stream: string, key: string, payload: StoredPlanJob) {
    return withDurableStoreLock(path.join(this.root, 'capacity', 'fence'), async () => {
      const old = await this.one(payload.job.jobId);
      if (old) {
        if (old.idempotencyKey !== key || old.payload.job.requestDigest !== payload.job.requestDigest)
          throw new Error('DURABLE_RECORD_IDEMPOTENCY_CONFLICT');
        return { appended: false, record: old };
      }
      if (remotePlanJobId(key) !== payload.job.jobId)
        throw new Error('BUSTER_REMOTE_JOB_ID_INVALID');
      const record: DurableRecord<StoredPlanJob> = { schemaVersion: 'pipeline-durable-record.v1', stream: 'buster-plan-jobs', sequence: 1, idempotencyKey: key, committedAt: new Date().toISOString(), payloadDigest: digest(payload), payload: structuredClone(payload) };
      await this.#write(record);
      return { appended: true, record };
    });
  }
  async transition(_stream: string, key: string, expected: string, payload: StoredPlanJob) {
    return withDurableStoreLock(path.join(this.root, 'capacity', 'fence'), async () => {
      const old = await this.one(remotePlanJobId(key));
      if (!old || old.payloadDigest !== expected)
        throw new Error('DURABLE_RECORD_TRANSITION_CONFLICT');
      const record = { ...old, payload: structuredClone(payload), payloadDigest: digest(payload) };
      await this.#write(record);
      return record;
    });
  }
}
