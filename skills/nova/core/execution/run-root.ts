import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const MAX_LEGACY_EVENT_BYTES = 256 * 1024;

function journalContainsRunId(events: string, runId: string, maximumBytes?: number): boolean {
  const descriptor = fs.openSync(events, maximumBytes === undefined ? 'r' : fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    if (maximumBytes !== undefined) {
      const stat = fs.fstatSync(descriptor);
      if (!stat.isFile() || stat.size > maximumBytes) throw new Error('LEGACY_SCAN_BYTE_LIMIT');
    }
    const buffer = Buffer.alloc(64 * 1024);
    let offset = 0, lineBytes = 0, oversized = false;
    let parts: Buffer[] = [];
    const append = (part: Buffer): void => {
      if (oversized || part.length === 0) return;
      if (lineBytes + part.length > MAX_LEGACY_EVENT_BYTES) {
        parts = []; lineBytes = 0; oversized = true;
        return;
      }
      parts.push(Buffer.from(part)); lineBytes += part.length;
    };
    const matches = (): boolean => {
      if (maximumBytes !== undefined && fs.fstatSync(descriptor).size > maximumBytes) throw new Error('LEGACY_SCAN_BYTE_LIMIT');
      if (oversized || lineBytes === 0) return false;
      try {
        const record = JSON.parse(Buffer.concat(parts, lineBytes).toString('utf8'));
        return (record?.entry?.identity?.runId ?? record?.identity?.runId) === runId;
      } catch {
        return false;
      }
    };
    for (;;) {
      if (maximumBytes !== undefined && fs.fstatSync(descriptor).size > maximumBytes) throw new Error('LEGACY_SCAN_BYTE_LIMIT');
      const remaining = maximumBytes === undefined ? buffer.length : maximumBytes - offset;
      if (remaining === 0) break;
      const length = fs.readSync(descriptor, buffer, 0, Math.min(buffer.length, remaining), offset);
      if (length === 0) break;
      offset += length;
      let cursor = 0;
      for (;;) {
        const newline = buffer.indexOf(0x0a, cursor);
        if (newline < 0 || newline >= length) {
          append(buffer.subarray(cursor, length));
          break;
        }
        append(buffer.subarray(cursor, newline));
        if (matches()) return true;
        parts = []; lineBytes = 0; oversized = false;
        cursor = newline + 1;
      }
    }
    return matches();
  } finally {
    fs.closeSync(descriptor);
  }
}

export function runRoot(storageRoot: string, runId: string, options: { maximumLegacyBytes?: number } = {}): string {
  if (options.maximumLegacyBytes !== undefined && (!Number.isSafeInteger(options.maximumLegacyBytes) || options.maximumLegacyBytes < 1)) {
    throw new Error('LEGACY_SCAN_LIMIT_INVALID');
  }
  if (!RUN_ID.test(runId)) throw new Error(`PIPELINE_RUN_ID_INVALID:${runId}`);
  const runsRoot = path.resolve(storageRoot, 'runs');
  const key = createHash('sha256').update(runId, 'utf8').digest('hex');
  const resolved = path.join(runsRoot, `v2-${key}`);
  if (fs.existsSync(resolved)) return resolved;
  const legacy = path.join(runsRoot, runId.replaceAll(':', '_'));
  if (!fs.existsSync(legacy)) return resolved;
  const events = path.join(legacy, 'events.jsonl');
  if (!fs.existsSync(events)) throw new Error(`PIPELINE_RUN_ID_LEGACY_UNVERIFIED:${runId}`);
  return journalContainsRunId(events, runId, options.maximumLegacyBytes) ? legacy : resolved;
}
