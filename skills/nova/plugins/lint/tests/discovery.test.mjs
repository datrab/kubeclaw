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
];
for (const file of files) {
  const absolute = path.join(temporary, file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, '{}\n');
}

const discovery = await import(pathToFileURL(path.resolve('src/engine/discovery.ts')).href);
const containerYaml = await import(pathToFileURL(path.resolve('src/engine/container-yaml-tools.ts')).href);
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
