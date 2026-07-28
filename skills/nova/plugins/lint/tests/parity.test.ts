import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = path.resolve('../../../..');
const legacyPolicy = await import(pathToFileURL(path.join(repository, 'skills/nova/pipeline/tools/lint-report/policy.ts')).href);
const replacementPolicy = await import(pathToFileURL(path.resolve('dist/engine/policy.js')).href);
const legacyFingerprints = await import(pathToFileURL(path.join(repository, 'skills/nova/pipeline/tools/lint-report/finding-fingerprints.ts')).href);
const replacementFingerprints = await import(pathToFileURL(path.resolve('dist/engine/finding-fingerprints.js')).href);
const legacyArchitecture = await import(pathToFileURL(path.join(repository, 'skills/nova/pipeline/tools/lint-report/architecture-tools.ts')).href);
const replacementArchitecture = await import(pathToFileURL(path.resolve('dist/engine/architecture-tools.js')).href);

for (const [pattern, candidate] of [
  ['src/**/*.ts', 'src/api/index.ts'],
  ['modules/*/Dockerfile', 'modules/api/Dockerfile'],
  ['**/*.test.ts', 'src/api.test.ts'],
  ['charts/**', 'src/index.ts'],
]) {
  assert.equal(
    replacementPolicy.matchesPolicyPattern(candidate, pattern),
    legacyPolicy.matchesPolicyPattern(candidate, pattern),
    `policy match parity for ${pattern} and ${candidate}`,
  );
}

const finding = {
  tool: 'eslint',
  rule: 'no-eval',
  file: 'src/index.ts',
  line: 12,
  column: 4,
  severity: 'error',
  message: 'eval is forbidden',
};
assert.equal(
  replacementFingerprints.findingFingerprint('eslint', repository, finding),
  legacyFingerprints.findingFingerprint('eslint', repository, finding),
  'finding fingerprint remains stable',
);

const graph = [
  { source: 'a', dependencies: [{ resolved: 'b' }] },
  { source: 'b', dependencies: [{ resolved: 'c' }] },
  { source: 'c', dependencies: [{ resolved: 'a' }] },
  { source: 'd', dependencies: [] },
];
assert.deepEqual(
  replacementArchitecture.stronglyConnectedComponents(graph),
  legacyArchitecture.stronglyConnectedComponents(graph),
  'architecture cycle reduction remains stable',
);

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.lint', suite: 'legacy-parity' }));
