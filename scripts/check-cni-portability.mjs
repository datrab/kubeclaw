#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const root = path.resolve(import.meta.dirname, '..');

function render(name, chart, values = [], stringSets = [], typedSets = []) {
  const args = ['template', name, chart];
  for (const value of values) args.push('-f', value);
  for (const setting of stringSets) args.push('--set-string', setting);
  for (const setting of typedSets) args.push('--set', setting);
  return execFileSync('helm', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function documents(source) {
  return source.split(/(?=^---\s*$)/gmu).flatMap((chunk) => {
    const document = YAML.parseDocument(chunk);
    if (document.errors.length > 0 || !document.toJSON()) return [];
    return [document.toJSON()];
  });
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : entry.isFile() ? [target] : [];
  });
}

const renders = [
  ['nova-core', render('agent-nova', 'charts/kubeclaw', ['my-values/nova-values.yaml'], [], [
    'archviewer.enabled=false',
  ])],
  ['buster', render('agent-buster', 'charts/kubeclaw', ['my-values/buster-values.yaml'], [
    'runtimeInfrastructure.registry.endpoint=http://registry-local.kubeclaw.svc.cluster.local:5001',
    'runtimeInfrastructure.registry.transport=http-lab',
  ])],
  ['prism-agent', render('agent-prism', 'charts/kubeclaw', ['my-values/prism-agent-values.yaml'])],
  ['prism', render('prism', 'charts/prism', ['my-values/prism-values.yaml'], [
    'worker.native.namespace=kubeclaw',
    'worker.native.nodeName=cni-portability-node',
    `worker.native.policyDigest=${'a'.repeat(64)}`,
  ])],
];

const forbiddenKinds = new Set(['CiliumNetworkPolicy', 'CiliumClusterwideNetworkPolicy']);
const renderSummary = [];
for (const [profile, source] of renders) {
  const resources = documents(source);
  const ciliumResources = resources.filter((resource) =>
    forbiddenKinds.has(resource.kind) || String(resource.apiVersion ?? '').startsWith('cilium.io/'));
  assert.deepEqual(ciliumResources, [],
    `${profile} core profile renders Cilium-specific resources`);
  renderSummary.push({
    profile,
    resources: resources.length,
    networkPolicies: resources.filter((resource) => resource.kind === 'NetworkPolicy').length,
  });
}

const prismPolicies = renderSummary.find((item) => item.profile === 'prism')?.networkPolicies ?? 0;
assert(prismPolicies > 0, 'Prism renders no portable Kubernetes NetworkPolicy resources');

const maintainedNova = documents(render('agent-nova', 'charts/kubeclaw', ['my-values/nova-values.yaml']));
const maintainedNovaCiliumResources = maintainedNova.filter((resource) =>
  forbiddenKinds.has(resource.kind) || String(resource.apiVersion ?? '').startsWith('cilium.io/'));
assert.deepEqual(maintainedNovaCiliumResources.map((resource) =>
  `${resource.kind}/${resource.metadata?.name}`).sort(), [
  'CiliumNetworkPolicy/agent-nova-archviewer',
], 'the maintained Nova profile gained an unclassified Cilium dependency');

const runtimeRoots = [
  'skills/nova/core',
  'skills/worker/core',
  'skills/buster/engine',
  'skills/prism/server',
];
const sourceFiles = runtimeRoots.flatMap((directory) => walk(path.join(root, directory)))
  .filter((file) => /\.(?:ts|mts|mjs|js|json)$/u.test(file)
    && !/(?:^|\/)(?:tests?|fixtures)\//u.test(file)
    && !/\.(?:test|spec)\.[^.]+$/u.test(file));
const ciliumBindings = [];
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  if (/cilium\.io|CiliumNetworkPolicy|CiliumClusterwideNetworkPolicy/u.test(source)) {
    ciliumBindings.push(path.relative(root, file).split(path.sep).join('/'));
  }
}
assert.deepEqual(ciliumBindings, [],
  'core runtime source contains a Cilium API binding');

process.stdout.write(`${JSON.stringify({
  ok: true,
  proof: 'render-and-source-portability',
  liveFlannelDeploymentProved: false,
  profiles: renderSummary,
  currentProfileCiliumBoundary: {
    profile: 'nova',
    optionalComponent: 'archviewer',
    resources: maintainedNovaCiliumResources.map((resource) =>
      `${resource.kind}/${resource.metadata?.name}`),
  },
  runtimeSourceFilesChecked: sourceFiles.length,
})}\n`);
