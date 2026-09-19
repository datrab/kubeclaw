#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const revision = '4f089958db97a551f406c157d774bda143a38946';

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:js|mjs|ts)$/u.test(entry.name) ? [target] : [];
  });
}

const specifications = [
  {
    file: 'docs/site/understand/nova-core.md',
    minimumLinks: 60,
    required: [
      '## The Core Model', '## Authority and Invariants',
      '## 1. Project Admission and Compilation',
      '## 2. Graph Construction, Validation, and Freeze',
      '## 3. Registry Admission and Snapshot Handoff',
      '## 4. Durable State and the Run Root',
      '## 5. Scheduling, Readiness, and Concurrency',
      '## 6. Stage Dispatch and Attempt Authority',
      '## 7. Lifecycle State and Result Mapping',
      '## 8. Technical Retry and Product Repair',
      '## 9. Wait, Signal, and Resume',
      '## 10. Effects, Locks, Fencing, and Receipts',
      '## 11. Artifact Checkpoints and Visibility',
      '## 12. Cancellation and Shutdown',
      '## 13. Restart and Recovery',
      '## 14. Administrative Reopen',
      '## 15. Nova-to-Buster Test Dispatch',
      '## 16. Audit and Observer Delivery',
      '## 17. Failure Families and Operator Response',
      '## 18. Design Decisions and Their Costs',
      '**Decision:**', '**Reason:**', '**Alternative:**',
      '**Why it was not selected:**', '**Cost:**',
    ],
  },
  {
    file: 'docs/site/understand/plugin-runtime.md',
    minimumLinks: 35,
    required: [
      '## Four Identities That Must Not Be Confused',
      '## Runtime Roles And Their Authority',
      '## Discovery Reads Data, Not Executable Code',
      '## Manifest, Schema, And Path Admission',
      '## Integrity And Provenance', '## External Package Installation',
      '## Registry Construction And Global Ownership',
      '## Compatibility Is Explicit And Conservative',
      '## Selection Is Separate From Installation',
      '## Capabilities And Grants',
      '## Configuration Ownership And Precedence',
      '## Import Audit Is An Admission Check, Not The Runtime Sandbox',
      '## Activation Is Fail-Closed', '## Invocation Leases',
      '## Isolation For External Stages And Observers',
      '## Plugin State Ownership', '## Effects And Durable Authority',
      '## Replacement, Disablement, And Removal',
      '## Failure And Recovery Map', '**Rejected alternative:**',
      'defines 28 plugin-facing capabilities', 'external adapter',
    ],
  },
  {
    file: 'docs/site/understand/worker-core.md',
    minimumLinks: 45,
    required: [
      '## The Two Execution Layers', '## Attempt Flow',
      '## Contract And Version Model', '## Profiles And Engine Identity',
      '## Envelope And Attempt Identity', '### Wire Message Field Reference',
      '## Admission Before Execution', '## Specialist Execution Contract',
      '## Progress, Logs, And Evidence',
      '## Resource Policy And Accounting',
      '## Native Launch And Trust Boundary', '## Native Control Channel',
      '## Deadlines, Cancellation, And Termination',
      '## Durable Ownership', '## Attempt Journal And Commit Boundaries',
      '## Restart And Reconciliation', '## Result, Digest, And Receipt',
      '## Error Reference And Retry Decisions', '### Safe Retry Table',
      '## Extension Contract For A New Engine', '## Current Limits',
      'supervisor lock', 'compare-and-swap', 'cgroup v2',
    ],
  },
];

let sourceLinks = 0;
for (const specification of specifications) {
  const source = fs.readFileSync(path.join(root, specification.file), 'utf8');
  assert(source.includes(`Evidence revision: \`${revision}\``),
    `${specification.file} lacks the inspected evidence revision`);
  for (const required of specification.required) {
    assert(source.includes(required), `${specification.file} lacks required content: ${required}`);
  }

  const codeBlocks = [...source.matchAll(/^```([^\n]*)$/gmu)]
    .map((match) => match[1].trim().toLowerCase())
    .filter(Boolean);
  assert(codeBlocks.every((language) => language === 'mermaid'),
    `${specification.file} copies maintained code instead of linking to its source`);

  const links = [...source.matchAll(/https:\/\/github\.com\/datrab\/kubeclaw\/blob\/([0-9a-f]{40})\/([^#)]+)(?:#L([0-9]+)(?:-L([0-9]+))?)?/gu)];
  assert(links.length >= specification.minimumLinks,
    `${specification.file} has only ${links.length} pinned source links`);
  sourceLinks += links.length;

  for (const match of links) {
    const [, linkRevision, repositoryPath, firstValue, lastValue] = match;
    assert.equal(linkRevision, revision,
      `${specification.file} uses another revision for ${repositoryPath}`);
    const pinned = execFileSync('git', ['-C', root, 'show', `${linkRevision}:${repositoryPath}`],
      { encoding: 'utf8' });
    if (!firstValue) continue;
    const lineCount = pinned.split('\n').length;
    const first = Number(firstValue);
    const last = Number(lastValue ?? firstValue);
    assert(first >= 1 && last >= first && last <= lineCount,
      `${specification.file} has an invalid range for ${repositoryPath}`);
  }
}

const entry = fs.readFileSync(path.join(root, 'docs/site/understand/README.md'), 'utf8');
for (const target of ['nova-core.md', 'plugin-runtime.md', 'worker-core.md']) {
  assert(entry.includes(`](${target})`), `architecture entry does not link to ${target}`);
}

const surfaces = fs.readFileSync(path.join(root, 'docs/site/product-surfaces.md'), 'utf8');
for (const id of ['SUR-CTL-02', 'SUR-CTL-03', 'SUR-CTL-04', 'SUR-CTL-05',
  'SUR-COM-02', 'SUR-COM-03', 'SUR-DAT-01', 'SUR-DAT-02']) {
  const row = surfaces.split('\n').find((line) => line.startsWith(`| ${id} |`));
  assert(row?.endsWith('| Detailed |'), `${id} does not declare detailed coverage`);
}

const capabilityVocabulary = await import(pathToFileURL(path.join(root,
  'skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts')).href);
assert.equal(capabilityVocabulary.CAPABILITY_IDS.length, 28,
  'plugin-facing capability count changed; update the runtime guide');
for (const capability of capabilityVocabulary.CAPABILITY_IDS) {
  assert(fs.readFileSync(path.join(root, 'docs/site/understand/plugin-runtime.md'), 'utf8').includes(`\`${capability}\``),
    `plugin runtime guide does not name capability ${capability}`);
}

