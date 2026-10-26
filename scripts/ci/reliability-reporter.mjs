import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { spec } from 'node:test/reporters';

// Preserve the normal reporter and exit status; collect real per-file elapsed
// time instead of double-counting nested test durations from formatted logs.
export default async function* reporter(source) {
  const timings = {};
  async function* record() {
    for await (const event of source) {
      if (event.type === 'test:summary' && event.data.file) {
        const name = path.basename(event.data.file);
        if (/\.test\.(mts|mjs)$/u.test(name)) timings[name] = {
          seconds: event.data.duration_ms / 1000, success: event.data.success,
        };
      }
      yield event;
    }
  }
  yield* Readable.from(record()).pipe(new spec());
  const output = process.env.KUBECLAW_RELIABILITY_TIMINGS;
  if (output) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify({ schemaVersion: 1, commit: process.env.GITHUB_SHA ?? null, files: timings }, null, 2)}\n`);
  }
  for (const [file, timing] of Object.entries(timings)) yield `CI_FILE_TIMING ${JSON.stringify({ file, ...timing })}\n`;
}
