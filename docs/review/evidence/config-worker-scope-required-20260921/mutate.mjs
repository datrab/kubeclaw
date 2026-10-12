import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
const target = new URL('../../../../skills/worker/core/worker/native-worker-ownership.ts', import.meta.url).href;
registerHooks({ load(url, context, next) {
  const result = next(url, context);
  if (url !== target) return result;
  let source = fs.readFileSync(new URL(url), 'utf8');
  for (const [before, after] of [
    ['options.poolLimits, options.maximumActiveScopes);', 'options.poolLimits, options.maximumActiveScopes ?? 128);'],
    ['if (!Number.isSafeInteger(options.maximumActiveScopes) || options.maximumActiveScopes < 1) {',
      'if (options.maximumActiveScopes !== undefined && (!Number.isSafeInteger(options.maximumActiveScopes) || options.maximumActiveScopes < 1)) {'],
  ]) {
    assert.equal(source.split(before).length, 2, 'mutation anchor');
    source = source.replace(before, after);
  }
  return { ...result, source };
} });
