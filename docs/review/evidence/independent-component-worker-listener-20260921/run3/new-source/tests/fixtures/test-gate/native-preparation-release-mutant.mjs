import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const target = new URL('../../../skills/buster/engine/test-gates/preparation-ledger.ts', import.meta.url).href;
const write = "await this.#transition(admissionId, current => ({ ...current, phase: 'released', slotReleased: true, bytes: 0, entries: 0 }));";
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (url !== target) return result;
    assert.ok(result.source, 'target module source is required');
    const source = typeof result.source === 'string' ? result.source : Buffer.from(result.source).toString('utf8');
    assert.equal(source.split(write).length, 2, 'exact durable release mutation anchor');
    return { ...result, source: source.replace(write, 'void admissionId; // deliberate missing durable release') };
  },
});
