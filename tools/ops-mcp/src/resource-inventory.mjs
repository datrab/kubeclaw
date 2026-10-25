export const INVENTORY_PATHS = Object.freeze({
  pods: '/api/v1/namespaces/{namespace}/pods',
  persistentvolumeclaims: '/api/v1/namespaces/{namespace}/persistentvolumeclaims',
  persistentvolumes: '/api/v1/persistentvolumes',
  storageclasses: '/apis/storage.k8s.io/v1/storageclasses',
  endpointslices: '/apis/discovery.k8s.io/v1/namespaces/{namespace}/endpointslices',
});

export function resourceSummary(resource, item) {
  const meta = { name: item.metadata?.name, namespace: item.metadata?.namespace };
  const spec = item.spec ?? {}, status = item.status ?? {};
  if (resource === 'pods') return { ...meta, node: spec.nodeName, phase: status.phase,
    overhead: spec.overhead, resources: spec.resources,
    containers: (spec.containers ?? []).map(c => ({ name: c.name, resources: c.resources ?? {} })),
    initContainers: (spec.initContainers ?? []).map(c => ({ name: c.name, restartPolicy: c.restartPolicy, resources: c.resources ?? {} })),
  };
  if (resource === 'persistentvolumeclaims') return { ...meta, storageClassName: spec.storageClassName,
    volumeName: spec.volumeName, requests: spec.resources?.requests, capacity: status.capacity,
    accessModes: status.accessModes, phase: status.phase, conditions: status.conditions };
  // Deliberately omit volume sources/CSI attributes and provisioner parameters:
  // these can contain credentials or private storage configuration.
  if (resource === 'persistentvolumes') return { ...meta, capacity: spec.capacity, storageClassName: spec.storageClassName,
    accessModes: spec.accessModes, claimRef: spec.claimRef && { name: spec.claimRef.name, namespace: spec.claimRef.namespace }, phase: status.phase };
  if (resource === 'storageclasses') return { ...meta, provisioner: item.provisioner, volumeBindingMode: item.volumeBindingMode,
    allowVolumeExpansion: item.allowVolumeExpansion, reclaimPolicy: item.reclaimPolicy };
  if (resource === 'endpointslices') return { ...meta, addressType: item.addressType, ports: item.ports,
    endpoints: (item.endpoints ?? []).map(e => ({ addresses: e.addresses, conditions: e.conditions, nodeName: e.nodeName })) };
  throw new Error('OPS_RESOURCE_FORBIDDEN');
}
