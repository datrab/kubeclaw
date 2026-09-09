import fs from 'node:fs';
import path from 'node:path';
import { runRoot } from '../skills/nova/core/execution/run-root.ts';
import { Inventory, identityHash, requireIdentity } from './observability-retirement/files.mjs';
import { inspectRun, journal } from './observability-retirement/journals.mjs';
import { inspectAdmission, inspectArtifacts, inspectAttempts, inspectJobs, recordSnapshot } from './observability-retirement/stores.mjs';

const diagnosticCodes = new Set([
  'SCOPE_FILE_REQUIRED', 'SCOPE_FILE_INVALID', 'SCOPE_FILE_BYTE_LIMIT', 'SCOPE_JSON_SYNTAX_INVALID',
  'SCOPE_VERSION_INVALID', 'SCOPE_FIELDS_UNKNOWN', 'EXPLICIT_STORE_SCOPE_REQUIRED', 'IDENTITY_INVALID',
  'INVENTORY_LIMIT_INVALID', 'ABSOLUTE_ROOT_REQUIRED', 'ROOT_DIRECTORY_INVALID', 'LEGACY_JOURNAL_PATH_INVALID',
  'LEGACY_SCAN_BYTE_LIMIT', 'LEGACY_SCAN_LIMIT_INVALID', 'REFERENCE_SCAN_LIMIT', 'REFERENCE_DIGEST_INVALID',
  'JOURNAL_INCOMPLETE', 'JOURNAL_INTEGRITY_INVALID', 'RUN_JOURNAL_IDENTITY_UNKNOWN', 'RUN_SNAPSHOT_INTEGRITY_INVALID',
  'SNAPSHOT_CHANGED', 'SNAPSHOT_BYTE_LIMIT', 'UNINVENTORIED_REFERENCE',
]);
function diagnosticCode(error, fallback) {
  if (diagnosticCodes.has(error?.message)) return error.message;
  if (['ENOENT', 'EACCES', 'EPERM', 'ELOOP', 'ENOTDIR', 'EISDIR'].includes(error?.code)) return `FILESYSTEM_${error.code}`;
  return fallback;
}
function guarded(inventory, subject, operation) {
  try { return operation(); }
  catch (error) {
    // Only fixed codes and caller-supplied identities; never parser excerpts or payloads.
    inventory.block(diagnosticCode(error, error instanceof SyntaxError ? 'STORE_JSON_SYNTAX_INVALID' : 'STORE_OR_SCOPE_UNVERIFIED'), subject);
    return null;
  }
}
function observationStores(inventory, root, runId, references) {
  const admissionRoot = path.join(root, 'admission');
  const attemptRoot = path.join(root, 'attempts');
  const result = { root, admission: null, attempts: null };
  if (inventory.files.has(path.join(admissionRoot, 'admission.json'))) result.admission = guarded(inventory, admissionRoot, () => inspectAdmission(inventory, admissionRoot, runId));
  else inventory.block('ADMISSION_SCOPE_MISSING', admissionRoot);
  if (inventory.files.has(path.join(attemptRoot, 'attempt-store.json'))) result.attempts = guarded(inventory, attemptRoot, () => inspectAttempts(inventory, attemptRoot, runId, references));
  else inventory.block('ATTEMPT_SCOPE_MISSING', attemptRoot);
  return result;
}
function checkArtifactReferences(inventory, root, references, runId) {
  const known = new Set(references.filter(item => item.ownerRunId === runId).map(item => JSON.stringify([item.artifactId, item.digest, item.namespace ?? null])));
  for (const item of inventory.files.values()) {
    if (path.dirname(item.path) !== root || !item.path.endsWith('.jsonl')) continue;
    guarded(inventory, item.path, () => {
      const pending = journal(inventory, item.path).map(record => record.entry);
      let visited = 0;
      while (pending.length) {
        if (++visited > 100000) throw new Error('REFERENCE_SCAN_LIMIT');
        const value = pending.pop();
        if (!value || typeof value !== 'object') continue;
        const hash = value.digest ?? value.contentDigest;
        if (typeof value.artifactId === 'string' && typeof hash === 'string'
          && !known.has(JSON.stringify([value.artifactId, hash, value.namespace ?? null]))) inventory.block('RUN_ARTIFACT_REFERENCE_UNKNOWN', identityHash([value.artifactId, hash]));
        pending.push(...Object.values(value).filter(child => child && typeof child === 'object'));
      }
    });
  }
}

function resolveScopedRun(inventory, scope, runId) {
  const storage = inventory.root(scope.novaStorageRoot, 'nova-storage', false);
  const runs = inventory.root(path.join(storage, 'runs'), 'nova-runs', false);
  const legacy = path.join(runs, runId.replaceAll(':', '_'));
  if (fs.existsSync(legacy)) {
    inventory.root(legacy, 'nova-legacy-candidate', false);
    const events = fs.lstatSync(path.join(legacy, 'events.jsonl'));
    if (!events.isFile() || events.isSymbolicLink()) throw new Error('LEGACY_JOURNAL_PATH_INVALID');
  }
  return inventory.root(runRoot(storage, runId, { maximumLegacyBytes: Math.min(inventory.limits.maximumSnapshotBytes, inventory.limits.maximumTotalBytes) }), 'nova-run');
}

