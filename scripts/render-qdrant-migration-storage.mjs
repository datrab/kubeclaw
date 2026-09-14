import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAll, dump } from 'js-yaml';
import { prepareInfrastructureRelease, renderInfrastructureChart } from './infrastructure-release.mjs';

/** Prepare fresh destination claims and an isolated transfer Pod; never apply them. */
export function renderQdrantMigrationStorage(namespace, release, values, helm = 'helm') {
  const archive = prepareInfrastructureRelease('qdrant', release, namespace, values, helm);
  const documents = loadAll(renderInfrastructureChart('qdrant', release, namespace, archive, values, helm, true));
  const workloads = documents.filter(value => value?.kind === 'StatefulSet');
  if (workloads.length !== 1 || workloads[0].spec.replicas !== 1) throw new Error('QDRANT_SINGLE_NODE_REQUIRED');
  const workload = workloads[0];
  const container = workload.spec.template.spec.containers.find(value => value.name === 'qdrant');
  const templates = workload.spec.volumeClaimTemplates;
  if (templates?.length !== 2) throw new Error('QDRANT_FRESH_STORAGE_AND_SNAPSHOT_CLAIMS_REQUIRED');
  const claims = templates.map(template => ({ apiVersion: 'v1', kind: 'PersistentVolumeClaim',
    metadata: { name: `${template.metadata.name}-${workload.metadata.name}-0`, namespace,
      labels: { 'app.kubernetes.io/instance': release } }, spec: template.spec }));
  const mounts = templates.map(template => {
    const mount = container.volumeMounts.find(value => value.name === template.metadata.name);
    if (!['/qdrant/storage', '/qdrant/snapshots'].includes(mount?.mountPath)) throw new Error('QDRANT_STORAGE_MOUNT_INVALID');
    return { name: template.metadata.name, mountPath: mount.mountPath };
  });
  const name = `${workload.metadata.name}-transfer`;
  if (name.length > 63) throw new Error('QDRANT_TRANSFER_NAME_TOO_LONG');
  const labels = { 'kubeclaw.dev/qdrant-transfer': name };
  const pod = { apiVersion: 'v1', kind: 'Pod', metadata: { name, namespace, labels }, spec: {
    restartPolicy: 'Never', activeDeadlineSeconds: 3600, automountServiceAccountToken: false,
    securityContext: { runAsUser: 1000, runAsGroup: 3000, runAsNonRoot: true, fsGroup: 3000 },
    containers: [{ name: 'transfer', image: container.image, command: ['/bin/bash', '-c', 'exec sleep 3600'],
      securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } },
      resources: { requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: '1', memory: '512Mi' } }, volumeMounts: mounts }],
    volumes: templates.map((template, index) => ({ name: template.metadata.name, persistentVolumeClaim: { claimName: claims[index].metadata.name } })),
  } };
  const policy = { apiVersion: 'networking.k8s.io/v1', kind: 'NetworkPolicy', metadata: { name, namespace },
    spec: { podSelector: { matchLabels: labels }, policyTypes: ['Ingress', 'Egress'], ingress: [], egress: [] } };
  return [policy, ...claims, pod];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 5) throw new Error('Usage: render-qdrant-migration-storage.mjs NAMESPACE NEW_RELEASE VALUES');
  process.stdout.write(renderQdrantMigrationStorage(...process.argv.slice(2)).map(value => dump(value, { noRefs: true, lineWidth: -1 })).join('---\n'));
}
