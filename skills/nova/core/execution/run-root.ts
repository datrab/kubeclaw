import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

export function runRoot(storageRoot: string, runId: string): string {
  if (!RUN_ID.test(runId)) throw new Error(`PIPELINE_RUN_ID_INVALID:${runId}`);
  const runsRoot = path.resolve(storageRoot, 'runs');
  const key = createHash('sha256').update(runId, 'utf8').digest('hex');
  const resolved = path.join(runsRoot, `v2-${key}`);
  if (fs.existsSync(resolved)) return resolved;
  const legacy = path.join(runsRoot, runId.replaceAll(':', '_'));
  if (!fs.existsSync(legacy)) return resolved;
  const events = path.join(legacy, 'events.jsonl');
  if (!fs.existsSync(events)) throw new Error(`PIPELINE_RUN_ID_LEGACY_UNVERIFIED:${runId}`);
  const descriptor = fs.openSync(events, 'r');
  try {
    const buffer = Buffer.alloc(256 * 1024);
    const length = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    const matches = buffer.subarray(0, length).toString('utf8').split('\n').some((line) => {
      if (!line) return false;
      try {
        const record = JSON.parse(line);
        return (record?.entry?.identity?.runId ?? record?.identity?.runId) === runId;
      } catch { return false; }
    });
    return matches ? legacy : resolved;
  } finally { fs.closeSync(descriptor); }
}
