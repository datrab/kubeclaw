import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadAll } from 'js-yaml';
import { loadNativeNodePolicy, nativePoolPolicy } from './native-worker-node-policy.mjs';
import { preflightNativeWorkerNode } from './native-worker-node-preflight.mjs';

/** Validate the actual rendered producer/worker selection before any host or API checks. */
export function nativePrismDeploymentSelection(documents, namespace, policy) {
  const workload = name => documents.find(document => document?.kind === 'Deployment' && document.metadata.name === `prism-${name}`);
  const worker = workload('worker'); const control = workload('control');
  if (!worker || !control) throw new Error('NATIVE_DEPLOYMENT_WORKLOADS_REQUIRED');
  const container = (workload, name) => workload?.spec.template.spec.containers.find(container => container.name === name);
  const supervisor = container(worker, 'worker');
  if (JSON.stringify(supervisor?.command) !== JSON.stringify(['node', 'skills/prism/server/worker.ts'])
    || worker.spec.template.metadata.annotations?.['kubeclaw.dev/native-worker-role'] !== 'prism') {
    throw new Error('NATIVE_DEPLOYMENT_PROTOCOL_MISMATCH');
  }
  const digest = value => value?.env?.find(item => item.name === 'PRISM_ENGINE_CONTENT_DIGEST')?.value;
  if (!/^sha256:[a-f0-9]{64}$/.test(digest(supervisor) ?? '')
    || digest(supervisor) !== digest(container(control, 'control'))
    || digest(supervisor) !== supervisor.image.split('@')[1]) throw new Error('NATIVE_DEPLOYMENT_IMAGE_MISMATCH');
  const pool = nativePoolPolicy(policy, 'prism');
  if (namespace !== policy.pools.prism.namespace || worker.spec.replicas !== 1
    || worker.spec.template.metadata.annotations?.['kubeclaw.dev/native-worker-policy'] !== pool.policyDigest) {
    throw new Error('NATIVE_DEPLOYMENT_POLICY_MISMATCH');
  }
  const terms = worker.spec.template.spec.affinity?.nodeAffinity?.requiredDuringSchedulingIgnoredDuringExecution?.nodeSelectorTerms;
  const expected = [{ matchFields: [{ key: 'metadata.name', operator: 'In', values: [policy.nodeName] }] }];
  if (JSON.stringify(terms) !== JSON.stringify(expected)) throw new Error('NATIVE_DEPLOYMENT_NODE_MISMATCH');
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [policyFile, namespace, ...helmArguments] = process.argv.slice(2);
  if (!policyFile || !namespace || helmArguments[0] !== 'template') throw new Error('Usage: native-worker-deployment-preflight.mjs POLICY_YAML NAMESPACE template HELM_ARGUMENTS');
  const documents = loadAll(execFileSync('helm', helmArguments, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
  const policy = loadNativeNodePolicy(policyFile);
  nativePrismDeploymentSelection(documents, namespace, policy);
  preflightNativeWorkerNode(policy);
}
