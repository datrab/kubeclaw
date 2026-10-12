import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

const modes = new Map([
  ['stage-write', './native-preparation-stage-write.mts'],
  ['extract-write', './native-preparation-extract-write.mts'],
  ['retained-descriptor', './native-preparation-retained-descriptor.mts'],
]);
const selected = modes.get(process.env.BUSTER_NATIVE_TEST_BOUNDARY);
assert.ok(selected, 'explicit maintained fixture boundary required');
const wrapper = fileURLToPath(new URL(selected, import.meta.url));
const target = new URL('../../../skills/buster/engine/test-gates/preparation-command.ts', import.meta.url).href;
const anchor = 'const host = fileURLToPath(new URL(hostFiles[phase], import.meta.url));';
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (url !== target) return result;
    assert.ok(result.source);
    const source = typeof result.source === 'string' ? result.source : Buffer.from(result.source).toString('utf8');
    assert.equal(source.split(anchor).length, 2, 'exact preparation-host instrumentation anchor');
    return { ...result, source: source.replace(anchor,
      `const host = phase === 'prepare' ? ${JSON.stringify(wrapper)} : fileURLToPath(new URL(hostFiles[phase], import.meta.url));`) };
  },
});
