import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
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
const digest = text => createHash('sha256').update(text).digest('hex');
assert(process.env.BUSTER_CLUSTER_MUTATION_MANIFEST, 'exact source manifest required');
const manifest = JSON.parse(fs.readFileSync(process.env.BUSTER_CLUSTER_MUTATION_MANIFEST, 'utf8'));
const selected = process.env.BUSTER_CLUSTER_MUTATION;
assert(Object.hasOwn(rules, selected));
const [file, needle, replacement] = rules[selected];
const target = new URL(`skills/buster/engine/test-gates/${file}`, root).href;
registerHooks({ load(url, context, next) {
  const result = next(url, context);
  if (url !== target) return result;
  let source = fs.readFileSync(new URL(url), 'utf8');
  const entry = manifest.files.find(row => row.path === `skills/buster/engine/test-gates/${file}`);
  assert(entry, 'mutation target must be in source manifest');
  assert.equal(digest(source), entry.sha256, 'mutation source must match the verified baseline');
  assert(source.includes(needle));
  const original = source;
  const replacements = selected === 'tail-short' ? [
    ['signal, this.#shortCommandTimeoutMs)', 'signal, 15000)'],
    ['null,signal,this.#shortCommandTimeoutMs)', 'null,signal,15000)'],
    ['Math.min(this.#shortCommandTimeoutMs, this.#maximumExecutionMs)', 'Math.min(15000, this.#maximumExecutionMs)'],
  ] : [[needle, replacement]];
  const applied = replacements.map(([from, to]) => {
    const count = source.split(from).length - 1;
    assert(count > 0, `required actual command anchor missing: ${from}`);
    source = source.replaceAll(from, to);
    return { from, to, count };
  });
  assert.notEqual(source, original, 'selected mutation changes actual consumer source');
  process.stderr.write('CLUSTER_MUTATION_APPLIED ' + JSON.stringify({ mutation: selected, pid: process.pid, url,
    beforeSha256: digest(original), afterSha256: digest(source), replacements: applied, replacedAnchors: applied.reduce((sum, row) => sum + row.count, 0) }) + '\n');
  return { ...result, source };
} });
