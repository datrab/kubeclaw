#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitOpsName } from './gitops-bundle.mjs';

export function claimedNamespaces(application) {
  const annotation = application.metadata?.annotations?.['kubeclaw.dev/runtime-namespaces'];
  const declared = annotation === undefined ? [] : JSON.parse(annotation);
  if (!Array.isArray(declared) || !declared.every(gitOpsName)) throw new Error('GITOPS_OWNERSHIP_ANNOTATION_INVALID');
  return [...declared, application.spec?.destination?.namespace];
}

/** Runtime namespaces have one deployment controller. Bootstrap infrastructure is separate. */
export function assertNoGitOpsOwner(namespace, _release, run = args => execFileSync('kubectl', args, { encoding: 'utf8', timeout: 30000 })) {
  if (!gitOpsName(namespace)) throw new Error('GITOPS_OWNERSHIP_ARGUMENT_INVALID');
  const crd = run(['get', 'crd', 'applications.argoproj.io', '--ignore-not-found', '-o', 'json']);
  const applications = crd.trim()
    ? JSON.parse(run(['get', 'applications.argoproj.io', '--all-namespaces', '-o', 'json'])) : { items: [] };
  if (!Array.isArray(applications.items)) throw new Error('GITOPS_OWNERSHIP_RESPONSE_INVALID');
  const owner = applications.items.find(application => claimedNamespaces(application).includes(namespace));
  if (owner) throw new Error(`GITOPS_OWNER_PRESENT:${namespace}/${owner.metadata?.name}; update its reviewed Git revision instead`);
  // Deleting an Application without cascading its workloads does not transfer ownership.
  const workloads = JSON.parse(run(['get', 'deployments,statefulsets,cronjobs', '-n', namespace, '-o', 'json']));
  if (!Array.isArray(workloads.items)) throw new Error('GITOPS_OWNERSHIP_RESPONSE_INVALID');
  if (workloads.items.some(workload => workload.metadata?.annotations?.['argocd.argoproj.io/tracking-id']
    || workload.metadata?.labels?.['kubeclaw.dev/gitops-owner'])) throw new Error(`GITOPS_RETAINED_RESOURCE_OWNER:${namespace}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { assertNoGitOpsOwner(...process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
