import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import { KubernetesFixtureCapabilityInvoker } from '../../../skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts';
import { runnerExecutionPolicy } from './execution-policy.mts';

export const imageDigest = `sha256:${'a'.repeat(64)}`;
export const image = `registry.local/app@${imageDigest}`;
export const mediaType = 'application/vnd.kubeclaw.checked-kubernetes-yaml';
export const manifest = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  template:
    spec:
      securityContext:
        runAsNonRoot: true
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: app
          image: ${image}
          securityContext:
            runAsNonRoot: true
            allowPrivilegeEscalation: false
            capabilities:
              drop: [ALL]
---
apiVersion: v1
kind: Service
metadata:
  name: app
spec:
  ports:
    - port: 8080
      targetPort: 8080
`;
export const manifestDigest = `sha256:${crypto.createHash('sha256').update(manifest).digest('hex')}`;
export function request(root, retentionMode) {
  const manifestPath = path.join(root, 'checked.yaml');
  fs.writeFileSync(manifestPath, manifest, { flag: 'wx' });
  return { operation: 'prepare', resource: { type: 'kubernetes.fixture', canonicalId: 'kubernetes-fixture:attempt:one' },
    payload: { leaseName: 'test-one', namespaceName: 'test-one', namespacePrefix: 'test', project: 'proof',
      immutableImage: image, imageDigest, manifestPath, manifestDigest, serviceName: 'app', servicePort: 8080,
      retentionSeconds: 300, retentionMode, readinessTimeoutMs: 1000, secretReferences: [] } };
}
export function localApi({ primary, deleteError, originalController } = {}) {
  const calls = [];
  let namespace = 'test-one';
  return { calls, async execute(_command, args, options) {
    calls.push({ args: [...args], signal: options.signal });
    if (args[0] === 'auth') return { stdout: 'yes' };
    if (args[0] === 'delete') {
      if (deleteError) throw deleteError;
      return { stdout: '' };
    }
    if (args[0] === 'apply') {
      if (typeof options.input === 'string' && options.input.includes('BusterNamespaceLease')) {
        namespace = JSON.parse(options.input).spec.namespaceName;
      }
      return { stdout: '' };
    }
    if (args[0] === 'get' && args[1] === 'busternamespacelease') {
      if (primary) { originalController?.abort(primary); throw primary; }
      return { stdout: JSON.stringify({ status: { phase: 'Ready', namespaceName: namespace,
        createdAt: '2026-09-21T00:00:00.000Z', expiresAt: '2026-09-21T00:05:00.000Z' } }) };
    }
    if (args[1] === 'pods') return { stdout: JSON.stringify({ items: [{ metadata: { name: 'app' },
      status: { conditions: [{ type: 'Ready', status: 'True' }] } }] }) };
    if (args[1] === 'service') return { stdout: JSON.stringify({ spec: { ports: [{ port: 8080, targetPort: 8080 }] } }) };
    if (args[1] === 'endpoints') return { stdout: JSON.stringify({ subsets: [{ ports: [{ port: 8080 }], addresses: [{ ip: '127.0.0.1' }] }] }) };
    throw new Error(`UNEXPECTED_FIXTURE_COMMAND:${args.join(' ')}`);
  } };
}
export function invoker(root, api) {
  return new KubernetesFixtureCapabilityInvoker({ workspaceRoot: root, kubectlExecutable: process.execPath,
    processInputPolicy: runnerExecutionPolicy.processInput, controllerNamespace: 'kubeclaw',
    leaseApiGroup: 'kubeclaw.forgestack.ai', leaseApiVersion: 'v1alpha1', allowedNamespacePrefixes: ['test'],
    allowedRegistryPrefixes: ['registry.local/app'], allowedSecretReferences: [], allowedStorageClasses: [],
    allowDefaultStorageClass: false, maximumManifestBytes: 1048576, maximumResources: 64,
    maximumPersistentVolumeClaimBytes: 1, maximumPersistentVolumeTotalBytes: 1,
    maximumRetentionSeconds: 3600, maximumExecutionMs: 10000, pollIntervalMs: 50,
    execute: api.execute.bind(api) });
}
