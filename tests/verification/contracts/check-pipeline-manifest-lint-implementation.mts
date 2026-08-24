import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { executeLintReport } from '../../../skills/nova/plugins/lint/src/engine/index.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-manifest-lint-'));
const repository = path.join(root, 'repository');
const config = path.join(root, 'config');
const schemas = path.join(root, 'schemas');
fs.mkdirSync(path.join(repository, 'charts', 'fixture', 'templates'), { recursive: true });
fs.mkdirSync(config, { recursive: true });
fs.mkdirSync(schemas, { recursive: true });

const baseSchema = {
  $schema: 'http://json-schema.org/draft-04/schema#', type: 'object',
  required: ['apiVersion', 'kind', 'metadata'],
  properties: {
    apiVersion: { type: 'string' }, kind: { type: 'string' },
    metadata: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, namespace: { type: 'string' } }, additionalProperties: true },
    data: { type: 'object' }, stringData: { type: 'object' }, imagePullSecrets: { type: 'array' }, spec: { type: 'object' },
  }, additionalProperties: true,
};
for (const name of ['deployment-apps-v1.json', 'secret-v1.json', 'serviceaccount-v1.json']) {
  const schema = name.startsWith('deployment-')
    ? { ...baseSchema, required: ['apiVersion', 'kind', 'metadata', 'spec'], properties: { ...baseSchema.properties, apiVersion: { enum: ['apps/v1'] }, kind: { enum: ['Deployment'] } } }
    : baseSchema;
  fs.writeFileSync(path.join(schemas, name), JSON.stringify(schema));
}

const workload = (valid: boolean) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  selector:
    matchLabels: { app: app }
  template:
    metadata:
      labels: { app: app }
    spec:
${valid ? `      imagePullSecrets:
        - name: registry
` : ''}      containers:
        - name: app
          image: registry.example.invalid/app:1
          env:
            - name: REDIS_HOST
              valueFrom:
                secretKeyRef:
                  name: runtime
                  key: redis-host
