#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildRegistry, discoverPackages, loadPipelineTestScope, resolveTestPlan } from '../skills/nova/core/src/index.ts';

const root = path.resolve(import.meta.dirname, '..');
const revision = '3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f';

const specifications = [
  {
    file: 'docs/site/understand/buster.md', minimumLinks: 10,
    required: ['## Product Boundary', '## Complete Request Path', '## 1. Plan Resolution',
      '## 2. Committed Source Snapshot', '## 3. Dispatch and HTTP API',
      '## 4. Durable Admission and State', '## 5. Execution, Providers, and Worker Core',
      '## 6. Evidence, Reports, and Result Authority', '## 7. Nova Verification and One-Time Import',
      '## 8. Failure, Cancellation, Restart, and Recovery', '**Decision:**', '**Reason:**',
      '**Rejected alternative:**', '**Cost:**'],
  },
  {
    file: 'docs/site/understand/buster-namespace-controller.md', minimumLinks: 6,
    required: ['## Why The Broker Exists', '## Lease Flow', '## Lease Specification',
      '## Access, Secrets, and Credentials', '## Status and Fencing',
      '## Retention and Release', '### Complete shipped values', '## Failure Guide', '## Verification'],
  },
  {
    file: 'docs/site/reference/buster-suites.md', minimumLinks: 25,
    required: ['## Common Node Rules', '## Complete Test-Scope Syntax', '### Suite selection',
      '### Test and fixture node', '### Concurrency and matrix rules', '### Coverage policy',
      '## Suite Inventory', '## 1. Unit Suite',
      '## 2. Container Build Suite', '## 3. Kubernetes Fixture Suite', '## 4. HTTP Suite',
      '## 5. Tailscale Exposure Suite', '## 6. API Suite', '## 7. Accessibility Suite',
      '## 8. Performance Suite', '## 9. Visual Suite', '## 10. End-to-End Suite',
      '## 11. Security Suite', '## 12. Size Budget Suite', '## Additional Installed Providers',
      '## Inputs, Outputs, and Composition', '## Evidence and Reports',
      '## Configuration Precedence', '## Verification Matrix'],
  },
  {
    file: 'docs/site/use/workflows/buster-suite.md', minimumLinks: 5,
    required: ['## Before You Start', '## 1. Start From The Maintained Example',
      'buster-fixture-matrix-report.pipeline.json', '## 2. Make The Decision Explicit',
      '## 3. Link Outputs Instead Of Sharing Paths', '## 4. Resolve Before You Run',
      '## 5. Submit and Observe', '## 6. Read The Result In The Correct Order',
      '## 7. Diagnose By Boundary', '## 8. Clean Up', '## Expected Result'],
  },
  {
    file: 'docs/site/extend/platform/buster.md', minimumLinks: 6,
    required: ['## Component Map', '## Change A Plan Field', '## Change The Remote Protocol',
      '## Change Execution or Result Rules', '## Add A New Suite End To End',
      '## Add A New Provider or Report Adapter', '## Add A New Capability',
      '## Change Namespace Lifecycle', '## Error Design', '## Required Checks', '## Review Checklist'],
  },
];

