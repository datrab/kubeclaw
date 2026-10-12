#!/usr/bin/env node
// Parse successful CLI observations only; the shell must first check exit status.
import fs from 'node:fs';

const resources = {
  secret: ['Secret', 'v1'], configmap: ['ConfigMap', 'v1'],
  deployment: ['Deployment', 'apps/v1'], service: ['Service', 'v1'],
  job: ['Job', 'batch/v1'],
  validatingadmissionpolicy: ['ValidatingAdmissionPolicy', 'admissionregistration.k8s.io/v1'],
};
const statuses = ['deployed', 'failed', 'superseded', 'uninstalled', 'uninstalling',
  'pending-install', 'pending-upgrade', 'pending-rollback'];

function revisionNumber(labels, name) {
  const revision = labels.version;
  if (labels.owner !== 'helm' || labels.name !== name || !statuses.includes(labels.status)
    || typeof revision !== 'string' || !/^[1-9][0-9]*$/u.test(revision)
    || !Number.isSafeInteger(Number(revision))) throw new Error('Invalid Helm revision labels');
  return Number(revision);
}

function requireRecordIdentity(item, expectedKind, name, namespace, revision) {
  if (item.kind !== expectedKind || item.apiVersion !== 'v1' || item.metadata.namespace !== namespace
    || item.metadata.name !== `sh.helm.release.v1.${name}.v${revision}`
    || typeof item.data?.release !== 'string' || item.data.release.length === 0
    || (expectedKind === 'Secret' && item.type !== 'helm.sh/release.v1')) throw new Error('Invalid Helm storage record');
}

function storedRevisions(value, kind, name, namespace) {
  const expectedKind = resources[kind]?.[0];
  if (!['Secret', 'ConfigMap'].includes(expectedKind) || value?.apiVersion !== 'v1'
    || !['List', `${expectedKind}List`].includes(value.kind)
    || !Array.isArray(value.items) || ![undefined, ''].includes(value.metadata?.continue)) throw new Error('Invalid Helm storage collection');
  const revisions = new Map();
  for (const item of value.items) {
    const labels = item.metadata.labels;
    const revision = revisionNumber(labels, name);
    requireRecordIdentity(item, expectedKind, name, namespace, revision);
    if (revisions.has(revision)) throw new Error('Duplicate Helm revision');
    revisions.set(revision, labels.status);
  }
  return [...revisions.entries()].sort(([left], [right]) => left - right).map(([revision, status]) => `${revision} ${status}`).join('\n');
}

try {
  const [mode, kind, name, namespace = '', expected] = process.argv.slice(2);
  const value = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (mode === 'helm-storage') {
    process.stdout.write(storedRevisions(value, kind, name, namespace));
  } else if (mode === 'helm-status') {
    if (value?.name !== name || value?.namespace !== namespace || value?.version !== Number(kind)
      || !statuses.includes(value?.info?.status) || value.info.status !== expected) throw new Error('Invalid Helm revision');
    process.stdout.write(value.info.status);
  } else if (mode === 'resource') {
    const [expectedKind, version] = resources[kind] ?? [];
    if (!expectedKind || !value || !Array.isArray(value.items) || value.items.length > 1 || ![undefined, ''].includes(value.metadata?.continue)
      || !((value.kind === 'List' && value.apiVersion === 'v1')
        || (value.kind === `${expectedKind}List` && value.apiVersion === version))
      || value.items.some(item => item?.kind !== expectedKind || item?.apiVersion !== version
        || item?.metadata?.name !== name || (item?.metadata?.namespace ?? '') !== namespace)) {
      throw new Error('Invalid exact resource list');
    }
    process.stdout.write(value.items.length === 0 ? 'absent' : 'present');
  } else {
    throw new Error('Unknown observation mode');
  }
} catch {
  // Do not echo response bodies: Secret JSON can contain credentials.
  process.stderr.write('Invalid deployment observation; refusing to infer resource absence or permission to mutate\n');
  process.exitCode = 1;
}
