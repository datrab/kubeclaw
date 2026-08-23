import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

type AnyRecord = Record<string, any>;

const baseSchema = {
  $schema: 'http://json-schema.org/draft-04/schema#',
  type: 'object',
  required: ['apiVersion', 'kind', 'metadata'],
  properties: {
    apiVersion: { type: 'string' },
    kind: { type: 'string' },
    metadata: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, namespace: { type: 'string' } }, additionalProperties: true },
    data: { type: 'object' }, stringData: { type: 'object' }, imagePullSecrets: { type: 'array' }, spec: { type: 'object' },
  },
  additionalProperties: true,
};

function writeSchemas(directory: string): void {
  const definitions: Record<string, { apiVersion: string; kind: string }> = {
    'deployment-apps-v1.json': { apiVersion: 'apps/v1', kind: 'Deployment' },
    'statefulset-apps-v1.json': { apiVersion: 'apps/v1', kind: 'StatefulSet' },
    'daemonset-apps-v1.json': { apiVersion: 'apps/v1', kind: 'DaemonSet' },
    'job-batch-v1.json': { apiVersion: 'batch/v1', kind: 'Job' },
    'cronjob-batch-v1.json': { apiVersion: 'batch/v1', kind: 'CronJob' },
    'secret-v1.json': { apiVersion: 'v1', kind: 'Secret' },
    'configmap-v1.json': { apiVersion: 'v1', kind: 'ConfigMap' },
    'serviceaccount-v1.json': { apiVersion: 'v1', kind: 'ServiceAccount' },
  };
  for (const [name, definition] of Object.entries(definitions)) {
    fs.writeFileSync(path.join(directory, name), JSON.stringify({
      ...baseSchema,
      properties: {
        ...baseSchema.properties,
        apiVersion: { enum: [definition.apiVersion] },
        kind: { enum: [definition.kind] },
      },
    }));
  }
}

function toolPolicy(rootPolicy: AnyRecord): AnyRecord {
  rootPolicy.experimental_tools = [];
  rootPolicy.tools = rootPolicy.tools.map((tool: AnyRecord) => {
    if (['kubernetes-schema', 'kubernetes-policy'].includes(tool.id)) return { ...tool, languages: ['helm', 'yaml'], targets: ['.'], config_path: null };
    if (tool.id === 'kubeconform') return { ...tool, languages: ['helm'], targets: ['.'], config_path: null };
    if (tool.id === 'dependency-cruiser') return { ...tool, languages: ['javascript'], targets: ['.'], config_path: null };
    return {
      ...tool,
      languages: ['javascript'],
      targets: [],
      config_path: null,
      ...(['go-vet', 'go-imports', 'staticcheck', 'govulncheck'].includes(tool.id) ? { arguments: [] } : {}),
    };
  });
  return rootPolicy;
}

