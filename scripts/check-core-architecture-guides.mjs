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
      'The generic pipeline contract supplies no implicit execution budget.',
      '`repairBudget` must also declare `maxTechnicalRetries`.',
      'One gate deadline covers dispatch, polling, result download, evidence download,',
      'The output contract is `pipeline-audit.v1`.',
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
      'There is no wildcard syntax.', 'The snapshot keeps the configured values',
      'This stored configuration is a deliberate subset',
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
      'does not implement an ownership heartbeat',
    ],
  },
];

let sourceLinks = 0;
const currentEvidenceFiles = new Set();
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
    if (!currentEvidenceFiles.has(repositoryPath)) {
      const currentPath = path.join(root, repositoryPath);
      assert(fs.existsSync(currentPath),
        `${specification.file} links a source file that is absent from the current checkout: ${repositoryPath}`);
      assert.equal(fs.readFileSync(currentPath, 'utf8'), pinned,
        `${repositoryPath} changed after evidence revision ${revision}; inspect the change and repin the core guides`);
      currentEvidenceFiles.add(repositoryPath);
    }
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

const requirementMarkers = {
  'ARC-001': ['docs/site/understand/components-and-authority.md', '## Authority Map'],
  'ARC-002': ['docs/site/understand/components-and-authority.md', 'Core owns graph execution, lifecycle state, effects, recovery, waits, and final run closure.'],
  'ARC-003': ['docs/site/understand/components-and-authority.md', '## Runtime Role, Engine, and Specialist'],
  'ARC-004': ['docs/site/understand/request-state-recovery.md', '## Failure Paths'],
  'ARC-005': ['docs/site/understand/components-and-authority.md', '**Rejected alternative:**'],
  'ARC-006': ['docs/site/understand/components-and-authority.md', '## Communication, Persistence, And Retention Map'],
  'NVC-001': ['docs/site/understand/components-and-authority.md', '## Nova and Nova Core'],
  'NVC-002': ['docs/site/understand/nova-core.md', '## 1. Project Admission and Compilation'],
  'NVC-003': ['docs/site/understand/nova-core.md', 'Source admission creates a second, narrower boundary'],
  'NVC-004': ['docs/site/understand/nova-core.md', '## 2. Graph Construction, Validation, and Freeze'],
  'NVC-005': ['docs/site/understand/nova-core.md', '## 5. Scheduling, Readiness, and Concurrency'],
  'NVC-006': ['docs/site/understand/nova-core.md', '## 6. Stage Dispatch and Attempt Authority'],
  'NVC-007': ['docs/site/understand/nova-core.md', 'Each attempt receives a revocable invocation lease.'],
  'NVC-008': ['docs/site/understand/nova-core.md', '## 8. Technical Retry and Product Repair'],
  'NVC-009': ['docs/site/understand/nova-core.md', '## 9. Wait, Signal, and Resume'],
  'NVC-010': ['docs/site/understand/nova-core.md', '## 12. Cancellation and Shutdown'],
  'NVC-011': ['docs/site/understand/nova-core.md', '## 10. Effects, Locks, Fencing, and Receipts'],
  'NVC-012': ['docs/site/understand/nova-core.md', '## 11. Artifact Checkpoints and Visibility'],
  'NVC-013': ['docs/site/understand/nova-core.md', '## 4. Durable State and the Run Root'],
  'NVC-014': ['docs/site/understand/nova-core.md', '## 7. Lifecycle State and Result Mapping'],
  'NVC-015': ['docs/site/understand/nova-core.md', '## 14. Administrative Reopen'],
  'NVC-016': ['docs/site/understand/nova-core.md', '## 15. Nova-to-Buster Test Dispatch'],
  'NVC-017': ['docs/site/understand/nova-core.md', 'The output contract is `pipeline-audit.v1`.'],
  'NVC-018': ['docs/site/understand/nova-core.md', '## 17. Failure Families and Operator Response'],
  'PLG-001': ['docs/site/understand/plugin-runtime.md', '## Four Identities That Must Not Be Confused'],
  'PLG-002': ['docs/site/understand/plugin-runtime.md', '## Discovery Reads Data, Not Executable Code'],
  'PLG-003': ['docs/site/understand/plugin-runtime.md', '## Manifest, Schema, And Path Admission'],
  'PLG-004': ['docs/site/understand/plugin-runtime.md', '## Replacement, Disablement, And Removal'],
  'PLG-005': ['docs/site/understand/plugin-runtime.md', '## Integrity And Provenance'],
  'PLG-006': ['docs/site/understand/plugin-runtime.md', '## Import Audit Is An Admission Check, Not The Runtime Sandbox'],
  'PLG-007': ['docs/site/understand/plugin-runtime.md', '## Registry Construction And Global Ownership'],
  'PLG-008': ['docs/site/understand/plugin-runtime.md', '## Capabilities And Grants'],
  'PLG-009': ['docs/site/understand/plugin-runtime.md', 'There is no wildcard syntax.'],
  'PLG-010': ['docs/site/understand/plugin-runtime.md', '## Configuration Ownership And Precedence'],
  'PLG-011': ['docs/site/understand/plugin-runtime.md', '## Activation Is Fail-Closed'],
  'PLG-012': ['docs/site/understand/plugin-runtime.md', 'A safe replacement sequence is:'],
  'PLG-013': ['docs/site/understand/plugin-runtime.md', '## Isolation For External Stages And Observers'],
  'PLG-014': ['docs/site/understand/plugin-runtime.md', 'External capability adapters are rejected.'],
  'WKC-001': ['docs/site/understand/worker-core.md', 'Worker Core runs one bounded attempt.'],
  'WKC-002': ['docs/site/understand/worker-core.md', '## Contract And Version Model'],
  'WKC-003': ['docs/site/understand/worker-core.md', '### Registration And Readiness'],
  'WKC-004': ['docs/site/understand/worker-core.md', '### Claims, Generation, And Duplicate Protection'],
  'WKC-005': ['docs/site/understand/worker-core.md', '## Durable Ownership'],
  'WKC-006': ['docs/site/understand/worker-core.md', '## Native Launch And Trust Boundary'],
  'WKC-007': ['docs/site/understand/worker-core.md', '## Native Control Channel'],
  'WKC-008': ['docs/site/understand/worker-core.md', '### Native Output Spool'],
  'WKC-009': ['docs/site/understand/worker-core.md', '## Resource Policy And Accounting'],
  'WKC-010': ['docs/site/understand/worker-core.md', '## Deadlines, Cancellation, And Termination'],
  'WKC-011': ['docs/site/understand/worker-core.md', '## Attempt Journal And Commit Boundaries'],
  'WKC-012': ['docs/site/understand/worker-core.md', 'does not implement an ownership heartbeat'],
  'WKC-013': ['docs/site/understand/worker-core.md', '## Result, Digest, And Receipt'],
  'WKC-014': ['docs/site/understand/worker-core.md', '## Error Reference And Retry Decisions'],
};
assert.equal(Object.keys(requirementMarkers).length, 52,
  'core architecture requirement marker count changed');
