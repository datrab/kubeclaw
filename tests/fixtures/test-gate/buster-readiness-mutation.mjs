// Private semantic negative controls, enabled only by the explicit test command.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const mutation = process.env.BUSTER_READINESS_MUTATION;
const changes = {
  'restore-policy-default': ['validateBusterDependencyReadinessSettings(options.dependencyReadiness)',
    'validateBusterDependencyReadinessSettings(options.dependencyReadiness ?? { maximumExecutionMs: 1000, maximumOutputBytes: 65536 })'],
  'restore-field-defaults': ['validateBusterDependencyReadinessSettings(options.dependencyReadiness)',
    'validateBusterDependencyReadinessSettings({ maximumExecutionMs: 1000, maximumOutputBytes: 65536, ...options.dependencyReadiness })'],
  'ignore-execution': ['maximumExecutionMs: options.dependencyReadiness.maximumExecutionMs', 'maximumExecutionMs: 1000'],
  'ignore-output': ['maximumOutputBytes: options.dependencyReadiness.maximumOutputBytes', 'maximumOutputBytes: 65536'],
};
assert.ok(Object.hasOwn(changes, mutation), 'explicit known mutation required');
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (!url.endsWith('/skills/buster/engine/test-gates/remote-plan-service.ts')) return result;
  const [before, after] = changes[mutation], source = String(result.source);
  assert.equal(source.split(before).length, 2, 'semantic mutation has one actual production target');
  return { ...result, source: source.replace(before, after) };
} });