function git(repository: string, args: string[]): void {
  const result = spawnSync('git', args, { cwd: repository, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
}

export function workload(options: AnyRecord = {}): string {
  const kind = options.kind ?? 'Deployment';
  const apiVersion = ['Job', 'CronJob'].includes(kind) ? 'batch/v1' : 'apps/v1';
  const name = options.name ?? kind.toLowerCase();
  const podIndent = kind === 'CronJob' ? '        ' : '    ';
  const podPrefix = kind === 'CronJob'
    ? 'spec:\n  schedule: "* * * * *"\n  jobTemplate:\n    spec:\n      template:\n        metadata: { labels: { app: fixture } }\n        spec:'
    : ['Deployment', 'StatefulSet', 'DaemonSet'].includes(kind)
      ? 'spec:\n  selector: { matchLabels: { app: fixture } }\n  template:\n    metadata: { labels: { app: fixture } }\n    spec:'
      : 'spec:\n  template:\n    metadata: { labels: { app: fixture } }\n    spec:';
  const second = options.secondContainer === false ? '' : `\n${podIndent}  - name: sidecar\n${podIndent}    image: public.example/sidecar:1${options.completeSecond ? `\n${podIndent}    env:\n${podIndent}      - { name: REDIS_HOST, value: redis }\n${podIndent}    readinessProbe: { httpGet: { path: /ready, port: 8080 } }\n${podIndent}    livenessProbe: { httpGet: { path: /live, port: 8080 } }\n${podIndent}    resources: { limits: { cpu: 50m, memory: 32Mi } }` : ''}`;
  return `apiVersion: ${apiVersion}\nkind: ${kind}\nmetadata:\n  name: ${name}\n${podPrefix}\n${podIndent}  serviceAccountName: runtime\n${podIndent}  containers:\n${podIndent}  - name: app\n${podIndent}    image: registry.example.invalid/app:1\n${podIndent}    envFrom:\n${podIndent}      - secretRef: { name: runtime-env }\n${podIndent}      - configMapRef: { name: runtime-config }\n${podIndent}    env:\n${podIndent}      - name: TOKEN\n${podIndent}        valueFrom:\n${podIndent}          secretKeyRef: { name: runtime-secret, key: token }\n${podIndent}    readinessProbe: { httpGet: { path: /ready, port: 8080 } }\n${podIndent}    livenessProbe: { httpGet: { path: /live, port: 8080 } }\n${podIndent}    resources: { limits: { cpu: 100m, memory: 64Mi } }${second}\n`;
}

export function legacyCompatibleWorkload(): string {
  const content = workload({ secondContainer: false })
    .replace('serviceAccountName: runtime', 'imagePullSecrets: [{ name: registry-auth }]')
    .replace('        envFrom:\n          - secretRef: { name: runtime-env }\n          - configMapRef: { name: runtime-config }', '        env:\n          - { name: REDIS_HOST, value: redis }')
    .replace('        env:\n          - name: TOKEN', '          - name: TOKEN');
  if (!/^\s+- \{ name: REDIS_HOST, value: redis \}$/mu.test(content)) {
    throw new Error('legacy-compatible workload is missing REDIS_HOST');
  }
  return content;
}

export function supportResources(): string {
  return `---\napiVersion: v1\nkind: Secret\nmetadata: { name: runtime-secret }\nstringData: { token: value }\n---\napiVersion: v1\nkind: Secret\nmetadata: { name: runtime-env }\nstringData: { REDIS_HOST: redis }\n---\napiVersion: v1\nkind: ConfigMap\nmetadata: { name: runtime-config }\ndata: { APP_MODE: test }\n---\napiVersion: v1\nkind: ServiceAccount\nmetadata: { name: runtime }\nimagePullSecrets: [{ name: registry-auth }]\n`;
}

export interface ManifestParityFixture {
  root: string;
  repository: string;
  configuration: string;
  schemas: string;
  policyPath: string;
  policy: AnyRecord;
  packPath: string;
  cleanup(): void;
  commit(message?: string): void;
  writeRaw(content: string): void;
  writeChart(content: string): void;
  writePolicy(policy: AnyRecord): void;
}

export function createManifestParityFixture(): ManifestParityFixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-manifest-parity-'));
  const repository = path.join(root, 'repository');
  const configuration = path.join(root, 'configuration');
  const schemas = path.join(root, 'schemas');
  fs.mkdirSync(path.join(repository, 'charts', 'fixture', 'templates'), { recursive: true });
  fs.mkdirSync(configuration, { recursive: true });
  fs.mkdirSync(schemas, { recursive: true });
  writeSchemas(schemas);
  fs.writeFileSync(path.join(repository, 'charts', 'fixture', 'Chart.yaml'), 'apiVersion: v2\nname: fixture\nversion: 1.0.0\n');
  fs.writeFileSync(path.join(repository, 'legacy-secret.yaml'), 'apiVersion: v1\nkind: Secret\nmetadata: { name: runtime-secret }\ndata: { token: dmFsdWU= }\n');
  fs.writeFileSync(path.join(configuration, 'baseline.json'), JSON.stringify({ schema_version: 'pipeline_lint_baseline.v2', groups: [] }));
  const packPath = path.join(configuration, 'pack.json');
  const packSource = fs.readFileSync('charts/kubeclaw/files/config/kubernetes-policy-pack-default.json', 'utf8');
  fs.writeFileSync(packPath, packSource);
  const policy = toolPolicy(JSON.parse(fs.readFileSync('charts/kubeclaw/files/config/lint-policy.json', 'utf8')));
  policy.baseline_path = 'baseline.json';
  policy.kubernetes_policy_packs = [{ id: 'kubeclaw-default', version: '1.0.0', path: 'pack.json', sha256: crypto.createHash('sha256').update(packSource).digest('hex') }];
  policy.projects = [{
    id: 'fixture', root: '.', discovery_max_depth: 6, languages: ['helm', 'yaml'],
    language_evidence: { helm: ['**/Chart.yaml'], yaml: ['**/*.yaml'] },
    go: { modules: [] }, terraform: { roots: [] },
    kubernetes: {
      raw_manifests: ['raw.yaml'], helm_charts: ['charts/fixture'], policy_packs: ['kubeclaw-default'],
      kubernetes_version: '1.35.6', schema_location: `${schemas}/{{.ResourceKind}}{{.KindSuffix}}.json`,
      limits: { max_files: 64, max_file_bytes: 1_048_576, max_rendered_bytes: 4_194_304, max_documents: 256 },
    },
  }];
  policy.architecture = { layers: [{ id: 'fixture', roots: ['.'], may_depend_on: ['fixture'] }] };
  const policyPath = path.join(configuration, 'policy.json');
  const writePolicy = (value: AnyRecord) => fs.writeFileSync(policyPath, JSON.stringify(value));
  const writeRaw = (content: string) => fs.writeFileSync(path.join(repository, 'raw.yaml'), content);
  const writeChart = (content: string) => fs.writeFileSync(path.join(repository, 'charts', 'fixture', 'templates', 'workload.yaml'), content);
  writeRaw(`${workload({ secondContainer: false })}${supportResources()}`);
  writeChart(workload({ name: 'helm', secondContainer: false }));
  writePolicy(policy);
  git(repository, ['init', '--quiet']);
  git(repository, ['config', 'user.email', 'parity@example.invalid']);
  git(repository, ['config', 'user.name', 'Manifest Parity']);
  const fixture = {
    root, repository, configuration, schemas, policyPath, policy, packPath,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
    commit: (message = 'fixture') => { git(repository, ['add', '.']); git(repository, ['commit', '--quiet', '-m', message]); },
    writeRaw, writeChart, writePolicy,
  };
  fixture.commit('initial fixture');
  return fixture;
}
