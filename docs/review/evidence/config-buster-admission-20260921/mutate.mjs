import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
const target = new URL('../../../../skills/buster/engine/test-gates/remote-plan-service.ts', import.meta.url).href;
const mode = process.env.BUSTER_ADMISSION_MUTATION;
assert.ok(['restore-defaults', 'ignore-weight'].includes(mode));
registerHooks({ load(url, context, next) {
  const result = next(url, context);
  if (url !== target) return result;
  let source = fs.readFileSync(new URL(url), 'utf8');
  if (mode === 'restore-defaults') {
    for (const [key, value] of [['maximumActiveJobs', 2], ['maximumQueuedJobs', 16], ['maximumConcurrentAttempts', 64]]) {
      const before = `this.#${key} = admission.${key};`;
      assert.equal(source.split(before).length, 2, 'mutation anchor');
      source = source.replace(before, `this.#${key} = ${value};`);
    }
  } else {
    const before = 'used + job.maximumConcurrency > this.#maximumConcurrentAttempts';
    assert.equal(source.split(before).length, 2, 'mutation anchor'); source = source.replace(before, 'false');
  }
  return { ...result, source };
} });
