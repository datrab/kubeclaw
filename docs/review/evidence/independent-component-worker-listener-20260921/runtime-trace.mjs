import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerHooks } from 'node:module';
const directory = process.env.COMPONENT_REVIEW_TRACE_DIRECTORY;
if (!directory) throw Error('REVIEW_TRACE_DIRECTORY_REQUIRED');
const output = path.join(directory, `${process.pid}.jsonl`);
registerHooks({ load(url, context, next) {
  const result = next(url, context);
  if (url.startsWith('file:')) {
    const file = fileURLToPath(url);
    const bytes = fs.readFileSync(file);
    fs.appendFileSync(output, JSON.stringify({ file, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }) + '\n');
  }
  return result;
} });
