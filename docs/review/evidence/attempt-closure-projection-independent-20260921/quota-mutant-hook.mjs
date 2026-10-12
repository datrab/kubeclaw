// In-memory negative control only: one compact closure incorrectly releases two slots.
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const target = pathToFileURL(path.resolve('skills/common/plugin-runtime/foundation/observability/durable-attempts.ts')).href;
const replay = pathToFileURL(path.resolve('skills/common/plugin-runtime/foundation/observability/attempt-replay.ts')).href;
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (url !== target && url !== replay) return result;
  const source = Buffer.isBuffer(result.source) ? result.source.toString() : String(result.source);
  if (url === replay) {
    const before = 'state.closures.length - validatedProjectedClosures <= limits.maximumClosures';
    assert.equal(source.split(before).length, 2);
    return { ...result, source: source.replace(before, 'state.closures.length - 2 * validatedProjectedClosures <= limits.maximumClosures') };
  }
  const needle = 'state.closures.length - this.#closureProjections.size >= this.#limits.maximumClosures';
  assert.equal(source.split(needle).length, 2);
  return { ...result, source: source.replace(needle,
    'state.closures.length - 2 * this.#closureProjections.size >= this.#limits.maximumClosures') };
} });
