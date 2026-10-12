import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
const target = new URL('../../../../skills/buster/engine/test-gates/remote-plan-service.ts', import.meta.url).href;
const corrected = `    const status = await this.#options.store.requestCancellation(jobId, this.#now().toISOString());
    if (status.state !== 'cancelling') return status;`;
const original = `    const current = await this.status(jobId);
    if (['completed', 'failed', 'cancelled'].includes(current.state)) return current;
    const status = await this.#options.store.transition(
      jobId, ['accepted', 'running', 'cancelling'], 'cancelling', this.#now().toISOString(),
    );`;
registerHooks({ load(url, context, next) {
  const loaded = next(url, context);
  if (url !== target) return loaded;
  const source = fs.readFileSync(new URL(url), 'utf8');
  assert.equal(source.split(corrected).length, 2, 'exact corrected cancellation anchor');
  return { ...loaded, source: source.replace(corrected, original) };
} });