${valid ? `            - name: OPTIONAL_TOKEN
              valueFrom:
                secretKeyRef:
                  name: optional-runtime
                  key: token
                  optional: true
          readinessProbe:
            httpGet: { path: /ready, port: 8080 }
          livenessProbe:
            httpGet: { path: /live, port: 8080 }
          resources:
            limits: { cpu: 100m, memory: 64Mi }
          envFrom:
            - secretRef:
                name: optional-runtime
                optional: true
` : `        - name: sidecar
          image: public.example/sidecar:1
      initContainers:
        - name: setup
          image: registry.example.invalid/setup:1
          env:
            - name: REDIS_HOST
              value: redis
          envFrom:
            - secretRef:
                name: missing-runtime
`}`;

const validRaw = `${workload(true)}---
apiVersion: v1
kind: Secret
metadata: { name: runtime }
stringData: { redis-host: redis }
---
apiVersion: v1
kind: ServiceAccount
metadata: { name: default }
imagePullSecrets: [{ name: registry }]
`;
fs.writeFileSync(path.join(repository, 'raw.yaml'), validRaw);
fs.writeFileSync(path.join(repository, 'charts', 'fixture', 'Chart.yaml'), 'apiVersion: v2\nname: fixture\nversion: 1.0.0\n');
fs.writeFileSync(path.join(repository, 'charts', 'fixture', 'templates', 'deployment.yaml'), workload(true));
fs.mkdirSync(path.join(repository, 'charts', 'legacy-discovery', 'templates'), { recursive: true });
fs.writeFileSync(path.join(repository, 'charts', 'legacy-discovery', 'Chart.yaml'), 'apiVersion: v2\nname: legacy-discovery\nversion: 1.0.0\n');
fs.writeFileSync(path.join(repository, 'charts', 'legacy-discovery', 'templates', 'deployment.yaml'), workload(true).replace('name: app', 'name: legacy-discovery'));

const pack = {
  schema_version: 'kubernetes_lint_policy_pack.v1', id: 'fixture', version: '1.0.0',
  rules: [
    { id: 'env', type: 'required-env', severity: 'error', parameters: { names: ['REDIS_HOST'] } },
    { id: 'secret', type: 'secret-ref', severity: 'error', parameters: {} },
    { id: 'registry', type: 'private-registry-pull-secret', severity: 'error', parameters: { registries: ['registry.example.invalid'] } },
    { id: 'ready', type: 'readiness-probe', severity: 'error', parameters: {} },
    { id: 'live', type: 'liveness-probe', severity: 'error', parameters: {} },
    { id: 'limits', type: 'resource-limits', severity: 'error', parameters: { cpu: true, memory: true } },
  ],
};
const packSource = `${JSON.stringify(pack, null, 2)}\n`;
fs.writeFileSync(path.join(config, 'pack.json'), packSource);
fs.writeFileSync(path.join(config, 'baseline.json'), JSON.stringify({ schema_version: 'pipeline_lint_baseline.v2', groups: [] }));

const canonical = JSON.parse(fs.readFileSync('charts/kubeclaw/files/config/lint-policy.json', 'utf8'));
canonical.baseline_path = 'baseline.json';
canonical.experimental_tools = [];
canonical.kubernetes_policy_packs = [{ id: 'fixture', version: '1.0.0', path: 'pack.json', sha256: crypto.createHash('sha256').update(packSource).digest('hex') }];
canonical.projects = [{
  id: 'fixture', root: '.', discovery_max_depth: 5, languages: ['helm', 'yaml'],
  language_evidence: { helm: ['**/Chart.yaml'], yaml: ['**/*.yaml'] },
  go: { modules: [] }, terraform: { roots: [] },
  kubernetes: {
    raw_manifests: ['raw.yaml'], helm_charts: ['charts/fixture'], policy_packs: ['fixture'],
    kubernetes_version: '1.35.6', schema_location: `${schemas}/{{.ResourceKind}}{{.KindSuffix}}.json`,
    limits: { max_files: 8, max_file_bytes: 100_000, max_rendered_bytes: 100_000, max_documents: 32 },
  },
}];
canonical.architecture = { layers: [{ id: 'fixture', roots: ['.'], may_depend_on: ['fixture'] }] };
canonical.tools = canonical.tools.map((tool: any) => {
  if (['kubernetes-schema', 'kubernetes-policy'].includes(tool.id)) return { ...tool, languages: ['helm', 'yaml'], targets: ['.'], config_path: null };
  if (tool.id === 'kubeconform') return { ...tool, languages: ['helm'], targets: ['.'], config_path: null };
  if (tool.id === 'dependency-cruiser') return { ...tool, languages: ['javascript'], targets: ['.'], config_path: null };
  return { ...tool, languages: ['javascript'], targets: [], config_path: null,
    ...(['go-vet', 'go-imports', 'staticcheck', 'govulncheck'].includes(tool.id) ? { arguments: [] } : {}) };
});
const policyPath = path.join(config, 'policy.json');
fs.writeFileSync(policyPath, JSON.stringify(canonical));

try {
  const report: any = await executeLintReport({ workingDirectory: repository, policyPath, policyProject: 'fixture', tier: 'full', includeExperimental: true });
  assert.equal(report.tools.kubeconform, undefined, 'the generic Helm schema adapter must not duplicate the explicit Kubernetes schema authority');
  assert.equal(report.tools['kubernetes-schema'].status, 'ok');
  assert.equal(report.tools['kubernetes-schema'].experimental_findings, 0);
  assert.equal(report.tools['kubernetes-schema'].evidence.length, 4, 'raw and rendered source digests and schema outputs must remain evidence');
  assert.deepEqual(report.tools['kubernetes-schema'].evidence.filter((entry: any) => ['raw-manifest', 'helm-render'].includes(entry.kind)).map((entry: any) => entry.source).sort(), ['charts/fixture', 'raw.yaml']);
  assert.equal(report.tools['kubernetes-schema'].evidence.some((entry: any) => typeof entry.content === 'string' && entry.content.includes(root)), false,
    'schema evidence must not expose runner paths');
  assert.equal(report.tools['kubernetes-policy'].status, 'ok');
  assert.equal(report.tools['kubernetes-policy'].experimental_findings, 0);
  assert.equal(report.policy.policy_pack_digests.fixture, canonical.kubernetes_policy_packs[0].sha256);

  fs.writeFileSync(path.join(repository, 'declared.yaml'), validRaw.replace('name: app', 'name: declared'));
  const declared: any = await executeLintReport({
    workingDirectory: repository,
    policyPath,
    policyProject: 'fixture',
    tier: 'full',
    includeExperimental: true,
    kubernetes: { rawManifests: ['declared.yaml'], helmCharts: [] },
  });
  assert.deepEqual(declared.tools['kubernetes-schema'].evidence
    .filter((entry: any) => entry.kind === 'raw-manifest').map((entry: any) => entry.source), ['declared.yaml'],
  'the project declaration must select exact inputs without changing operator policy');
  await assert.rejects(() => executeLintReport({
    workingDirectory: repository,
    policyPath,
    policyProject: 'fixture',
    tier: 'full',
    kubernetes: { rawManifests: ['../escape.yaml'], helmCharts: [] },
  }), /LINT_KUBERNETES_INPUT_ESCAPE/u);

  fs.writeFileSync(path.join(repository, 'charts', 'legacy-discovery', 'templates', 'deployment.yaml'), workload(true).replace('apiVersion: apps/v1', 'apiVersion: apps/v2'));
  const discoveredLegacyChart: any = await executeLintReport({ workingDirectory: repository, policyPath, policyProject: 'fixture', tier: 'full', includeExperimental: true });
  assert.equal(discoveredLegacyChart.tools.kubeconform, undefined,
    'explicit Kubernetes inputs must disable broad legacy Helm discovery');
  assert.equal(discoveredLegacyChart.tools['kubernetes-schema'].findings.length, 0,
    'undeclared charts must not enter the authoritative Kubernetes input set');
  fs.writeFileSync(path.join(repository, 'charts', 'legacy-discovery', 'templates', 'deployment.yaml'), workload(true).replace('name: app', 'name: legacy-discovery'));

  const oversizedChartInput = path.join(repository, 'charts', 'fixture', 'templates', 'oversized.txt');
  fs.writeFileSync(oversizedChartInput, 'x'.repeat(100_001));
  const oversized: any = await executeLintReport({ workingDirectory: repository, policyPath, policyProject: 'fixture', tier: 'full', includeExperimental: true });
  assert.match(oversized.tools['kubernetes-schema'].error, /exceeds max_file_bytes/u, 'schema inputs must be bounded before Helm renders them');
  assert.match(oversized.tools['kubernetes-policy'].error, /exceeds max_file_bytes/u, 'policy inputs must be bounded before Helm renders them');
  fs.rmSync(oversizedChartInput);

  const escapedChartInput = path.join(repository, 'charts', 'fixture', 'templates', 'escaped-link');
  fs.symlinkSync('/etc/passwd', escapedChartInput);
  const escaped: any = await executeLintReport({ workingDirectory: repository, policyPath, policyProject: 'fixture', tier: 'full', includeExperimental: true });
  assert.match(escaped.tools['kubernetes-schema'].error, /must not be a symbolic link/u, 'schema inputs must reject chart symlinks before rendering');
  assert.match(escaped.tools['kubernetes-policy'].error, /must not be a symbolic link/u, 'policy inputs must reject chart symlinks before rendering');
  fs.rmSync(escapedChartInput);

  fs.writeFileSync(path.join(repository, 'raw.yaml'), Array.from({ length: 33 }, (_, index) => `apiVersion: v1\nkind: Secret\nmetadata: { name: item-${index} }\n`).join('---\n'));
  const excessiveDocuments: any = await executeLintReport({ workingDirectory: repository, policyPath, policyProject: 'fixture', tier: 'full', includeExperimental: true });
  assert.match(excessiveDocuments.tools['kubernetes-schema'].error, /exceeds max_documents/u, 'schema inputs must be document-bounded before kubeconform starts');
  fs.writeFileSync(path.join(repository, 'raw.yaml'), validRaw);

  const emptyDocuments = Array.from({ length: 20 }, () => '---\n').join('');
  fs.writeFileSync(path.join(repository, 'empty-a.yaml'), emptyDocuments);
  fs.writeFileSync(path.join(repository, 'empty-b.yaml'), emptyDocuments);
  const aggregateDocuments = JSON.parse(JSON.stringify(canonical));
  aggregateDocuments.projects[0].kubernetes.raw_manifests = ['empty-a.yaml', 'empty-b.yaml'];
  aggregateDocuments.projects[0].kubernetes.helm_charts = [];
  fs.writeFileSync(policyPath, JSON.stringify(aggregateDocuments));
  const aggregateDocumentReport: any = await executeLintReport({ workingDirectory: repository, policyPath, policyProject: 'fixture', tier: 'full', includeExperimental: true });
  assert.match(aggregateDocumentReport.tools['kubernetes-schema'].error, /combined Kubernetes inputs exceed max_documents/u,
    'empty YAML documents must count toward the aggregate document limit');
  fs.rmSync(path.join(repository, 'empty-a.yaml'));
  fs.rmSync(path.join(repository, 'empty-b.yaml'));
  fs.writeFileSync(policyPath, JSON.stringify(canonical));

  fs.writeFileSync(path.join(repository, 'raw.yaml'), Array.from({ length: 4096 }, (_, index) => `apiVersion: apps/v2\nkind: Deployment\nmetadata: { name: large-${index} }\nspec: {}\n`).join('---\n'));
  const largeEvidencePolicy = JSON.parse(JSON.stringify(canonical));
  largeEvidencePolicy.projects[0].kubernetes.limits.max_file_bytes = 1_048_576;
  largeEvidencePolicy.projects[0].kubernetes.limits.max_rendered_bytes = 1_048_576;
  largeEvidencePolicy.projects[0].kubernetes.limits.max_documents = 8192;
  fs.writeFileSync(policyPath, JSON.stringify(largeEvidencePolicy));
  const largeEvidenceReport: any = await executeLintReport({ workingDirectory: repository, policyPath, policyProject: 'fixture', tier: 'full', includeExperimental: true });
  const largeSchemaEvidence = largeEvidenceReport.tools['kubernetes-schema'].evidence.find((entry: any) => entry.source === 'raw-manifests');
  assert.equal(largeEvidenceReport.tools['kubernetes-schema'].status, 'ok', 'large schema output must not fail the tool');
  assert.equal(largeSchemaEvidence.bytes > 262_144, true);
  assert.equal(largeSchemaEvidence.content, undefined, 'large schema evidence must retain only its digest and size');
  fs.writeFileSync(path.join(repository, 'raw.yaml'), validRaw);
  fs.writeFileSync(policyPath, JSON.stringify(canonical));

  fs.writeFileSync(path.join(repository, 'raw.yaml'), workload(false));
  const failing: any = await executeLintReport({ workingDirectory: repository, policyPath, policyProject: 'fixture', tier: 'full', includeExperimental: true });
  const policyFindings = failing.tools['kubernetes-policy'].findings;
  assert.equal(policyFindings.some((entry: any) => entry.code === 'kubernetes-policy/ready' && entry.line > 1), true);
  assert.equal(policyFindings.some((entry: any) => entry.code === 'kubernetes-policy/live'), true);
  assert.equal(policyFindings.some((entry: any) => entry.message.includes("container 'sidecar'") && entry.code === 'kubernetes-policy/env'), true,
    'each container must be checked independently');
  assert.equal(policyFindings.some((entry: any) => entry.message.includes("init container 'setup'") && entry.code === 'kubernetes-policy/secret'), true,
    'envFrom Secret references in init containers must be validated');
  assert.equal(policyFindings.some((entry: any) => entry.message.includes("init container 'setup'") && entry.code === 'kubernetes-policy/registry'), true,
    'private-registry rules must cover init containers');
  assert.equal(policyFindings.some((entry: any) => entry.message.includes("init container 'setup'") && entry.code === 'kubernetes-policy/limits'), true,
    'resource rules must cover init containers');
  assert.equal(policyFindings.filter((entry: any) => entry.code === 'kubernetes-policy/limits').length >= 4, true);
  assert.equal(failing.summary.total_blocking > 0, true, 'authoritative Kubernetes policy findings must block lint');

  fs.writeFileSync(path.join(repository, 'raw.yaml'), validRaw);
  fs.writeFileSync(path.join(repository, 'charts', 'fixture', 'templates', 'deployment.yaml'), workload(false));
  const renderedPolicyFailure: any = await executeLintReport({ workingDirectory: repository, policyPath, policyProject: 'fixture', tier: 'full', includeExperimental: true });
  assert.equal(renderedPolicyFailure.tools['kubernetes-policy'].findings.some((entry: any) => entry.file === 'charts/fixture/templates/deployment.yaml'), true,
    'rendered Helm policy findings must identify the source template');
  fs.writeFileSync(path.join(repository, 'charts', 'fixture', 'templates', 'deployment.yaml'), `# Source: fixture/../../spoofed.yaml\n${workload(false)}`);
  const spoofedSource: any = await executeLintReport({ workingDirectory: repository, policyPath, policyProject: 'fixture', tier: 'full', includeExperimental: true });
  assert.equal(spoofedSource.tools['kubernetes-policy'].findings.some((entry: any) => String(entry.file).includes('spoofed.yaml') || String(entry.file).includes('..')), false,
    'chart content must not spoof a finding path through a Source comment');
  fs.writeFileSync(path.join(repository, 'charts', 'fixture', 'templates', 'deployment.yaml'), workload(true));

  fs.writeFileSync(path.join(repository, 'raw.yaml'), workload(true).replace('apiVersion: apps/v1', 'apiVersion: apps/v2'));
  const rawSchemaFailure: any = await executeLintReport({ workingDirectory: repository, policyPath, policyProject: 'fixture', tier: 'full', includeExperimental: true });
  assert.equal(rawSchemaFailure.tools['kubernetes-schema'].blocking_findings > 0, true, 'invalid raw Kubernetes API version must fail schema validation');
  assert.equal(rawSchemaFailure.tools['kubernetes-schema'].findings.some((entry: any) => entry.file === 'raw.yaml'), true,
    'raw schema findings must use stable repository-relative paths');
  assert.equal(rawSchemaFailure.tools['kubernetes-schema'].findings.some((entry: any) => String(entry.file).includes(root)), false,
    'raw schema findings must not expose runner paths');

  fs.writeFileSync(path.join(repository, 'raw.yaml'), workload(true));
  fs.writeFileSync(path.join(repository, 'charts', 'fixture', 'templates', 'deployment.yaml'), workload(true).replace('apiVersion: apps/v1', 'apiVersion: apps/v2'));
  const renderedSchemaFailure: any = await executeLintReport({ workingDirectory: repository, policyPath, policyProject: 'fixture', tier: 'full', includeExperimental: true });
  assert.equal(renderedSchemaFailure.tools['kubernetes-schema'].blocking_findings > 0, true, 'invalid rendered Helm API version must fail schema validation');

  const unknownPack = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  unknownPack.projects[0].kubernetes.policy_packs = ['not-installed'];
  fs.writeFileSync(policyPath, JSON.stringify(unknownPack));
  await assert.rejects(() => executeLintReport({ workingDirectory: repository, policyPath, policyProject: 'fixture', tier: 'full' }), /unknown operator-approved pack/u);

  const networkSchema = JSON.parse(JSON.stringify(canonical));
  networkSchema.projects[0].kubernetes.schema_location = 'https://example.invalid/{{.ResourceKind}}.json';
  fs.writeFileSync(policyPath, JSON.stringify(networkSchema));
  await assert.rejects(() => executeLintReport({ workingDirectory: repository, policyPath, policyProject: 'fixture', tier: 'full' }), /required absolute operator-controlled path|network schema locations/u);

  const forged = JSON.parse(JSON.stringify(canonical));
  forged.kubernetes_policy_packs[0].sha256 = '0'.repeat(64);
  fs.writeFileSync(policyPath, JSON.stringify(forged));
  await assert.rejects(() => executeLintReport({ workingDirectory: repository, policyPath, policyProject: 'fixture', tier: 'full' }), /digest mismatch/u);

  const duplicateInputs = JSON.parse(JSON.stringify(canonical));
  duplicateInputs.projects[0].kubernetes.raw_manifests.push('raw.yaml');
  fs.writeFileSync(policyPath, JSON.stringify(duplicateInputs));
  await assert.rejects(() => executeLintReport({ workingDirectory: repository, policyPath, policyProject: 'fixture', tier: 'full' }), /duplicate values are not allowed/u);

  const externalProject = path.join(root, 'external-project');
  fs.mkdirSync(externalProject);
  fs.writeFileSync(path.join(externalProject, 'raw.yaml'), validRaw);
  fs.symlinkSync(externalProject, path.join(repository, 'linked-project'));
  const escapedProject = JSON.parse(JSON.stringify(canonical));
  escapedProject.projects[0].root = 'linked-project';
  escapedProject.projects[0].kubernetes.raw_manifests = ['raw.yaml'];
  escapedProject.projects[0].kubernetes.helm_charts = [];
  fs.writeFileSync(policyPath, JSON.stringify(escapedProject));
  const escapedProjectReport: any = await executeLintReport({ workingDirectory: repository, policyPath, policyProject: 'fixture', tier: 'full', includeExperimental: true });
  assert.match(escapedProjectReport.tools['kubernetes-schema'].error, /escapes repository root/u);
  assert.match(escapedProjectReport.tools['kubernetes-policy'].error, /escapes repository root/u);

  const oversizedPackSource = JSON.stringify({ ...pack, padding: 'x'.repeat(1_048_576) });
  fs.writeFileSync(path.join(config, 'oversized-pack.json'), oversizedPackSource);
  const oversizedPack = JSON.parse(JSON.stringify(canonical));
  oversizedPack.kubernetes_policy_packs[0].path = 'oversized-pack.json';
  oversizedPack.kubernetes_policy_packs[0].sha256 = crypto.createHash('sha256').update(oversizedPackSource).digest('hex');
  fs.writeFileSync(policyPath, JSON.stringify(oversizedPack));
  await assert.rejects(() => executeLintReport({ workingDirectory: repository, policyPath, policyProject: 'fixture', tier: 'full' }), /policy pack exceeds 1048576 bytes/u);

  const excessiveRulePack = { ...pack, rules: Array.from({ length: 257 }, (_, index) => ({ id: `rule-${index}`, type: 'liveness-probe', severity: 'error', parameters: {} })) };
  const excessiveRuleSource = JSON.stringify(excessiveRulePack);
  fs.writeFileSync(path.join(config, 'excessive-rules.json'), excessiveRuleSource);
  const excessiveRules = JSON.parse(JSON.stringify(canonical));
  excessiveRules.kubernetes_policy_packs[0].path = 'excessive-rules.json';
  excessiveRules.kubernetes_policy_packs[0].sha256 = crypto.createHash('sha256').update(excessiveRuleSource).digest('hex');
  fs.writeFileSync(policyPath, JSON.stringify(excessiveRules));
  await assert.rejects(() => executeLintReport({ workingDirectory: repository, policyPath, policyProject: 'fixture', tier: 'full' }), /must contain at most 256 rules/u);

  fs.mkdirSync(path.join(config, 'packs'));
  const manyPacks = JSON.parse(JSON.stringify(canonical));
  manyPacks.kubernetes_policy_packs = [];
  manyPacks.projects[0].kubernetes.policy_packs = [];
  for (let index = 0; index < 255; index += 1) {
    const id = `pack-${index}`;
    const document = { ...pack, id };
    const source = JSON.stringify(document);
    const relative = `packs/${id}.json`;
    fs.writeFileSync(path.join(config, relative), source);
    manyPacks.kubernetes_policy_packs.push({ id, version: '1.0.0', path: relative, sha256: crypto.createHash('sha256').update(source).digest('hex') });
    manyPacks.projects[0].kubernetes.policy_packs.push(id);
  }
  fs.writeFileSync(policyPath, JSON.stringify(manyPacks));
  await assert.rejects(() => executeLintReport({ workingDirectory: repository, policyPath, policyProject: 'fixture', tier: 'full' }), /exceed the 256-entry evidence capacity/u);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, phase: 'manifest-lint-implementation', rawSchema: true, renderedHelmSchema: true, policyPacks: true, authoritative: true }));