let sourceLinks = 0;
const checkedSources = new Set();
for (const specification of specifications) {
  const filePath = path.join(root, specification.file);
  const source = fs.readFileSync(filePath, 'utf8');
  assert(source.includes(`Evidence revision: \`${revision}\``),
    `${specification.file} lacks the inspected evidence revision`);
  for (const marker of specification.required) {
    assert(source.includes(marker), `${specification.file} lacks required content: ${marker}`);
  }
  if (specification.file.startsWith('docs/site/understand/')) {
    const blockLanguages = [...source.matchAll(/^```([^\n]*)$/gmu)]
      .map(match => match[1].trim().toLowerCase()).filter(Boolean);
    assert(blockLanguages.every(language => language === 'mermaid'),
      `${specification.file} copies maintained code instead of linking to source`);
  }

  const links = [...source.matchAll(
    /https:\/\/github\.com\/datrab\/kubeclaw\/blob\/([0-9a-f]{40})\/([^#)\s]+)(?:#L([0-9]+)(?:-L([0-9]+))?)?/gu,
  )];
  assert(links.length >= specification.minimumLinks,
    `${specification.file} has only ${links.length} pinned source links`);
  sourceLinks += links.length;
  for (const match of links) {
    const [, linkRevision, repositoryPath, firstValue, lastValue] = match;
    assert.equal(linkRevision, revision, `${specification.file} uses another revision for ${repositoryPath}`);
    const pinned = execFileSync('git', ['-C', root, 'show', `${revision}:${repositoryPath}`], { encoding: 'utf8' });
    if (!checkedSources.has(repositoryPath)) {
      const currentPath = path.join(root, repositoryPath);
      assert(fs.existsSync(currentPath), `linked source is absent: ${repositoryPath}`);
      assert.equal(fs.readFileSync(currentPath, 'utf8'), pinned,
        `${repositoryPath} changed after ${revision}; inspect and repin the Buster guides`);
      checkedSources.add(repositoryPath);
    }
    if (!firstValue) continue;
    const lineCount = pinned.split('\n').length;
    const first = Number(firstValue);
    const last = Number(lastValue ?? firstValue);
    assert(first >= 1 && last >= first && last <= lineCount,
      `${specification.file} has invalid lines for ${repositoryPath}`);
  }
}

const reference = fs.readFileSync(path.join(root, 'docs/site/reference/buster-suites.md'), 'utf8');
const extension = fs.readFileSync(path.join(root, 'docs/site/extend/buster.md'), 'utf8');
const suiteDirectory = path.join(root, 'contracts/pipeline-test-gate/v1/suites');
const suites = fs.readdirSync(suiteDirectory).filter(name => name.endsWith('.v1.json')).sort();
assert.equal(suites.length, 12, 'shipped Buster suite count changed; update the twelve-suite guide');
for (const name of suites) {
  const suite = JSON.parse(fs.readFileSync(path.join(suiteDirectory, name), 'utf8'));
  assert(reference.includes(`\`${suite.contractId}\``), `suite reference omits ${suite.contractId}`);
}

const pluginDirectory = path.join(root, 'skills/buster/plugins');
const pluginNames = fs.readdirSync(pluginDirectory).sort();
let providerCount = 0;
for (const pluginName of pluginNames) {
  const manifestPath = path.join(pluginDirectory, pluginName, 'plugin.json');
  if (!fs.existsSync(manifestPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const provider of manifest.testProviders ?? []) {
    providerCount += 1;
    assert(`${reference}\n${extension}`.includes(`\`${provider.contractId}\``),
      `Buster guides omit provider ${provider.contractId}`);
    const schemaPath = path.join(pluginDirectory, pluginName, provider.configSchema);
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    for (const property of Object.keys(schema.properties ?? {})) {
      assert(reference.includes(`\`${property}\``) || reference.includes(`\`${property}[]\``)
        || reference.includes(`\`${property}.`),
        `suite reference omits ${provider.contractId} configuration field ${property}`);
    }
  }
}
assert.equal(providerCount, 19, 'Buster provider count changed; update provider and suite guidance');

const examplePath = path.join(root,
  'docs/site/use/workflows/examples/buster-fixture-matrix-report.pipeline.json');
const example = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-doc-example-'));
const swarm = path.join(temporary, '.swarm');
fs.mkdirSync(swarm);
fs.writeFileSync(path.join(swarm, 'pipeline.json'), `${JSON.stringify(example)}\n`);
fs.writeFileSync(path.join(swarm, 'progress.json'), '{}\n');
let scope;
try {
  scope = loadPipelineTestScope(path.join(swarm, 'pipeline.json'),
    { moduleId: 'web', gateId: null }).declaration;
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
assert(scope.fixtures.deployment.uses === 'kubeclaw.kubernetes-fixture@1',
  'worked workflow lost its Kubernetes fixture');
assert(Object.keys(scope.tests.http.matrix.path).length === 2,
  'worked workflow lost its HTTP matrix');
assert(scope.suites.unit.add.unit.config.reports[0].format === 'junit',
  'worked workflow lost its JUnit report');
assert(scope.fixtures.deployment.inputs['checked-manifest'].from === 'unit/checked-manifest',
  'worked workflow lost its typed suite-to-fixture link');

const registry = buildRegistry(discoverPackages({
  installationRoots: [pluginDirectory],
  trustPolicy: {
    trustedBuiltinRoots: [pluginDirectory], allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(), verifierId: 'docs:buster-guides',
  },
}));
const templates = suites.map(name =>
  JSON.parse(fs.readFileSync(path.join(suiteDirectory, name), 'utf8')));
const limits = { cpuMillis: 900000, memoryBytes: 2147483648, logBytes: 16777216,
  artifactBytes: 268435456, artifactFiles: 256, processes: 64 };
const resolvedExample = resolveTestPlan({
  planId: 'plan:docs:buster-fixture-matrix-report', runId: 'run:docs:buster',
  project: example.project, scope: { moduleId: 'web', gateId: null },
  createdAt: '2026-09-19T00:00:00.000Z', declaration: scope,
  suiteTemplates: templates, registry,
  facts: { changedPaths: ['k8s/deployment.yaml'], moduleType: 'service', pipelineStage: 'test' },
  policy: { defaultTimeoutMs: 900000, maximumTimeoutMs: 3600000,
    defaultLimits: limits, maximumLimits: limits, maximumRetryCount: 1,
    maximumMatrixSize: 8, maximumNodes: 16, defaultConcurrencyLimit: 1,
    maximumConcurrencyLimits: { unit: 4, http: 8 },
    reportAdapters: new Map([['junit', 'kubeclaw.junit-report:junit']]) },
});
assert.equal(resolvedExample.nodes.filter(node => node.parentNodeId === 'http').length, 2,
  'worked workflow did not resolve its two HTTP matrix nodes');
assert(resolvedExample.nodes.some(node => node.id === 'deployment' && node.kind === 'fixture'),
  'worked workflow did not resolve its deployment fixture');
assert(resolvedExample.nodes.some(node => node.id === 'unit/unit'
  && node.reportAdapters.some(adapter => adapter.format === 'junit')),
  'worked workflow did not bind the JUnit report adapter');

const namespaceGuide = fs.readFileSync(
  path.join(root, 'docs/site/understand/buster-namespace-controller.md'), 'utf8');
for (const value of ['leaseClient.enabled', 'readyClient.enabled', 'leaseApiGroup', 'leaseApiVersion',
  'allowedPrefixes', 'defaultTtlSeconds', 'maxTtlSeconds', 'controller.productDecisions.enabled',
  'controller.readiness.enabled', 'controller.allowedAccess', 'controller.allowedSourceSecrets',
  'controller.image.repository', 'controller.image.tag', 'controller.image.pullPolicy',
  'controller.pollIntervalMs', 'controller.resources.requests.cpu',
  'controller.resources.requests.memory', 'controller.resources.limits.cpu',
  'controller.resources.limits.memory']) {
  assert(namespaceGuide.includes(`\`${value}\``), `namespace guide omits Helm value ${value}`);
}

const navigation = [
  ['docs/site/README.md', 'understand/buster.md'],
  ['docs/site/understand/README.md', 'buster.md'],
  ['docs/site/understand/README.md', 'buster-namespace-controller.md'],
  ['docs/site/reference/README.md', 'buster-suites.md'],
  ['docs/site/use/README.md', 'workflows/buster-suite.md'],
  ['docs/site/extend/README.md', 'platform/buster.md'],
];
for (const [file, target] of navigation) {
  assert(fs.readFileSync(path.join(root, file), 'utf8').includes(`](${target})`),
    `${file} does not link to ${target}`);
}

const surfaces = fs.readFileSync(path.join(root, 'docs/site/product-surfaces.md'), 'utf8');
for (const id of ['SUR-SPC-04', 'SUR-SPC-05', 'SUR-DAT-03']) {
  const row = surfaces.split('\n').find(line => line.startsWith(`| ${id} |`));
  assert(row?.endsWith('| Detailed |'), `${id} does not declare detailed Buster coverage`);
}

const requirementMarkers = {
  'SPC-001': ['docs/site/understand/buster.md', '## Product Boundary'],
  'SPC-008': ['docs/site/understand/buster-namespace-controller.md', '## Lease Flow'],
  'CFG-006': ['docs/site/reference/buster-suites.md', '## Suite Inventory'],
  'FLW-011': ['docs/site/use/workflows/buster-suite.md', 'buster-fixture-matrix-report.pipeline.json'],
  'EXT-005': ['docs/site/extend/buster.md', '## Suite Templates'],
  'CDV-008': ['docs/site/extend/platform/buster.md', '## Component Map'],
};
for (const [id, [file, marker]] of Object.entries(requirementMarkers)) {
  assert(fs.readFileSync(path.join(root, file), 'utf8').includes(marker),
    `${id} lost its maintained marker in ${file}`);
}

console.log(`Buster guides verified: ${specifications.length + 1} pages, ${suites.length} suites, ${providerCount} providers, ${sourceLinks} pinned links, ${checkedSources.size} source files, ${Object.keys(requirementMarkers).length} requirements.`);
