import fs from 'node:fs';
import path from 'node:path';
import { writeDurableState, withDurableStoreLock } from '@kubeclaw/plugin-foundation/observability/durable-delivery';
import { remotePlanJobId, validatePipelineTestGateContract } from '@kubeclaw/pipeline-test-gate-contract';
import { assertDurableRecordReplay } from '@kubeclaw/plugin-foundation/observability/durable-records';
import { BusterRunRetention, maximumRetentionMs, type DeliveryReceipt } from './run-retention.ts';
import type { RunHeader } from './run-records.ts';
/** Stream the native canonical v1 envelope. Never build the historical JSON string.
 * Only one bounded record is decoded at a time. Non-native envelopes fail closed. */
async function* records(file: string, maximumRecordBytes: number) {
  const prefix = Buffer.from('{"records":[');
  let offset = 0, depth = 0, quoted = false, escape = false, ended = false, size = 0;
  let pieces: Buffer[] = [];
  let suffix = '';
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  if (!fs.fstatSync(fd).isFile()) {
    fs.closeSync(fd);
    throw new Error('BUSTER_LEGACY_FILE_INVALID');
  }
  const stream = fs.createReadStream(file, { highWaterMark: 65536, fd, autoClose: true });
  for await (const raw of stream) {
    const chunk = Buffer.from(raw);
    let start = -1;
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i]!;
      if (offset < prefix.length) {
        if (c !== prefix[offset++])
          throw new Error('BUSTER_LEGACY_ENVELOPE_INVALID');
        continue;
      }
      if (ended) {
        suffix += String.fromCharCode(c);
        if (suffix.length > 128)
          throw new Error('BUSTER_LEGACY_ENVELOPE_INVALID');
        continue;
      }
      if (depth === 0) {
        if (c === 44)
          continue;
        if (c === 93) {
          ended = true;
          continue;
        }
        if (c !== 123)
          throw new Error('BUSTER_LEGACY_ENVELOPE_INVALID');
        start = i;
        depth = 1;
        continue;
      }
      if (quoted) {
        if (escape)
          escape = false;
        else if (c === 92)
          escape = true;
        else if (c === 34)
          quoted = false;
      }
      else if (c === 34)
        quoted = true;
      else if (c === 123 || c === 91)
        depth++;
      else if (c === 125 || c === 93)
        depth--;
      if (depth === 0) {
        const piece = chunk.subarray(start < 0 ? 0 : start, i + 1);
        pieces.push(piece);
        size += piece.length;
        if (size > maximumRecordBytes)
          throw new Error('BUSTER_LEGACY_RECORD_LIMIT');
        yield JSON.parse(Buffer.concat(pieces, size).toString());
        pieces = [];
        size = 0;
        start = -1;
      }
    }
    if (depth > 0) {
      const piece = chunk.subarray(start < 0 ? 0 : start);
      pieces.push(piece);
      size += piece.length;
      if (size > maximumRecordBytes)
        throw new Error('BUSTER_LEGACY_RECORD_LIMIT');
    }
  }
  if (depth !== 0 || !ended || suffix !== ',"schemaVersion":"pipeline-durable-record-store.v1"}')
    throw new Error('BUSTER_LEGACY_ENVELOPE_INVALID');
}
/** Explicit startup-only discard, after the old Recreate deployment has stopped.
 * Active/uncertain legacy states veto it. Small replay receipts survive deletion. */
export async function discardLegacyJournal(root: string, options: {
  maximumRecordBytes: number;
  maximumBytes: number;
  maximumRecords: number;
}, now: string) {
  const file = path.join(root, 'records', 'store.json');
  if (!fs.existsSync(file))
    return { discarded: false, records: 0, bytes: 0 };
  return withDurableStoreLock(path.join(root, 'legacy-admission'), () => withDurableStoreLock(file, async () => {
    const stat = await fs.promises.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > options.maximumBytes || await fs.promises.realpath(file) !== path.resolve(file))
      throw new Error('BUSTER_LEGACY_FILE_INVALID');
    if (fs.existsSync(path.join(root, 'jobs')) && (await fs.promises.readdir(path.join(root, 'jobs'))).length)
      throw new Error('BUSTER_LEGACY_LAYOUT_CONFLICT');
    const headers: RunHeader[] = [];
    const seen = new Set<string>();
    for await (const record of records(file, options.maximumRecordBytes + 32768)) {
      if(record.sequence!==headers.length+1)throw new Error('BUSTER_LEGACY_RECORD_INVALID');
    assertDurableRecordReplay({schemaVersion:'pipeline-durable-record-store.v1',records:[{...record,sequence:1}]});
    const p = record.payload, job = p?.job, status = p?.status;
      if (record.stream !== 'buster-plan-jobs' || !job || !status || remotePlanJobId(record.idempotencyKey) !== job.jobId || status.jobId !== job.jobId || status.requestDigest !== job.requestDigest || seen.has(job.jobId))
        throw new Error('BUSTER_LEGACY_RECORD_INVALID');
      validatePipelineTestGateContract('remotePlanStatus', status);
      if (!['completed', 'failed', 'cancelled'].includes(status.state))
        throw new Error('BUSTER_LEGACY_ACTIVE_JOBS');
      seen.add(job.jobId);
      headers.push({ jobId: job.jobId, requestDigest: job.requestDigest, status, committedAt: record.committedAt });
      if (headers.length > options.maximumRecords)
        throw new Error('BUSTER_LEGACY_RECORD_LIMIT');
    }
    const receipts = new BusterRunRetention(root);
    const expiresAt = new Date(Date.parse(now) + maximumRetentionMs).toISOString();
    for (const h of headers) {
      const old = await receipts.receipt(h.jobId);
      if (old) {
        if (old.requestDigest !== h.requestDigest || old.status.state !== h.status.state || old.status.result?.resultDigest !== h.status.result?.resultDigest)
          throw new Error('BUSTER_DELIVERY_CONFLICT');
        continue;
      }
      const r: DeliveryReceipt = { ...h, status: { ...h.status, error: h.status.error ? 'BUSTER_REMOTE_DATA_EXPIRED' : null }, schemaVersion: 'buster-delivery-receipt.v1', deliveredAt: null, purgeRequestedAt: now, deletedAt: null, expiresAt };
      await writeDurableState(receipts.file(h.jobId), r);
    }
    const current = await fs.promises.lstat(file);
    if (current.ino !== stat.ino || current.size !== stat.size || current.mtimeMs !== stat.mtimeMs)
      throw new Error('BUSTER_LEGACY_CHANGED');
    await fs.promises.unlink(file);
    const directory = await fs.promises.open(path.dirname(file), 'r');
    try {
      await directory.sync();
    }
    finally {
      await directory.close();
    }
    return { discarded: true, records: headers.length, bytes: stat.size };
  }));
}
