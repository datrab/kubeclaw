import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const target = pathToFileURL(path.resolve('scripts/observability-retirement/files.mjs')).href;
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (url !== target) return result;
  const source = Buffer.isBuffer(result.source) ? result.source.toString() : String(result.source);
  const needle = 'Math.min(buffer.length, before.size - size)';
  assert.equal(source.split(needle).length, 2);
  return { ...result, source: source.replace(needle, 'buffer.length') };
} });
