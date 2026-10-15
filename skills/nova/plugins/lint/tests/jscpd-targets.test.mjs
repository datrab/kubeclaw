import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLintPolicy, validatePolicyTargetPaths } from '../src/engine/policy.ts';
import { registerArchitectureTools } from '../src/engine/architecture-tools.ts';

const checkout = fileURLToPath(new URL('../../../../../', import.meta.url));
const policyPath = path.join(checkout, 'charts/kubeclaw/files/config/lint-policy.json');
const raw = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const normalize = value => validateLintPolicy(value, policyPath);
const jscpd = value => value.tools.find(tool => tool.id === 'jscpd');
assert.deepEqual(jscpd(normalize(raw)).test_targets, ['tests']);
for (const test_targets of [[], ['../escape'], ['/tmp/escape'], ['same', 'same'], ['same', './same'], null]) {
  const candidate = structuredClone(raw); jscpd(candidate).test_targets = test_targets;
  assert.throws(() => normalize(candidate), /test_targets/);
}
const candidate = structuredClone(raw);jscpd(candidate).test_targets = ['packages/example/test'];
assert.deepEqual(jscpd(normalize(candidate)).test_targets, ['packages/example/test']);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jscpd-target-contract-'));
const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'jscpd-target-outside-'));
try {
  fs.mkdirSync(path.join(root, 'src'));
  const tests = path.join(root, 'packages/example/test'); fs.mkdirSync(tests, { recursive: true });
  const project = { root: '.', go: { modules: [] }, terraform: { roots: [] }, kubernetes: { raw_manifests: [], helm_charts: [], limits: { max_files: 1 }, schema_location: null } };
  const tool = { id: 'jscpd', targets: ['src'], test_targets: ['packages/example/test'] };
  const policy = { tools: [tool], architecture: { layers: [] } };
  validatePolicyTargetPaths(root, policy, project);
  for (const target of ['missing', '../escape']) {
    assert.throws(() => validatePolicyTargetPaths(root, { ...policy, tools: [{ ...tool, test_targets: [target] }] }, project));
  }
  fs.symlinkSync(outside, path.join(root, 'escape'));
  assert.throws(() => validatePolicyTargetPaths(root, { ...policy, tools: [{ ...tool, test_targets: ['escape'] }] }, project), /PATH_DENIED/);
  fs.symlinkSync(outside, path.join(tests, 'nested-escape'));
  assert.throws(() => validatePolicyTargetPaths(root, policy, project), /PATH_DENIED/);
  fs.unlinkSync(path.join(tests, 'nested-escape'));
  const duplicate = Array.from({ length: 15 }, (_, i) => `const item${i} = calculate(${i}, "synthetic-${i}");`).join('\n');
  fs.writeFileSync(path.join(tests, 'first.ts'), duplicate); fs.writeFileSync(path.join(tests, 'second.ts'), duplicate);
  fs.writeFileSync(path.join(root, 'src/unique.ts'), 'export const unique = true;\n');
  for (const filename of ['jscpd.json', 'jscpd-tests.json']) fs.writeFileSync(path.join(root, filename), JSON.stringify({ threshold: 100, minLines: 5, minTokens: 50, format: ['typescript'], reporters: ['json'] }));
  let adapter; registerArchitectureTools(value => { if (value.id === 'jscpd') adapter = value; });
  const result = await adapter.run({ repoRoot: root, policyProject: { root: '.' }, tool: { ...tool, timeout_ms: 30000, config_path: path.join(root, 'jscpd.json') } });
  assert.ok(result.errors > 0, 'Non-root duplicate test files must retain blocking findings');
  assert.ok(result.findings.some(finding => finding.file.endsWith('first.ts') || finding.file.endsWith('second.ts')), JSON.stringify(result.findings));
  console.log('JSCPD actual non-root scan, normalization, missing paths and nested symlink containment passed');
} finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); }
