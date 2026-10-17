#!/usr/bin/env node
// Installer-Step: runtime.register-argo
// Register reviewed Applications only; workload adoption is a separate sync.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import yaml from 'js-yaml';
import {renderContinuousEnvironment} from '../gitops-continuous.mjs';

const root = path.resolve(import.meta.dirname, '../..');
try {
  const mode = process.argv[2];
  if (!['check', 'apply'].includes(mode)) throw new Error('Usage: node scripts/install/register-runtime-argo.mjs check|apply');
  const context = process.env.KUBE_CONTEXT;
  if (!context) throw new Error('KUBE_CONTEXT_REQUIRED');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'gitops/production/config.json'), 'utf8'));
  if (config.runtimeAutoSync !== false) throw new Error('INITIAL_REGISTRATION_REQUIRES_MANUAL_CHILD_SYNC');
  const {directory} = JSON.parse(fs.readFileSync(path.join(root, 'gitops/production/selection.json'), 'utf8'));
  const revision = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  const repository = 'https://github.com/datrab/kubeclaw.git';
  const {files} = renderContinuousEnvironment(root, directory, repository, revision, config);
  for (const [name, bytes] of Object.entries(files)) {
    const relative = `gitops/production/${name}`;
    const committed = execFileSync('git', ['-C', root, 'show', `${revision}:${relative}`], {encoding: 'utf8'});
    if (committed !== bytes || fs.readFileSync(path.join(root, relative), 'utf8') !== bytes) throw new Error(`GITOPS_ENVIRONMENT_DRIFT:${name}`);
  }
  const documents = yaml.loadAll(files['apps/applications.yaml']).filter(Boolean)
    .concat(yaml.loadAll(files['bootstrap.yaml']).filter(Boolean));
  const kubectl = (args, input) => execFileSync('kubectl', ['--context', context, ...args],
    {encoding: 'utf8', input, timeout: 60000, maxBuffer: 8 * 1024 * 1024});
  for (const document of documents) {
    if (!['Application', 'AppProject'].includes(document.kind) || document.metadata.namespace !== config.argoNamespace) throw new Error('REGISTRATION_SCOPE_INVALID');
    if (document.kind === 'Application' && document.metadata.name !== config.naming.rootName && document.spec.syncPolicy?.automated) throw new Error('REGISTRATION_CHILD_AUTOSYNC_DENIED');
    const current = kubectl(['get', `${document.kind}.argoproj.io`, document.metadata.name, '-n', config.argoNamespace, '--ignore-not-found', '-o', 'json']);
    if (!current.trim()) continue;
    const live = JSON.parse(current);
    const labels = live.metadata.labels ?? {};
    const expectedLabels = document.metadata.labels ?? {};
    for (const key of ['kubeclaw.dev/gitops-root', 'kubeclaw.dev/gitops-project']) {
      if (expectedLabels[key] && labels[key] !== expectedLabels[key]) throw new Error(`REGISTRATION_OWNER_CONFLICT:${document.metadata.name}`);
    }
    if (document.kind === 'Application' && (live.spec.project !== document.spec.project || live.spec.source?.repoURL !== repository || live.spec.destination?.namespace !== document.spec.destination.namespace)) throw new Error(`REGISTRATION_APPLICATION_CONFLICT:${document.metadata.name}`);
    if (document.kind === 'Application' && document.metadata.name !== config.naming.rootName && (live.spec.syncPolicy?.automated || live.operation)) throw new Error(`REGISTRATION_ALREADY_ACTIVE:${document.metadata.name}`);
  }
  const input = documents.map(d => yaml.dump(d, {noRefs: true})).join('---\n');
  process.stdout.write(kubectl(['apply', '--dry-run=server', '-f', '-'], input));
  if (mode === 'apply') process.stdout.write(kubectl(['apply', '-f', '-'], input));
  console.log(mode === 'apply'
    ? 'Runtime Applications registered with manual child sync. Review Argo diffs before first workload sync. No workload manifests applied.'
    : 'Registration API dry-run passed. No resources changed. This does not verify workload adoption or health.');
} catch (error) {
  // Avoid echoing a failed command's complete manifest or environment.
  console.error(error.status !== undefined ? `REGISTRATION_COMMAND_FAILED:${error.status}` : error.message);
  process.exitCode = 1;
}
