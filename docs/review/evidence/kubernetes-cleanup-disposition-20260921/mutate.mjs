import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
const root = new URL('../../../../', import.meta.url);
const definitions = {
  'recovery-completed': ['skills/buster/engine/test-gates/provider-loader.ts',
    'recovery.cleanup(context, disposition)', "recovery.cleanup(context, 'completed-fixture')"],
  'faulted-completed': ['skills/buster/engine/test-gates/runner.ts',
    "cleanupRetainedProvider(this.#fixtureOwner(), node, instance, invocation, log, 'incomplete')",
    "cleanupRetainedProvider(this.#fixtureOwner(), node, instance, invocation, log, 'completed-fixture')"],
  'rollback-suppressed': ['skills/buster/engine/test-gates/kubernetes-fixture-preparation.ts',
    "throw new AggregateError([error, cleanupError], 'KUBERNETES_FIXTURE_PREPARE_CLEANUP_FAILED', { cause: error });",
    'throw error;'],
};
const selected = process.env.BUSTER_CLEANUP_MUTATION;
assert(Object.hasOwn(definitions, selected));
const [file, anchor, replacement] = definitions[selected];
const target = new URL(file, root).href;
registerHooks({ load(url, context, next) {
  const result = next(url, context);
  if (url !== target) return result;
  const source = fs.readFileSync(new URL(url), 'utf8');
  assert.equal(source.split(anchor).length, 2, 'one exact semantic decision');
  return { ...result, source: source.replace(anchor, replacement) };
} });
