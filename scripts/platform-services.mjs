// Adoption definitions for independently synchronized identity and storage services.
export function platformServices(versions, repository) {
  const server = 'https://kubernetes.default.svc';
  const spiffe = 'https://spiffe.github.io/helm-charts-hardened/';
  const smb = 'https://kubernetes-csi.github.io/csi-driver-smb';
  const project = (name, repo, namespaces, clusterResources) => ({
    apiVersion: 'argoproj.io/v1alpha1', kind: 'AppProject',
    metadata: { name, namespace: 'argocd', annotations: { 'argocd.argoproj.io/sync-wave': '-1' } },
    spec: {
      description: 'Existing platform services; manual sync, no automatic pruning.',
      sourceRepos: [repository, repo],
      destinations: namespaces.map(namespace => ({ server, namespace })),
      clusterResourceWhitelist: clusterResources.map(([group, kind]) => ({ group, kind })),
      namespaceResourceWhitelist: [{ group: '*', kind: '*' }],
    },
  });
  const rbac = [['rbac.authorization.k8s.io', 'ClusterRole'], ['rbac.authorization.k8s.io', 'ClusterRoleBinding']];
  const identity = project('identity', spiffe, ['spire-server', 'spire-system'], [...rbac,
    ['', 'Namespace'], ['apiextensions.k8s.io', 'CustomResourceDefinition'],
    ['storage.k8s.io', 'CSIDriver'], ['spire.spiffe.io', 'ClusterSPIFFEID'],
    ['admissionregistration.k8s.io', 'ValidatingWebhookConfiguration'],
  ]);
  const storage = project('storage-drivers', smb, ['kube-system'], [...rbac, ['storage.k8s.io', 'CSIDriver']]);
  const applications = [
    ['spire-crds', 'identity', spiffe, 'spire-server'],
    ['spire', 'identity', spiffe, 'spire-server'],
    ['csi-driver-smb', 'storage-drivers', smb, 'kube-system'],
  ].map(([name, projectName, repoURL, namespace]) => ({
    apiVersion: 'argoproj.io/v1alpha1', kind: 'Application',
    metadata: { name, namespace: 'argocd' },
    spec: {
      project: projectName,
      sources: [
        { repoURL, chart: name, targetRevision: versions.platformCharts[name].version,
          helm: { releaseName: name, skipTests: true, valueFiles: [`$values/gitops/platform/values/${name}.yaml`] } },
        { repoURL: repository, targetRevision: 'main', ref: 'values' },
      ],
      destination: { server, namespace },
      syncPolicy: { syncOptions: ['FailOnSharedResource=true', 'ServerSideApply=true'] },
    },
  }));
  const spire = applications.find(app => app.metadata.name === 'spire');
  // Let the API server compare its associative webhook list and defaulted fields.
  spire.metadata.annotations = { 'argocd.argoproj.io/compare-options': 'ServerSideDiff=true' };
  // Adoption only: the existing webhook must already have a CA and Fail policies.
  // The chart emits Ignore for one webhook even with hooks disabled. Preserve
  // live admission enforcement instead of reapplying that bootstrap default.
  spire.spec.ignoreDifferences = [{
    group: 'admissionregistration.k8s.io', kind: 'ValidatingWebhookConfiguration',
    name: 'spire-server-spire-controller-manager-webhook',
    jqPathExpressions: ['.webhooks[]?.clientConfig.caBundle', '.webhooks[]?.failurePolicy'],
  }, {
    group: 'apps', kind: 'StatefulSet', name: 'spire-server', namespace: 'spire-server',
    // API-added TypeMeta only; keep PVC metadata and the entire storage spec visible.
    jqPathExpressions: ['.spec.volumeClaimTemplates[]?.apiVersion', '.spec.volumeClaimTemplates[]?.kind'],
  }];
  spire.spec.syncPolicy.syncOptions.push('RespectIgnoreDifferences=true');
  const litellm = {
    apiVersion: 'argoproj.io/v1alpha1', kind: 'Application',
    metadata: { name: 'litellm', namespace: 'argocd' },
    spec: {
      project: 'infra',
      source: { repoURL: repository, targetRevision: 'main', path: 'gitops/platform/litellm', directory: { recurse: false } },
      destination: { server, namespace: 'kubeclaw' },
      syncPolicy: { syncOptions: ['FailOnSharedResource=true'] },
    },
  };
  return [identity, storage, ...applications, litellm];
}
