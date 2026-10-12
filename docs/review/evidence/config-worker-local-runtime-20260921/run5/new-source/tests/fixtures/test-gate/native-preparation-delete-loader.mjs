import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

const target = new URL('../../../skills/buster/engine/test-gates/preparation-command.ts', import.meta.url).href;
const wrapper = fileURLToPath(new URL('./native-preparation-delete-barrier.mts', import.meta.url));
const anchor = 'const host = fileURLToPath(new URL(hostFiles[phase], import.meta.url));';
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (url !== target) return result;
    assert.ok(result.source, 'target module source is required');
    const source = typeof result.source === 'string' ? result.source : Buffer.from(result.source).toString('utf8');
    assert.equal(source.split(anchor).length, 2, 'exact cleanup command instrumentation anchor');
    return { ...result, source: source.replace(anchor,
      `const host = phase === 'cleanup' ? ${JSON.stringify(wrapper)} : fileURLToPath(new URL(hostFiles[phase], import.meta.url));`) };
  },
});
