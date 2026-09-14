import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dump } from 'js-yaml';
import { validateApiOrigins } from './kubernetes-api-probe.mjs';

if (process.argv.length !== 4) throw new Error('Usage: render-kubernetes-api-probe.mjs ACTUAL_POD_JSON ORIGINS_JSON');
const pod = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const origins = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
if (pod.kind !== 'Pod' || !pod.metadata.uid || !pod.spec.serviceAccountName || !pod.spec.nodeName) throw new Error('API_PROBE_RUNNING_SOURCE_POD_REQUIRED');
validateApiOrigins(origins);
const image = JSON.parse(fs.readFileSync(new URL('../versions.json', import.meta.url), 'utf8')).buildArgs.NODE_BASE;
if (!/@sha256:[a-f0-9]{64}$/.test(image)) throw new Error('API_PROBE_PINNED_IMAGE_REQUIRED');
const name = 'api-policy-proof-' + randomUUID();
const metadata = { name, namespace: pod.metadata.namespace, annotations: {
  'kubeclaw.io/source-pod-uid': pod.metadata.uid, 'kubeclaw.io/source-pod-name': pod.metadata.name } };
const config = { apiVersion: 'v1', kind: 'ConfigMap', metadata, data: {
  'probe.mjs': fs.readFileSync(new URL('./kubernetes-api-probe.mjs', import.meta.url), 'utf8'),
  'options.json': JSON.stringify({ namespace: pod.metadata.namespace, serviceAccount: pod.spec.serviceAccountName, origins,
    tokenFile: '/var/run/secrets/kubernetes.io/serviceaccount/token', caFile: '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt' }),
} };
const job = { apiVersion: 'batch/v1', kind: 'Job', metadata, spec: {
  backoffLimit: 0, activeDeadlineSeconds: 600, template: {
    metadata: { labels: { ...pod.metadata.labels, 'kubeclaw.io/api-policy-proof': name } },
    spec: { restartPolicy: 'Never', serviceAccountName: pod.spec.serviceAccountName, automountServiceAccountToken: true,
      affinity: { nodeAffinity: { requiredDuringSchedulingIgnoredDuringExecution: { nodeSelectorTerms: [
        { matchFields: [{ key: 'metadata.name', operator: 'In', values: [pod.spec.nodeName] }] },
      ] } } },
      containers: [{ name: 'probe', image, command: ['node', '/probe/probe.mjs', '/probe/options.json'],
        // Same policy labels, but never a ready Service backend.
        readinessProbe: { exec: { command: ['node', '-e', 'process.exit(1)'] }, periodSeconds: 1 },
        resources: { requests: { cpu: '25m', memory: '64Mi' }, limits: { cpu: '500m', memory: '256Mi' } },
        securityContext: { runAsUser: 1000, runAsGroup: 1000, runAsNonRoot: true, readOnlyRootFilesystem: true,
          allowPrivilegeEscalation: false, capabilities: { drop: ['ALL'] }, seccompProfile: { type: 'RuntimeDefault' } },
        volumeMounts: [{ name: 'probe', mountPath: '/probe', readOnly: true }],
      }], volumes: [{ name: 'probe', configMap: { name } }],
    },
  },
} };
process.stdout.write([config, job].map(value => dump(value, { noRefs: true, lineWidth: -1 })).join('---\n'));
