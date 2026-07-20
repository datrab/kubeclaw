#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  PIPELINE_ARTIFACT_AUTHORITY_ROLES,
  PIPELINE_ARTIFACT_SURFACES,
  buildLatestPointer,
  createPluginArtifactsApi,
  getPipelineArtifactBundle,
  getPluginArtifactBundle,
  projectPipelineArtifactEvidence,
} from '../../../skills/nova/pipeline/services/artifact-bundle.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-authority-matrix-contract-'));

try {
  const runId = 'run-artifact-authority';
  const config = {
    project: 'artifact-authority-contract',
    repo_root: root,
    run_id: runId,
    _runId: runId,
    paths: {
      swarm_dir: path.join(root, '.swarm'),
    },
  };

  const bundle = getPipelineArtifactBundle(config);
  assert.equal(bundle.run_id, runId);
  assert.equal(bundle.authority.pipeline_jsonl.role, PIPELINE_ARTIFACT_AUTHORITY_ROLES.RUN_SCOPED_REPLAY);
  assert.equal(bundle.authority.pipeline_jsonl.authority.operator_replay_authority, true);
  assert.equal(bundle.authority.pipeline_jsonl.authority.allow_completion_authority, false);
  assert.equal(bundle.authority.pipeline_jsonl.authority.allow_lifecycle_authority, false);

  const latest = buildLatestPointer(config, { status: 'completed', terminalStatus: 'succeeded' });
  assert.equal(latest.authority.role, PIPELINE_ARTIFACT_AUTHORITY_ROLES.LATEST_POINTER);
  assert.equal(latest.authority.operator_pointer_only, true);
  assert.equal(latest.authority.operator_replay_authority, false);
  assert.equal(latest.path, `runs/${runId}`);

  const staleLatest = projectPipelineArtifactEvidence({
    surface: PIPELINE_ARTIFACT_SURFACES.LATEST_JSON,
    path: 'latest.json',
    artifact: { run_id: 'run-stale', status: 'completed' },
    expectedRunId: runId,
  });
  assert.equal(staleLatest.role, PIPELINE_ARTIFACT_AUTHORITY_ROLES.LATEST_POINTER);
  assert.equal(staleLatest.authority.identity_drift, true);
  assert.equal(staleLatest.authority.stale_pointer, true);
  assert.equal(staleLatest.authority.operator_pointer_only, true);
  assert.equal(staleLatest.authority.operator_replay_authority, false);

  const diagnosticFallback = projectPipelineArtifactEvidence({
    surface: PIPELINE_ARTIFACT_SURFACES.QUARANTINE,
    path: `runs/${runId}/quarantine.jsonl`,
    artifact: { run_id: runId, schema_version: 'quarantined_payload.v1' },
    expectedRunId: runId,
  });
  assert.equal(diagnosticFallback.role, PIPELINE_ARTIFACT_AUTHORITY_ROLES.QUARANTINED_EVIDENCE);
  assert.equal(diagnosticFallback.authority.diagnostic_evidence_only, true);
  assert.equal(diagnosticFallback.authority.operator_replay_authority, false);
  assert.equal(diagnosticFallback.authority.allow_completion_authority, false);

  const pluginBundle = getPluginArtifactBundle(config, {
    hookFamily: 'gate.execute',
    stageId: 'gate:review',
    moduleId: 'builtin.gate.review',
  });
  assert.equal(pluginBundle.authority.role, PIPELINE_ARTIFACT_AUTHORITY_ROLES.PLUGIN_ARTIFACT_REFERENCE);
  assert.equal(pluginBundle.authority.authority.operator_replay_authority, false);
  assert.equal(pluginBundle.authority.authority.allow_completion_authority, false);

  const artifactsApi = createPluginArtifactsApi(config, {
    hookFamily: 'gate.execute',
    stageId: 'gate:review',
    moduleId: 'builtin.gate.review',
    invocation: {
      gateId: 'review',
      attempt: 2,
      dispatchId: 'dispatch-review',
    },
    now: () => '2026-06-17T00:00:00.000Z',
  });
  const persisted = await artifactsApi.persist({
    type: 'review-report',
    role: 'diagnostic',
    label: 'review',
    format: 'json',
    content: { status: 'FAIL', gate_id: 'review' },
    metadata: { gate_id: 'review', attempt: 2 },
  });
  assert.equal(persisted.artifact.authority.role, PIPELINE_ARTIFACT_AUTHORITY_ROLES.PLUGIN_ARTIFACT_REFERENCE);
  assert.equal(persisted.artifact.authority.authority.operator_replay_authority, false);
  assert.equal(persisted.artifact.authority.authority.allow_scheduler_authority, false);
  assert.equal(fs.existsSync(pluginBundle.lane_index_path), true);

  const staleRunSummary = projectPipelineArtifactEvidence({
    surface: PIPELINE_ARTIFACT_SURFACES.RUN_SUMMARY_JSON,
    path: 'runs/run-stale/summary.json',
    artifact: { run_id: 'run-stale' },
    expectedRunId: runId,
  });
  assert.equal(staleRunSummary.role, PIPELINE_ARTIFACT_AUTHORITY_ROLES.RUN_SCOPED_REPLAY);
  assert.equal(staleRunSummary.authority.identity_drift, true);
  assert.equal(staleRunSummary.authority.operator_replay_authority, false);

  console.log(JSON.stringify({
    ok: true,
    contract: 'artifact-authority-matrix',
    run_id: runId,
    latest_pointer_only: latest.authority.operator_pointer_only,
    plugin_artifact_role: persisted.artifact.authority.role,
  }, null, 2));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