const novaGuide = fs.readFileSync(path.join(root, 'docs/site/understand/nova-core.md'), 'utf8');
const novaSource = [path.join(root, 'skills/nova/core'), path.join(root, 'skills/nova/project')]
  .flatMap(sourceFiles)
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');
const novaCodes = new Set([...novaSource.matchAll(
  /(?:['"`])([A-Z][A-Z0-9]+(?:_[A-Z0-9]+){1,})(?=[:'"`$])/gu,
)].map((match) => match[1]));
const novaFamilies = [
  'PROJECT_', 'GRAPH_', 'PIPELINE_RUN_', 'RUN_', 'PIPELINE_STAGE_', 'STAGE_',
  'PLUGIN_', 'CAPABILITY_', 'ADAPTER_', 'EFFECT_', 'RESOURCE_LOCK_',
  'ARTIFACT_', 'JOURNAL_', 'FILE_MUTEX_', 'WAIT_', 'RECOVERY_', 'REPAIR_',
  'ADMIN_', 'NOVA_SOURCE_', 'NOVA_REMOTE_', 'NOVA_DISPATCH_',
  'NOVA_OBSERVABILITY_', 'NOVA_FINAL_OBSERVABILITY_', 'NOVA_RECONCILIATION_',
  'NOVA_VERIFIED_OUTPUT_',
  'TEST_PLAN_', 'TEST_REPORT_', 'OBSERVER_', 'REQUIRED_OBSERVER_', 'AUDIT_',
  'DURABLE_RECORD_', 'LEGACY_IMPORT_', 'LEGACY_SCAN_',
];
for (const family of novaFamilies) {
  assert(novaGuide.includes(`\`${family}*\``) || novaGuide.includes(`\`${family.slice(0, -1)}\``),
    `Nova guide does not document error family ${family}`);
}
const uncoveredNovaCodes = [...novaCodes].filter((code) =>
  !novaFamilies.some((family) => code.startsWith(family)) && code !== 'RESOURCE_LOCKED');
assert.deepEqual(uncoveredNovaCodes.sort(), [],
  `Nova source contains undocumented error families: ${uncoveredNovaCodes.join(', ')}`);

const workerGuide = fs.readFileSync(path.join(root, 'docs/site/understand/worker-core.md'), 'utf8');
const workerSource = [path.join(root, 'skills/worker/core'),
  path.join(root, 'contracts/pipeline-worker-core/v1')]
  .flatMap(sourceFiles)
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');
const workerCodes = new Set([...workerSource.matchAll(
  /(?:['"`])(WORKER_[A-Z0-9_]+)(?=[:'"`$])/gu,
)].map((match) => match[1]));
const constructedWorkerCodeStems = new Set([
  'WORKER_ATTEMPT_INPUT', 'WORKER_RESULT', 'WORKER_RESOURCE_MEASUREMENT',
  'WORKER_CLEANUP', 'WORKER_EVIDENCE_COLLECTION', 'WORKER_LOG_STORE',
  'WORKER_RESULT_FINALIZATION', 'WORKER_FINAL_RESOURCE_MEASUREMENT',
]);
const undocumentedWorkerCodes = [...workerCodes].filter((code) =>
  !workerGuide.includes(`\`${code}\``) && !constructedWorkerCodeStems.has(code));
assert.deepEqual(undocumentedWorkerCodes.sort(), [],
  `Worker guide does not name source error codes: ${undocumentedWorkerCodes.join(', ')}`);

console.log(JSON.stringify({ ok: true, pages: specifications.length,
  pinnedSourceLinks: sourceLinks, capabilities: capabilityVocabulary.CAPABILITY_IDS.length,
  novaErrorCodesCoveredByFamily: novaCodes.size,
  workerErrorCodesNamed: [...workerCodes].filter((code) =>
    !constructedWorkerCodeStems.has(code)).length }));
