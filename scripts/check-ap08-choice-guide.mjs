#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const pagePath = path.join(root, 'docs/site/extend/README.md');
const inventoryPath = path.join(root, 'docs/blueprint/generated/ap08-extension-inventory.json');
const page = fs.readFileSync(pagePath, 'utf8');
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
const errors = [];

function requireText(value, label) {
  if (!page.includes(value)) errors.push(`choice guide lacks ${label}: ${value}`);
}

for (const heading of [
  '## First Identify The Behavior Owner',
  '## Decision Flow',
  '## Quick Choice Table',
  '## Choose Configuration First',
  '## Choose A Pipeline Registration',
  '### Stage',
  '### Observer',
  '### Capability Adapter',
  '### Test Provider',
  '### Report Adapter',
  '## Understand Discovery, Binding, And Activation',
  '## Choose A Host Extension',
  '## Choose A Worker Engine Or Runtime Role',
  '## Choose A Core Or Foundation Change',
  '## Unsupported Shortcuts',
  '## Apply The Decision To Common Requests',
  '## Verify Your Choice Before You Implement',
  '## Current Verification Boundary',
]) requireText(heading, 'required section');

for (const statement of [
  'Project input cannot add an installation root or grant Foundation plugin authority.',
  'They do not modify `pipeline-platform.v2.grants`, install a package, or authorize a pipeline registration.',
  'Capability-provider selection is not test-provider selection.',
  'Project input does not independently load a report adapter.',
  'Current activation rejects an external long-lived capability adapter.',
  'The current repository has no drop-in worker-engine manifest or generic engine loader.',
  'Plugins cannot receive `lifecycle.write`, `scheduler.advance`, `canonical_events.modify`, or `registry.mutate`.',
  'Repository presence also does not prove host installation.',
  'Test providers and report adapters do not use `activateRegistry()`.',
  '| Full package-boundary check | Failed |',
]) requireText(statement, 'required boundary statement');

for (const staleClaim of [
  'Each registration keeps its own identity, configuration, and capability request.',
  'Project input cannot add an installation root or grant authority.',
  'supply stage, provider, and report inputs',
  'select capability providers;',
  '| Activation | The runtime checks package integrity and loads selected executable exports |',
]) {
  if (page.includes(staleClaim)) errors.push(`choice guide retains an overbroad claim: ${staleClaim}`);
}

const pipelinePackages = inventory.summary.hosts['pipeline-runtime'];
const pipelineRegistrations = ['stage', 'observer', 'adapter', 'test-provider', 'report-adapter']
  .reduce((sum, kind) => sum + inventory.summary.registrations[kind], 0);
requireText(
  `The repository currently contains ${pipelinePackages} pipeline packages and ${pipelineRegistrations} registrations.`,
  'generated inventory count',
);

const revision = page.match(/^Evidence revision: `([0-9a-f]{40})`$/mu)?.[1];
if (!revision) errors.push('choice guide lacks one full Evidence revision');
const sourcePattern = /https:\/\/github\.com\/datrab\/kubeclaw\/blob\/([0-9a-f]{40})\/([^#)]+)#L([0-9]+)-L([0-9]+)/gu;
const sourceLinks = [...page.matchAll(sourcePattern)];
if (sourceLinks.length < 23) errors.push(`choice guide has only ${sourceLinks.length} pinned source links; expected at least 23`);
const pinnedByPath = new Map();
for (const match of sourceLinks) {
  const [, linkRevision, repositoryPath, firstValue, lastValue] = match;
  if (revision && linkRevision !== revision) {
    errors.push(`source link revision differs from page evidence revision: ${repositoryPath}`);
  }
  const source = path.join(root, repositoryPath);
  if (!fs.existsSync(source)) {
    errors.push(`source link points to a missing repository path: ${repositoryPath}`);
    continue;
  }
  const first = Number(firstValue);
  const last = Number(lastValue);
  let pinned;
  try {
    pinned = execFileSync('git', ['-C', root, 'show', `${linkRevision}:${repositoryPath}`], {
      encoding: 'utf8',
    });
  } catch {
    errors.push(`source link does not resolve at its pinned revision: ${repositoryPath}`);
    continue;
  }
  pinnedByPath.set(repositoryPath, pinned);
  const lines = pinned.split('\n').length;
  if (first < 1 || last < first || last > lines) {
    errors.push(`source link has an invalid line range: ${repositoryPath}#L${first}-L${last}`);
  }
}

for (const [repositoryPath, fragments] of [
  ['skills/nova/core/execution/engine-runtime.ts', ['providers: new Map', 'platform.activeAdapters', 'Object.keys(platform.observers)']],
  ['skills/common/plugin-runtime/foundation/registry/capabilities.ts', ['policy.providers', 'snapshot.adapters.get', 'REGISTRY_CAPABILITY_PROVIDER_INVALID']],
  ['skills/nova/project/compiler.ts', ['maxRemediationCycles: maximumOrders', 'providerPlan', 'PROJECT_PLAN_DIGEST_MISMATCH']],
  ['skills/common/plugin-runtime/foundation/registry/activation.ts', ['snapshot.stages', 'snapshot.observers', 'snapshot.adapters']],
  ['skills/nova/core/test-gates/resolver.ts', ['input.policy.reportAdapters', 'testProviderContracts.get', 'reportAdapters: resolvedReportAdapters']],
  ['skills/buster/engine/test-gates/provider-loader.ts', ['TEST_PROVIDER_PACKAGE_DIGEST_MISMATCH', 'test-provider-snapshots', 'TEST_PROVIDER_PACKAGE_SNAPSHOT_MISMATCH']],
  ['skills/buster/engine/test-gates/report-adapter-runtime.ts', ['REPORT_ARTIFACT_DIGEST_MISMATCH', 'REPORT_ADAPTER_PACKAGE_DIGEST_MISMATCH', 'REPORT_ADAPTER_MODULE_FORBIDDEN']],
]) {
  const pinned = pinnedByPath.get(repositoryPath);
  if (!pinned) {
    errors.push(`choice guide lacks required execution-path evidence: ${repositoryPath}`);
    continue;
  }
  for (const fragment of fragments) {
    if (!pinned.includes(fragment)) errors.push(`pinned execution-path evidence changed: ${repositoryPath} lacks ${fragment}`);
  }
}

const scenarioRows = [
  'Increase an installed stage timeout',
  'Add another existing Buster suite to a gate',
  'Run a new kind of source check in the graph',
  'Send committed failure events to a new sink',
  'Introduce a new external authority type',
  'Execute a new browser test contract',
  'Parse a new XML report dialect',
  'Add an OpenClaw design tool',
  'Change the Redis endpoint of the installed OpenClaw observer',
  'Add Codex troubleshooting instructions',
  'Add a new specialist worker family',
  'Add a new terminal pipeline state',
];
for (const scenario of scenarioRows) requireText(`| ${scenario} |`, 'representative decision scenario');

if (errors.length > 0) {
  console.error('AP08 choice-guide check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`AP08 choice-guide check passed (${sourceLinks.length} pinned source links, ${scenarioRows.length} decision scenarios)`);
