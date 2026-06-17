#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildActiveSessionAuthorityPolicy,
} from '../../../skills/nova/pipeline/services/session-authority.ts';
import {
  resolveGateActiveSessionRecoveryEvidence,
} from '../../../skills/nova/pipeline/services/gate-active-session.ts';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'restart-session-recovery-contract-'));

try {
  const runId = 'run-restart-recovery';
  const gateId = 'review';
  const config = {
    project: 'restart-session-recovery-contract',
    run_id: runId,
    _runId: runId,
    paths: {
      swarm_dir: path.join(tempRoot, '.swarm'),
    },
  };
  const lifecycleIdentity = {
    gate_id: gateId,
    run_id: runId,
    attempt: '2',
    dispatch_id: 'dispatch-lifecycle',
    session_key: 'agent:parent:subagent:lifecycle',
    gateway_label: 'gateway-lifecycle',
  };
  const staleFileIdentity = {
    gate_id: gateId,
    run_id: runId,
    attempt: '1',
    dispatch_id: 'dispatch-stale',
    session_key: 'agent:parent:subagent:stale',
    gateway_label: 'gateway-stale',
  };

  const readModelsPath = path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'runs', runId, 'lifecycle', 'read-models.json');
  fs.mkdirSync(path.dirname(readModelsPath), { recursive: true });
  fs.writeFileSync(readModelsPath, JSON.stringify({
    schemaVersion: 'v1',
    run_id: runId,
    active_sessions: {
      modules: {},
      gates: {
        [gateId]: lifecycleIdentity,
      },
    },
  }, null, 2) + '\n');

  const activeSessionPath = path.join(config.paths.swarm_dir, 'logs', 'gates', gateId, 'active-session.json');
  fs.mkdirSync(path.dirname(activeSessionPath), { recursive: true });
  fs.writeFileSync(activeSessionPath, JSON.stringify(staleFileIdentity, null, 2) + '\n');

  const evidence = resolveGateActiveSessionRecoveryEvidence(config, gateId);
  assert.equal(evidence.policy.active_session_authority_source, 'lifecycle_read_model');
  assert.equal(evidence.policy.code, 'lifecycle_active_session_overrides_conflicting_gate_file');
  assert.equal(evidence.policy.allow_gate_active_session_file_authority, false);
  assert.equal(evidence.policy.allow_evidence_hydration, false);
  assert.equal(evidence.policy.gate_active_session_file_conflicts_with_lifecycle, true);
  assert.equal(evidence.active.session_key, lifecycleIdentity.session_key);
  assert.equal(evidence.policy.gate_active_session_file.session_key, staleFileIdentity.session_key);

  const confirmedGatewayPolicy = buildActiveSessionAuthorityPolicy({
    lifecycleActiveSession: lifecycleIdentity,
    evidenceActiveSession: staleFileIdentity,
    gatewayEvidence: {
      confirmed: true,
      state: 'closed',
      session_key: lifecycleIdentity.session_key,
    },
    requireGatewayConfirmation: true,
  });
  assert.equal(confirmedGatewayPolicy.confirmed, true);
  assert.equal(confirmedGatewayPolicy.gateway_confirmed, true);
  assert.equal(confirmedGatewayPolicy.allow_active_session_file_authority, false);

  const unconfirmedGatewayPolicy = buildActiveSessionAuthorityPolicy({
    lifecycleActiveSession: lifecycleIdentity,
    evidenceActiveSession: staleFileIdentity,
    gatewayEvidence: {
      confirmed: false,
      state: 'unreachable',
      session_key: lifecycleIdentity.session_key,
    },
    requireGatewayConfirmation: true,
  });
  assert.equal(unconfirmedGatewayPolicy.confirmed, false);
  assert.equal(unconfirmedGatewayPolicy.identity_confirmed, true);
  assert.equal(unconfirmedGatewayPolicy.code, 'lifecycle_active_session_requires_gateway_confirmation');

  const fileOnlyPolicy = buildActiveSessionAuthorityPolicy({
    lifecycleActiveSession: null,
    evidenceActiveSession: staleFileIdentity,
    requireGatewayConfirmation: false,
  });
  assert.equal(fileOnlyPolicy.confirmed, false);
  assert.equal(fileOnlyPolicy.active_session_authority_source, null);
  assert.equal(fileOnlyPolicy.allow_active_session_file_authority, false);
  assert.equal(fileOnlyPolicy.allow_evidence_hydration, false);

  console.log(JSON.stringify({
    ok: true,
    contract: 'restart-session-recovery',
    lifecycle_authority: evidence.policy.active_session_authority_source,
    stale_file_role: evidence.policy.gate_active_session_file_role,
  }, null, 2));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
