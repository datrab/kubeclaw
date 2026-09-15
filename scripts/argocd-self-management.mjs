#!/usr/bin/env node
// Reuse the bootstrap values and health check without maintaining another copy.
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { validateReleaseReceipt } from './updates/deployment-release.mjs';

const root = path.resolve(import.meta.dirname, '..');
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
// The platform root deploys definitions, while each service is synced separately.
// Its health must not wait for a manual child sync or the runtime-only Lua gate.
for (const child of [application, tailscale, ops]) {
  child.metadata.annotations = { 'argocd.argoproj.io/ignore-healthcheck': 'true' };
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
for (const [name, object] of [['infra-project', project], ['argocd', application], ['tailscale-operator', tailscale], ['codex-ops', ops], ['../platform', platform]]) {
  const file = path.join(directory, `${name}.yaml`);
  const content = '# Generated by node scripts/argocd-self-management.mjs\n' + yaml.dump(object, { lineWidth: -1, noRefs: true });
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) throw new Error(`Generated Argo manifest differs: ${file}`);
  } else {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(file, content);
  }
}
