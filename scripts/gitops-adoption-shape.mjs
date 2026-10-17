// Explicit deletions are required when adopting objects without a matching
// kubectl last-applied record: an omitted probe handler can otherwise survive.
export function prepareAdoptionShape(documents) {
  const walk = value => {
    if (!value || typeof value !== 'object') return;
    for (const field of ['containers', 'initContainers']) for (const container of value[field] ?? []) {
      for (const name of ['startupProbe', 'readinessProbe', 'livenessProbe']) {
        const probe = container[name];
        if (!probe) continue;
        const handlers = ['exec', 'httpGet', 'tcpSocket', 'grpc'];
        if (handlers.filter(key => probe[key] != null).length !== 1) throw new Error('GITOPS_PROBE_HANDLER_INVALID');
        for (const key of handlers) if (probe[key] === undefined) probe[key] = null;
      }
    }
    for (const child of Object.values(value)) walk(child);
  };
  for (const document of documents) {
    walk(document);
    if (document.kind !== 'StatefulSet') continue;
    // Template metadata is immutable and generated claims are not independently
    // tracked by Argo. Do not introduce Argo lifecycle annotations there.
    for (const claim of document.spec.volumeClaimTemplates ?? []) {
      const annotations = claim.metadata?.annotations;
      if (annotations?.['argocd.argoproj.io/sync-options'] !== 'Prune=false,Delete=false') continue;
      delete annotations['argocd.argoproj.io/sync-options'];
      if (!Object.keys(annotations).length) delete claim.metadata.annotations;
    }
    const annotations = document.metadata.annotations ??= {};
    const options = (annotations['argocd.argoproj.io/sync-options'] ?? '').split(',')
      .filter(option => option && !/^(Prune|Delete)=/.test(option));
    annotations['argocd.argoproj.io/sync-options'] = [...options, 'Prune=false', 'Delete=false'].join(',');
    document.spec.persistentVolumeClaimRetentionPolicy = { whenDeleted: 'Retain', whenScaled: 'Retain' };
  }
  return documents;
}
