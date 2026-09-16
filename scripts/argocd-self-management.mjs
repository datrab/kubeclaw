#!/usr/bin/env node
// Reuse the bootstrap values and health check without maintaining another copy.
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { validateReleaseReceipt } from './updates/deployment-release.mjs';

const root = path.resolve(import.meta.dirname, '..');
const versions = JSON.parse(fs.readFileSync(path.join(root, 'versions.json'), 'utf8'));
const repository = 'https://github.com/datrab/kubeclaw.git';
const health = fs.readFileSync(path.join(root, 'charts/gitops/files/application-health.lua'), 'utf8');
const opsReceipt = JSON.parse(fs.readFileSync(path.join(root, 'releases/ops-images.json'), 'utf8'));
validateReleaseReceipt(opsReceipt, 'ops');
const opsValues = yaml.load(fs.readFileSync(path.join(root, 'gitops/platform/values/codex-ops.yaml'), 'utf8'));
const project = {
  apiVersion: 'argoproj.io/v1alpha1', kind: 'AppProject',
  metadata: { name: 'infra', namespace: 'argocd', annotations: { 'argocd.argoproj.io/sync-wave': '-1' } },
  spec: {
    description: 'Infrastructure applications; destinations are added during reviewed handovers.',
    sourceRepos: [repository, 'https://argoproj.github.io/argo-helm', 'https://pkgs.tailscale.com/helmcharts'],
    destinations: [...new Set(['argocd', 'tailscale', 'kubeclaw-ops', 'kubeclaw', ...opsValues.rbac.namespaces])].map(namespace => ({ server: 'https://kubernetes.default.svc', namespace })),
    clusterResourceWhitelist: [
      { group: 'rbac.authorization.k8s.io', kind: 'ClusterRole' },
      { group: 'rbac.authorization.k8s.io', kind: 'ClusterRoleBinding' },
      { group: 'apiextensions.k8s.io', kind: 'CustomResourceDefinition' },
      { group: 'networking.k8s.io', kind: 'IngressClass' },
    ],
    namespaceResourceWhitelist: [{ group: '*', kind: '*' }],
  },
};
const application = {
  apiVersion: 'argoproj.io/v1alpha1', kind: 'Application',
  metadata: { name: 'argocd', namespace: 'argocd' },
  spec: {
    project: 'infra',
    sources: [
      {
        repoURL: 'https://argoproj.github.io/argo-helm', chart: 'argo-cd', targetRevision: '10.8.0',
        helm: {
          releaseName: 'argocd',
          valueFiles: ['$values/my-values/infra/argocd-values.yaml'],
          valuesObject: { configs: { cm: { 'resource.customizations.health.argoproj.io_Application': health } } },
        },
      },
      {
        repoURL: repository, targetRevision: 'main', ref: 'values', path: 'my-values/infra',
        directory: { include: 'argocd-tailscale-ingress.yaml' },
      },
    ],
    destination: { server: 'https://kubernetes.default.svc', namespace: 'argocd' },
    // Registration is read-only reconciliation. First sync is deliberately manual.
    syncPolicy: { syncOptions: ['FailOnSharedResource=true'] },
  },
};
const directory = path.join(root, 'gitops/platform/bootstrap');
const tailscale = {
  apiVersion: 'argoproj.io/v1alpha1', kind: 'Application',
  metadata: { name: 'tailscale-operator', namespace: 'argocd' },
  spec: {
    project: 'infra',
    sources: [
      {
        repoURL: 'https://pkgs.tailscale.com/helmcharts', chart: 'tailscale-operator', targetRevision: '1.102.3',
        helm: { releaseName: 'tailscale-operator', valueFiles: ['$values/gitops/platform/values/tailscale-operator.yaml'] },
      },
      { repoURL: repository, targetRevision: 'main', ref: 'values' },
    ],
    destination: { server: 'https://kubernetes.default.svc', namespace: 'tailscale' },
    syncPolicy: { syncOptions: ['FailOnSharedResource=true', 'ServerSideApply=true'] },
  },
};
const ops = {
  apiVersion: 'argoproj.io/v1alpha1', kind: 'Application',
  metadata: { name: 'codex-ops', namespace: 'argocd' },
  spec: {
    project: 'infra',
    source: {
      repoURL: repository, targetRevision: opsReceipt.commit, path: 'charts/ops-pod',
      helm: {
        releaseName: 'codex-ops',
        valuesObject: { ...opsValues, codexImage: opsReceipt.images['codex-ops'], mcpImage: opsReceipt.images['ops-mcp'] },
      },
    },
    destination: { server: 'https://kubernetes.default.svc', namespace: 'kubeclaw-ops' },
    syncPolicy: { syncOptions: ['FailOnSharedResource=true'] },
  },
};
const dataProject = {
  apiVersion: 'argoproj.io/v1alpha1', kind: 'AppProject',
  metadata: { name: 'data-services', namespace: 'argocd', annotations: { 'argocd.argoproj.io/sync-wave': '-1' } },
  spec: {
    description: 'Independently synchronized data services.',
    sourceRepos: [repository, 'registry-1.docker.io/bitnamicharts'],
    destinations: [{ server: 'https://kubernetes.default.svc', namespace: 'kubeclaw' }],
    clusterResourceWhitelist: [],
    namespaceResourceWhitelist: [{ group: '*', kind: '*' }],
  },
};
const redis = {
  apiVersion: 'argoproj.io/v1alpha1', kind: 'Application',
  metadata: { name: 'redis', namespace: 'argocd' },
  spec: {
    project: 'data-services',
    sources: [
      {
        repoURL: 'registry-1.docker.io/bitnamicharts', chart: 'redis', targetRevision: versions.redisProduction.chartVersion,
        helm: { releaseName: 'redis', valueFiles: ['$values/gitops/platform/values/redis.yaml'] },
      },
      { repoURL: repository, targetRevision: 'main', ref: 'values' },
    ],
    destination: { server: 'https://kubernetes.default.svc', namespace: 'kubeclaw' },
    syncPolicy: { syncOptions: ['FailOnSharedResource=true'] },
  },
};
const postgresql = {
  apiVersion: 'argoproj.io/v1alpha1', kind: 'Application',
  metadata: { name: 'postgresql', namespace: 'argocd' },
  spec: {
    project: 'data-services',
    sources: [
      {
        repoURL: 'registry-1.docker.io/bitnamicharts', chart: 'postgresql', targetRevision: versions.postgresqlProduction.chartVersion,
        helm: { releaseName: 'postgresql', valueFiles: ['$values/gitops/platform/values/postgresql.yaml'] },
      },
      { repoURL: repository, targetRevision: 'main', ref: 'values' },
    ],
    destination: { server: 'https://kubernetes.default.svc', namespace: 'kubeclaw' },
    syncPolicy: { syncOptions: ['FailOnSharedResource=true'] },
  },
};
const registryMirror = {
  apiVersion: 'argoproj.io/v1alpha1', kind: 'Application',
  metadata: { name: 'registry-mirror', namespace: 'argocd' },
  spec: {
    project: 'infra',
    source: {
      repoURL: repository, targetRevision: 'main', path: 'my-values/infra',
      directory: { include: 'registry-mirror.yaml', recurse: false },
    },
    destination: { server: 'https://kubernetes.default.svc', namespace: 'kubeclaw' },
    syncPolicy: { syncOptions: ['FailOnSharedResource=true'] },
  },
};
const registryLocal = {
  apiVersion: 'argoproj.io/v1alpha1', kind: 'Application',
  metadata: { name: 'registry-local', namespace: 'argocd' },
  spec: {
    project: 'infra',
    source: {
      repoURL: repository, targetRevision: 'main', path: 'gitops/platform/registry-local',
      directory: { include: 'resources.yaml', recurse: false },
    },
    destination: { server: 'https://kubernetes.default.svc', namespace: 'kubeclaw' },
    syncPolicy: { syncOptions: ['FailOnSharedResource=true'] },
  },
};
const monitoringProject = {
  apiVersion: 'argoproj.io/v1alpha1', kind: 'AppProject',
  metadata: { name: 'monitoring', namespace: 'argocd', annotations: { 'argocd.argoproj.io/sync-wave': '-1' } },
  spec: {
    description: 'Metrics, dashboards and logs with manual service syncs.',
    sourceRepos: [repository, 'https://prometheus-community.github.io/helm-charts', 'https://grafana-community.github.io/helm-charts', 'https://grafana.github.io/helm-charts'],
    destinations: ['monitoring', 'kube-system'].map(namespace => ({ server: 'https://kubernetes.default.svc', namespace })),
    clusterResourceWhitelist: [
      { group: 'rbac.authorization.k8s.io', kind: 'ClusterRole' },
      { group: 'rbac.authorization.k8s.io', kind: 'ClusterRoleBinding' },
      { group: 'apiextensions.k8s.io', kind: 'CustomResourceDefinition' },
      { group: 'admissionregistration.k8s.io', kind: 'MutatingWebhookConfiguration' },
      { group: 'admissionregistration.k8s.io', kind: 'ValidatingWebhookConfiguration' },
    ],
    namespaceResourceWhitelist: [{ group: '*', kind: '*' }],
  },
};
const monitoringApplications = [
  ['prometheus', 'kube-prometheus-stack', 'https://prometheus-community.github.io/helm-charts', 'prometheus'],
  ['loki', 'loki', 'https://grafana-community.github.io/helm-charts', 'loki'],
  ['alloy', 'alloy', 'https://grafana.github.io/helm-charts', 'alloy'],
  ['promtail', 'promtail', 'https://grafana.github.io/helm-charts', 'promtail-retired'],
].map(([name, chart, repoURL, values]) => ({
  apiVersion: 'argoproj.io/v1alpha1', kind: 'Application',
  metadata: { name, namespace: 'argocd' },
  spec: {
    project: 'monitoring',
    sources: [
      { repoURL, chart, targetRevision: versions.monitoringCharts[name].version,
        helm: { releaseName: name, valueFiles: [`$values/gitops/platform/values/${values}.yaml`] } },
      { repoURL: repository, targetRevision: 'main', ref: 'values' },
    ],
    destination: { server: 'https://kubernetes.default.svc', namespace: 'monitoring' },
    syncPolicy: { syncOptions: ['FailOnSharedResource=true', 'ServerSideApply=true'] },
  },
}));
// The platform root deploys definitions, while each service is synced separately.
// Its health must not wait for a manual child sync or the runtime-only Lua gate.
for (const child of [application, tailscale, ops, redis, postgresql, registryMirror, registryLocal, ...monitoringApplications]) {
  child.metadata.annotations = { 'argocd.argoproj.io/ignore-healthcheck': 'true', 'kubeclaw.io/health-mode': 'observed' };
}
const platform = {
  apiVersion: 'argoproj.io/v1alpha1', kind: 'Application',
  metadata: { name: 'platform', namespace: 'argocd' },
  spec: {
    project: 'infra',
    source: { repoURL: repository, targetRevision: 'main', path: 'gitops/platform/bootstrap', directory: { recurse: false } },
    destination: { server: 'https://kubernetes.default.svc', namespace: 'argocd' },
    syncPolicy: {
      automated: { prune: false, selfHeal: true, allowEmpty: false },
      syncOptions: ['FailOnSharedResource=true'],
    },
  },
};
for (const [name, object] of [['infra-project', project], ['data-project', dataProject], ['argocd', application], ['tailscale-operator', tailscale], ['codex-ops', ops], ['redis', redis], ['postgresql', postgresql], ['registry-mirror', registryMirror], ['registry-local', registryLocal], ['monitoring-project', monitoringProject], ...monitoringApplications.map(app => [app.metadata.name, app]), ['../platform', platform]]) {
  const file = path.join(directory, `${name}.yaml`);
  const content = '# Generated by node scripts/argocd-self-management.mjs\n' + yaml.dump(object, { lineWidth: -1, noRefs: true });
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) throw new Error(`Generated Argo manifest differs: ${file}`);
  } else {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(file, content);
  }
}
