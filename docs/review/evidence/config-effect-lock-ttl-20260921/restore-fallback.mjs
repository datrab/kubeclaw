import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const mode = process.env.EFFECT_TTL_MUTANT;
const choices = {
  runtime: ['skills/nova/core/execution/engine-runtime.ts', 'platform.effectLockTtlMs);', 'platform.effectLockTtlMs ?? 300_000);'],
  constructor: ['skills/nova/core/effects/coordinator.ts', 'lockTtlMs: number)', 'lockTtlMs = 300_000)'],
};
const selected = choices[mode]; assert.ok(selected);
registerHooks({ load(url, context, next) {
  const loaded = next(url, context);
  if (!url.endsWith('/' + selected[0])) return loaded;
  const text = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source).toString();
  assert.equal(text.split(selected[1]).length, 2, 'one actual fallback mutation anchor');
  process.stderr.write(`EFFECT_TTL_FALLBACK_RESTORED:${mode}\n`);
  return { ...loaded, source: text.replace(selected[1], selected[2]) };
} });
