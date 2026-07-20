#!/usr/bin/env node
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-artifact-authority-slice-surface' });
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const helperPath = path.join(repoRoot, 'skills/nova/pipeline/services/artifact-bundle.ts');
const helperSource = fs.readFileSync(helperPath, 'utf8');
const helperMod = await import(pathToFileURL(helperPath).href);
const deniedNumericTerminalArtifactFields = ['exit', 'exit_code', 'exit_reason', 'exitCode', 'exitLabel'];

function collectDeniedArtifactFields(value, trail = '$', hits = []) {
  if (!value || typeof value !== 'object') return hits;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectDeniedArtifactFields(item, `${trail}[${index}]`, hits));
    return hits;
  }
  for (const [key, child] of Object.entries(value)) {
    if (deniedNumericTerminalArtifactFields.includes(key)) hits.push(`${trail}.${key}`);
    collectDeniedArtifactFields(child, `${trail}.${key}`, hits);
  }
  return hits;
}

for (const expectedExport of [
  'export const PIPELINE_ARTIFACT_AUTHORITY_ROLES',
  'export const PIPELINE_ARTIFACT_SURFACES',
  'export function classifyPipelineArtifactSurface(',
  'export function buildPipelineArtifactAuthorityPolicy(',
  'export function projectPipelineArtifactEvidence(',
]) {
  assert.equal(helperSource.includes(expectedExport), true, `artifact authority helper missing ${expectedExport}`);
}

for (const denied of [
  'allow_lifecycle_authority: false',
  'allow_session_authority: false',
  'allow_scheduler_authority: false',
  'allow_completion_authority: false',
  'allow_ordering_authority: false',
]) {
  assert.equal(helperSource.includes(denied), true, `artifact policy must deny ${denied}`);
}

assert.equal(Object.isFrozen(helperMod.PIPELINE_ARTIFACT_AUTHORITY_ROLES), true, 'artifact authority roles must be frozen');
assert.equal(Object.isFrozen(helperMod.PIPELINE_ARTIFACT_SURFACES), true, 'artifact surfaces must be frozen');
assert.deepEqual(Object.values(helperMod.PIPELINE_ARTIFACT_AUTHORITY_ROLES).sort(), [
  'latest_pointer',
  'operator_mirror',
  'plugin_artifact_reference',
  'quarantined_evidence',
  'run_scoped_replay',
  'summary_operator_view',
]);

const runReplay = helperMod.buildPipelineArtifactAuthorityPolicy({
  surface: helperMod.PIPELINE_ARTIFACT_SURFACES.RUN_PIPELINE_JSONL,
  artifact: { run_id: 'run-1', seq: 7 },
  expectedRunId: 'run-1',
});
assert.equal(runReplay.role, 'run_scoped_replay');
assert.equal(runReplay.operator_replay_authority, true);
assert.equal(runReplay.allow_lifecycle_authority, false);
assert.equal(runReplay.allow_session_authority, false);
assert.equal(runReplay.allow_scheduler_authority, false);
assert.equal(runReplay.allow_completion_authority, false);
assert.equal(runReplay.allow_ordering_authority, false);

const latestPointer = helperMod.buildPipelineArtifactAuthorityPolicy({
  surface: helperMod.PIPELINE_ARTIFACT_SURFACES.LATEST_JSON,
  artifact: { run_id: 'run-1', status: 'completed' },
  expectedRunId: 'run-1',
});
assert.equal(latestPointer.role, 'latest_pointer');
assert.equal(latestPointer.operator_pointer_only, true);
assert.equal(latestPointer.operator_replay_authority, false);
assert.equal(latestPointer.allow_scheduler_authority, false);

const staleLatest = helperMod.buildPipelineArtifactAuthorityPolicy({
  surface: helperMod.PIPELINE_ARTIFACT_SURFACES.LATEST_JSON,
  artifact: { run_id: 'old-run', status: 'completed' },
  expectedRunId: 'new-run',
});
assert.equal(staleLatest.code, 'artifact_identity_drift');
assert.equal(staleLatest.identity_drift, true);
assert.equal(staleLatest.stale_pointer, true);
assert.equal(staleLatest.run_id_matches, false);
assert.equal(staleLatest.allow_lifecycle_authority, false);

