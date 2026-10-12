import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
const root = new URL('../../../../', import.meta.url);
const rules = {
  'kube-output': ['kubernetes-fixture-runtime.ts', 'this.#settings.maximumManifestBytes * this.#settings.commandOutputManifestMultiplier', 'this.#settings.maximumManifestBytes * 2'],
  'tail-output': ['tailscale-exposure-runtime.ts', 'maxBuffer: this.#maximumCommandOutputBytes', 'maxBuffer: 1048576'],
  'kube-short': ['kubernetes-fixture-preparation.ts', 'this.#settings.shortCommandTimeoutMs', '15000'],
  'tail-short': ['tailscale-exposure-runtime.ts', 'this.#shortCommandTimeoutMs', '15000'],
  'diagnostic': ['kubernetes-fixture-runtime.ts', 'slice(0, maximumCodeUnits)', 'slice(0, 4096)'],
  'kube-poll': ['kubernetes-fixture-readiness.ts', 'this.#settings.pollIntervalMs', '1000'],
  'tail-poll': ['tailscale-exposure-runtime.ts', 'Math.min(this.#pollIntervalMs,', 'Math.min(1000,'],
  'manifest-depth': ['kubernetes-manifest.ts', 'policy.maximumDepth', '64'],
  'manifest-alias': ['kubernetes-manifest.ts', 'policy.maximumAliases', '1000'],
};
const selected = process.env.BUSTER_CLUSTER_MUTATION;
assert(Object.hasOwn(rules, selected));
const [file, needle, replacement] = rules[selected];
const target = new URL(`skills/buster/engine/test-gates/${file}`, root).href;
registerHooks({ load(url, context, next) {
  const result = next(url, context);
  if (url !== target) return result;
  let source = fs.readFileSync(new URL(url), 'utf8');
  assert(source.includes(needle));
  const original = source;
  if (selected === 'tail-short') {
    // Change actual command uses only; leave declaration/constructor assignment syntactically valid.
    source = source.replaceAll('signal, this.#shortCommandTimeoutMs)', 'signal, 15000)')
      .replace('Math.min(this.#shortCommandTimeoutMs, this.#maximumExecutionMs)', 'Math.min(15000, this.#maximumExecutionMs)');
  } else source = source.replaceAll(needle, replacement);
  assert.notEqual(source, original, 'selected mutation changes actual consumer source');
  return { ...result, source };
} });