for (const [id, [file, marker]] of Object.entries(requirementMarkers)) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert(source.includes(marker), `${id} lost its maintained content marker in ${file}`);
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
const concreteWorkerCodes = new Set([...workerCodes].filter((code) =>
  !constructedWorkerCodeStems.has(code)));
for (const prefix of ['WORKER_ATTEMPT_INPUT', 'WORKER_RESULT']) {
  for (const suffix of ['BYTE_LIMIT', 'NODE_LIMIT', 'DEPTH_LIMIT', 'TYPE_INVALID', 'CYCLE']) {
    concreteWorkerCodes.add(`${prefix}_${suffix}`);
  }
}
for (const phase of ['WORKER_RESOURCE_MEASUREMENT', 'WORKER_CLEANUP',
  'WORKER_EVIDENCE_COLLECTION', 'WORKER_LOG_STORE', 'WORKER_RESULT_FINALIZATION',
  'WORKER_FINAL_RESOURCE_MEASUREMENT']) {
  concreteWorkerCodes.add(`${phase}_TIMEOUT`);
}
const undocumentedWorkerCodes = [...concreteWorkerCodes].filter((code) =>
  !workerGuide.includes(`\`${code}\``));
assert.deepEqual(undocumentedWorkerCodes.sort(), [],
  `Worker guide does not name source error codes: ${undocumentedWorkerCodes.join(', ')}`);

const pluginGuide = fs.readFileSync(path.join(root, 'docs/site/understand/plugin-runtime.md'), 'utf8');
const pluginSource = sourceFiles(path.join(root, 'skills/common/plugin-runtime/foundation'))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');
const pluginCodes = new Set([...pluginSource.matchAll(
  /(?:['"`])((?:REGISTRY|PLUGIN_INSTALL|PLUGIN_REMOVE|ISOLATION|ISOLATED_PLUGIN|PLUGIN_STATE|RECOVERY)_[A-Z0-9_]+)(?=[:'"`$])/gu,
)].map((match) => match[1]));
for (const label of ['INVOCATION', 'RESPONSE', 'RESULT']) {
  pluginCodes.add(`ISOLATION_${label}_NOT_SERIALIZABLE`);
  pluginCodes.add(`ISOLATION_${label}_TOO_LARGE`);
}
pluginCodes.add('PLATFORM_CONFIG_INVALID');
const undocumentedPluginCodes = [...pluginCodes].filter((code) =>
  !pluginGuide.includes(`\`${code}\``));
assert.deepEqual(undocumentedPluginCodes.sort(), [],
  `Plugin runtime guide does not name source diagnostics: ${undocumentedPluginCodes.join(', ')}`);

console.log(JSON.stringify({ ok: true, pages: specifications.length,
  requirements: Object.keys(requirementMarkers).length,
  pinnedSourceLinks: sourceLinks, currentEvidenceFiles: currentEvidenceFiles.size,
  capabilities: capabilityVocabulary.CAPABILITY_IDS.length,
  novaErrorCodesCoveredByFamily: novaCodes.size,
  workerErrorCodesNamed: concreteWorkerCodes.size,
  pluginRuntimeDiagnosticsNamed: pluginCodes.size }));
