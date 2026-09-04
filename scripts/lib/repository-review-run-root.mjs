import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const MAX_LEGACY_EVENT_BYTES = 256 * 1024;

function journalContainsRunId(events, runId) {
  const descriptor = fs.openSync(events, 'r');
  try {
    const buffer = Buffer.alloc(64 * 1024);
    let offset = 0, lineBytes = 0, oversized = false;
    let parts = [];
    const append = (part) => {
      if (oversized || part.length === 0) return;
      if (lineBytes + part.length > MAX_LEGACY_EVENT_BYTES) {
        parts = []; lineBytes = 0; oversized = true;
        return;
      }
      parts.push(Buffer.from(part)); lineBytes += part.length;
    };
    const matches = () => {
      if (oversized || lineBytes === 0) return false;
      try {
        const record = JSON.parse(Buffer.concat(parts, lineBytes).toString('utf8'));
        return (record?.entry?.identity?.runId ?? record?.identity?.runId) === runId;
      } catch (_error) {
        return false;
      }
    };
    for (;;) {
      const length = fs.readSync(descriptor, buffer, 0, buffer.length, offset);
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

export function repositoryReviewRunRoot(storageRoot, runId) {
  if (!RUN_ID.test(runId)) throw new Error(`PIPELINE_RUN_ID_INVALID:${runId}`);
  const runsRoot = path.resolve(storageRoot, 'runs');
  const key = createHash('sha256').update(runId, 'utf8').digest('hex');
  const resolved = path.join(runsRoot, `v2-${key}`);
  if (fs.existsSync(resolved)) return resolved;
  const legacy = path.join(runsRoot, runId.replaceAll(':', '_'));
  if (!fs.existsSync(legacy)) return resolved;
  const events = path.join(legacy, 'events.jsonl');
  if (!fs.existsSync(events)) throw new Error(`PIPELINE_RUN_ID_LEGACY_UNVERIFIED:${runId}`);
  return journalContainsRunId(events, runId) ? legacy : resolved;
}
