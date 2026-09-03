import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-lint-discovery-'));
const chart = path.join(temporary, 'services/example');
const files = [
  '.github/workflows/ci.yml',
  'services/example/Chart.yaml',
  'services/example/values.yaml',
  'services/example/templates/deployment.yaml',
  'services/example/dist/generated.yaml',
  'src/application.ts',
  'tests/application.test.ts',
  'fixtures/example.ts',
];
for (const file of files) {
  const absolute = path.join(temporary, file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, '{}\n');
}

const discovery = await import(pathToFileURL(path.resolve('src/engine/discovery.ts')).href);
const containerYaml = await import(pathToFileURL(path.resolve('src/engine/container-yaml-tools.ts')).href);
const registry = await import(pathToFileURL(path.resolve('src/engine/tool-registry.ts')).href);
const base = {
  repoRoot: temporary,
  policyProject: { root: '.' },
  policy: { global_exclusions: ['**/dist/**'] },
  tool: {
    targets: ['.'],
    include: ['**/*.yaml'],
    exclude: ['**/templates/**'],
  },
};

try {
  const tools = [];
  containerYaml.registerContainerYamlTools((tool) => tools.push(tool));
  const genericKubeconform = tools.find((tool) => tool.id === 'kubeconform');
  const explicitKubernetesSchema = tools.find((tool) => tool.id === 'kubernetes-schema');
  assert.equal(genericKubeconform.detect({ policyProject: { root: '.' }, projectTypes: new Set(['helm']) }), true);
  assert.equal(explicitKubernetesSchema.detect({ policyProject: { root: '.' }, projectTypes: new Set(['helm']) }), false);
  const repositoryRoot = path.resolve(import.meta.dirname, '../../../../..');
  const canonicalPolicy = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'charts/kubeclaw/files/config/lint-policy.json'), 'utf8'));
  const configuredRegistry = registry.buildToolRegistry(canonicalPolicy, new Set(canonicalPolicy.projects[0].languages));
  assert.equal(configuredRegistry.length, registry.TOOL_ADAPTERS.length);
  assert.deepEqual(canonicalPolicy.experimental_tools, [
    'eslint-type-evidence-production',
    'eslint-type-evidence-tests',
  ]);
  assert.equal(configuredRegistry.some((adapter) => adapter.id === 'eslint-type-evidence-production'), true);
  assert.equal(configuredRegistry.some((adapter) => adapter.id === 'eslint-type-evidence-tests'), true);
  const evidenceTools = canonicalPolicy.tools.filter(({ id }) => id.startsWith('eslint-type-evidence-'));
  const evidenceFiles = evidenceTools.map((tool) => discovery.configuredTargetFilesForScope({
    repoRoot: temporary,
    policyProject: { root: '.' },
    policy: { global_exclusions: [] },
    tool,
    changedFilesRequested: false,
  }, (file) => /\.(?:[cm]?[jt]sx?)$/u.test(file), ['.git/**', '.swarm/**', '**/node_modules/**']));
  const productionEvidence = evidenceFiles[0].map((file) => path.relative(temporary, file).split(path.sep).join('/'));
  const testEvidence = evidenceFiles[1].map((file) => path.relative(temporary, file).split(path.sep).join('/'));
  assert.deepEqual(productionEvidence, ['src/application.ts']);
  assert.deepEqual(testEvidence, ['fixtures/example.ts', 'tests/application.test.ts']);
  assert.deepEqual(productionEvidence.filter((file) => testEvidence.includes(file)), []);
  assert.deepEqual([...productionEvidence, ...testEvidence].sort(), [
    'fixtures/example.ts',
    'src/application.ts',
    'tests/application.test.ts',
  ]);
  for (const adapter of configuredRegistry) {
    assert.equal(typeof adapter.detect, 'function', `${adapter.id} must expose a safe configured detector`);
    assert.equal(typeof adapter.detect({
      repoRoot: repositoryRoot,
      policy: canonicalPolicy,
      policyProject: canonicalPolicy.projects[0],
      projectTypes: new Set(canonicalPolicy.projects[0].languages),
      changedFilesRequested: false,
      changedFiles: [],
    }), 'boolean', `${adapter.id} must evaluate applicability without an adapter-specific detector`);
  }
  assert.deepEqual(discovery.configuredMarkerDirectories(base, 'Chart.yaml'), [chart]);
  assert.deepEqual(
    discovery.configuredTargetFilesForScope(base, (file) => file.endsWith('.yaml')),
    [path.join(chart, 'Chart.yaml'), path.join(chart, 'values.yaml')],
  );
  assert.deepEqual(
    discovery.configuredTargetFilesForScope({
      ...base,
      tool: { ...base.tool, include: ['**/*.yml'] },
    }, (file) => file.endsWith('.yml')),
    [path.join(temporary, '.github/workflows/ci.yml')],
  );
  assert.deepEqual(
    discovery.configuredTargetFilesForScope({
      ...base,
      changedFilesRequested: true,
      changedFiles: files,
    }, (file) => file.endsWith('.yaml')),
    [path.join(chart, 'Chart.yaml'), path.join(chart, 'values.yaml')],
  );
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, suite: 'lint-target-discovery' }));
