import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
const target = new URL('../../../../../skills/buster/engine/test-gates/process-input-lifecycle.ts', import.meta.url).href;
const authors = { cleanupTimeoutMs: 1500, terminationGraceMs: 250, acknowledgementPollMs: 10 };
const selected = process.env.BUSTER_PROCESS_INPUT_MUTATION;
assert(Object.hasOwn(authors, selected), 'explicit lifecycle mutant required');
registerHooks({ load(url, context, next) {
  const result = next(url, context);
  if (url !== target) return result;
  const source = fs.readFileSync(new URL(url), 'utf8');
  const anchor = `this.#policy.${selected}`;
  assert.equal(source.split(anchor).length, 2, 'one actual lifecycle consumer');
  return { ...result, source: source.replace(anchor, String(authors[selected])) };
} });