export function planRetirement(scope) {
  if (scope?.schemaVersion !== 'observability-retirement-scope.v1') throw new Error('SCOPE_VERSION_INVALID');
  const fields = ['schemaVersion', 'runId', 'novaStorageRoot', 'artifactRoots', 'telemetryRoots', 'busterStores', 'inventoryLimits'];
  if (Object.keys(scope).some(key => !fields.includes(key))) throw new Error('SCOPE_FIELDS_UNKNOWN');
  const runId = requireIdentity(scope.runId);
  for (const name of ['artifactRoots', 'telemetryRoots', 'busterStores']) {
    if (!Array.isArray(scope[name]) || scope[name].length > 32) throw new Error('EXPLICIT_STORE_SCOPE_REQUIRED');
  }
  const inventory = new Inventory(scope.inventoryLimits);
  const references = [];
  const report = { schemaVersion: 'observability-retirement-plan.v1', runId, executable: false, releaseBytes: 0,
    preservation: 'D07: retain all data; final project material requires explicit project deletion',
    run: null, jobs: [], artifacts: [], observations: [], telemetry: [] };
  // Resolve via the actual Nova identity resolver; inventory rejects symlinks and
  // never constructs a FileJournal or acquires a write/initialization lock.
  const target = guarded(inventory, 'nova-run-root', () => resolveScopedRun(inventory, scope, runId));
  if (target) {
    report.run = guarded(inventory, target, () => inspectRun(inventory, target, runId));
    report.observations.push(observationStores(inventory, path.join(target, 'observability'), runId, references));
  }
  for (const configured of scope.artifactRoots) {
    guarded(inventory, identityHash(configured), () => {
      const root = inventory.root(configured, 'artifact-store');
      report.artifacts.push(inspectArtifacts(inventory, root, runId, references));
    });
  }
  for (const configured of scope.telemetryRoots) {
    guarded(inventory, identityHash(configured), () => {
      const root = inventory.root(configured, 'telemetry-store');
      const records = recordSnapshot(inventory, root);
      report.telemetry.push({ root, records: records.length, recordIdentities: records.map(record => ({ sequence: record.sequence,
        idempotencyKeyHash: identityHash(record.idempotencyKey), digest: record.payloadDigest, disposition: 'retain' })) });
      inventory.block('TELEMETRY_SHARED_SCOPE_RETAINED', root);
    });
  }
  for (const configured of scope.busterStores) {
    guarded(inventory, identityHash(configured?.root), () => {
      const root = inventory.root(configured.root, 'buster-job-store');
      const runtimeRoot = inventory.root(configured.runtimeRoot, 'buster-runtime', false);
      const result = inspectJobs(inventory, root, runtimeRoot, runId); report.jobs.push(result);
      for (const job of result.jobs) report.observations.push(observationStores(inventory, path.join(job.root, 'observability'), runId, references));
    });
  }
  if (target) checkArtifactReferences(inventory, target, references, runId);
  inventory.block('STORE_SCOPE_COMPLETENESS_UNVERIFIED', runId);
  inventory.block('DURABLE_CONSUMER_CHECKPOINT_NOT_PROVEN', runId);
  inventory.block('RETAINED_ARCHIVE_NOT_PROVEN', runId);
  inventory.block('SAFE_RELEASE_OPERATION_UNIMPLEMENTED', runId);
  guarded(inventory, 'inventory', () => inventory.verifyUnchanged());
  return { ...report, roots: inventory.roots, files: inventory.output(), references, blockers: inventory.blockers,
    inventoryBytes: [...inventory.files.values()].reduce((total, item) => total + item.bytes, 0), bytesHashed: inventory.bytesHashed };
}

if (process.argv[1] === import.meta.filename) {
  const file = process.argv[2] === undefined ? null : path.resolve(process.argv[2]);
  let operation = 'read-scope';
  try {
    if (process.argv.length !== 3) throw new Error('SCOPE_FILE_REQUIRED');
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('SCOPE_FILE_INVALID');
    if (stat.size > 1024 * 1024) throw new Error('SCOPE_FILE_BYTE_LIMIT');
    const text = fs.readFileSync(file, 'utf8');
    operation = 'parse-scope';
    const scope = JSON.parse(text);
    operation = 'plan-retirement';
    const result = planRetirement(scope);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const fallback = operation === 'parse-scope' && error instanceof SyntaxError ? 'SCOPE_JSON_SYNTAX_INVALID' : 'RETIREMENT_PLAN_INPUT_INVALID';
    process.stderr.write(`${JSON.stringify({ code: diagnosticCode(error, fallback), operation, file, noDataChanged: true })}\n`);
    process.exitCode = 1;
  }
}
