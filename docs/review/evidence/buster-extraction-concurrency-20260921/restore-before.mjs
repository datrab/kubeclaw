import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';

const target = new URL('../../../../skills/buster/engine/test-gates/preparation-extraction.ts', import.meta.url).href;
const original = fs.readFileSync(new URL('./before-0.snapshot', import.meta.url), 'utf8');
assert.match(original, /export async function extractBusterPreparation/u);
assert.doesNotMatch(original, /activeExtractions/u);
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    return url === target ? { ...result, source: original } : result;
  },
});