const mismatchedSessionArtifact = helperMod.buildPipelineArtifactAuthorityPolicy({
  surface: helperMod.PIPELINE_ARTIFACT_SURFACES.RUN_DISCORD_JSONL,
  artifact: { run_id: 'run-1', session_key: 'agent:old', dispatch_id: 'dispatch-old' },
  expectedRunId: 'run-1',
  expectedSessionKey: 'agent:new',
  expectedDispatchId: 'dispatch-new',
});
assert.equal(mismatchedSessionArtifact.code, 'artifact_identity_drift');
assert.equal(mismatchedSessionArtifact.session_key_matches, false);
assert.equal(mismatchedSessionArtifact.dispatch_id_matches, false);
assert.equal(mismatchedSessionArtifact.allow_session_authority, false);
assert.equal(mismatchedSessionArtifact.allow_scheduler_authority, false);

const fallbackTelemetry = helperMod.buildPipelineArtifactAuthorityPolicy({
  surface: helperMod.PIPELINE_ARTIFACT_SURFACES.QUARANTINE,
  artifact: { run_id: 'run-1', schema_version: 'quarantined_payload.v1' },
  expectedRunId: 'run-1',
});
assert.equal(fallbackTelemetry.role, 'quarantined_evidence');
assert.equal(fallbackTelemetry.diagnostic_evidence_only, true);
assert.equal(fallbackTelemetry.operator_replay_authority, false);
assert.equal(fallbackTelemetry.allow_ordering_authority, false);

const pluginIndex = helperMod.projectPipelineArtifactEvidence({
  surface: helperMod.PIPELINE_ARTIFACT_SURFACES.PLUGIN_ARTIFACT_INDEX,
  path: 'runs/run-1/plugin-artifacts/m/g/s/index.json',
  artifact: { run_id: 'run-1' },
  expectedRunId: 'run-1',
});
assert.equal(pluginIndex.role, 'plugin_artifact_reference');
assert.equal(pluginIndex.authority.allow_lifecycle_authority, false);

const bundle = helperMod.getPipelineArtifactBundle({
  project: 'authority-surface',
  paths: { swarm_dir: '/tmp/kubeclaw-artifact-authority' },
  _runId: 'run-1',
  run_id: 'run-1',
});
assert.equal(bundle.authority.pipeline_jsonl.role, 'run_scoped_replay');
assert.equal(bundle.authority.pipeline_jsonl.authority.operator_replay_authority, true);
assert.equal(bundle.authority.latest_json.role, 'latest_pointer');
assert.equal(bundle.authority.latest_json.authority.operator_pointer_only, true);
assert.equal(bundle.authority.quarantine_jsonl.role, 'quarantined_evidence');
assert.equal(bundle.authority.quarantine_jsonl.authority.diagnostic_evidence_only, true);

const latest = helperMod.buildLatestPointer({
  project: 'authority-surface',
  paths: { swarm_dir: '/tmp/kubeclaw-artifact-authority' },
  _runId: 'run-1',
  run_id: 'run-1',
}, { status: 'completed', terminalStatus: 'succeeded' });
assert.equal(latest.authority.role, 'latest_pointer');
assert.equal(latest.authority.allow_lifecycle_authority, false);
assert.equal(latest.authority.operator_pointer_only, true);
assert.deepEqual(
  collectDeniedArtifactFields(latest),
  [],
  'latest pointer artifact must not write numeric terminal exit fields',
);

const summaryBundle = helperMod.buildSummaryArtifactBundle({
  project: 'authority-surface',
  paths: { swarm_dir: '/tmp/kubeclaw-artifact-authority' },
  _runId: 'run-1',
  run_id: 'run-1',
});
assert.equal(summaryBundle.authority.pipeline_jsonl.role, 'run_scoped_replay');
assert.equal(summaryBundle.authority.latest_json.role, 'latest_pointer');
assert.deepEqual(
  collectDeniedArtifactFields(summaryBundle),
  [],
  'summary artifact bundle must not write numeric terminal exit fields',
);

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 83 }));
