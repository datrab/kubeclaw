import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LEGACY_UNMIGRATED_SUITES } from '../../../skills/buster/plugins/buster-suite-runtime/src/protocol.ts';
import { NovaTestGateAuthorityRouter, assertLegacyBridgeSelection, type LegacySuiteMigrationLedger } from '../../../skills/nova/core/test-gates/legacy-bridge.ts';
import type { RemotePlanJobV1, ResolvedTestPlanV1 } from '../../../contracts/pipeline-test-gate/v1/src/types.ts';
import type { NovaRemoteTestGate } from '../../../skills/nova/core/test-gates/remote-result-import.ts';
import { createProductionNovaTestGate } from '../../../skills/nova/core/test-gates/production.ts';

const document = JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/legacy-suite-bridge.json', 'utf8')) as {
  schemaVersion: string; suites: LegacySuiteMigrationLedger;
};
assert.equal(document.schemaVersion, 'legacy-suite-bridge.v1');
assert.deepEqual(Object.entries(document.suites).filter(([, entry]) => entry.state === 'unmigrated').map(([name]) => name).sort(),
  [...LEGACY_UNMIGRATED_SUITES].sort(), 'runtime bridge must contain exactly the ledger entries still marked unmigrated');
assert.equal(Object.keys(document.suites).length >= LEGACY_UNMIGRATED_SUITES.length, true,
  'migrated ledger entries must remain recorded after runtime mappings are removed');

const node = { provider: { contractId: 'kubeclaw.http@1' } };
const plan = { nodes: [node] } as unknown as ResolvedTestPlanV1;
const dualPlan = { nodes: [{ provider: { contractId: 'kubeclaw.e2e-suite@1' } }] } as unknown as ResolvedTestPlanV1;
assert.throws(() => assertLegacyBridgeSelection(plan, ['unit'], document.suites), /ALREADY_MIGRATED:unit/u);
assert.throws(() => assertLegacyBridgeSelection(plan, ['health'], document.suites), /ALREADY_MIGRATED:health/u);
assert.throws(() => assertLegacyBridgeSelection(dualPlan, ['e2e'], document.suites), /DUAL_AUTHORITY:e2e/u);
assert.throws(() => assertLegacyBridgeSelection(plan, ['unknown'], document.suites), /LEGACY_SUITE_UNKNOWN/u);
assert.throws(() => assertLegacyBridgeSelection(plan, ['unit', 'unit'], document.suites), /SELECTION_DUPLICATE/u);
const migrated: LegacySuiteMigrationLedger = document.suites;
assert.throws(() => assertLegacyBridgeSelection(plan, ['unit'], migrated), /ALREADY_MIGRATED:unit/u);

let remoteCalls = 0;
let legacyCalls = 0;
const order: string[] = [];
const router = new NovaTestGateAuthorityRouter({
  remote: { execute: async () => { remoteCalls += 1; order.push('provider-plan'); return { stageResult: { outcome: 'passed' } }; } } as unknown as NovaRemoteTestGate,
  ledger: document.suites,
});
const job = { plan } as unknown as RemotePlanJobV1;
await assert.rejects(() => router.execute({ job, timeoutMs: 1000, legacySuites: ['health'],
  runLegacy: async () => { legacyCalls += 1; } }), /ALREADY_MIGRATED:health/u);
assert.equal(remoteCalls, 0, 'authority checks must run before either production path starts');
assert.equal(legacyCalls, 0);
await router.execute({ job, timeoutMs: 1000, legacySuites: ['e2e'],
  runLegacy: async () => { legacyCalls += 1; order.push('legacy-suite'); return 'legacy'; } });
assert.equal(remoteCalls, 1);
assert.equal(legacyCalls, 1);
assert.deepEqual(order, ['provider-plan', 'legacy-suite'], 'provider plan prerequisites must pass before legacy consumers start');

let blockedLegacyCalls = 0;
const blockedRouter = new NovaTestGateAuthorityRouter({
  remote: { execute: async () => ({ stageResult: { outcome: 'request_fix' } }) } as unknown as NovaRemoteTestGate,
  ledger: document.suites,
});
const blocked = await blockedRouter.execute({ job, timeoutMs: 1000, legacySuites: ['e2e'],
  runLegacy: async () => { blockedLegacyCalls += 1; return 'legacy'; } });
assert.equal(blockedLegacyCalls, 0, 'legacy consumers must not start after a failed provider prerequisite');
assert.equal(blocked.legacy, null);

const productionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'production-dual-authority-'));
try {
  const production = createProductionNovaTestGate({
    stateRoot: productionRoot, endpoint: 'http://127.0.0.1:1', token: 'production-dual-authority-token-00000000',
    sourceAuthority: 'nova:production',
    pollMilliseconds: 10, maximumResponseBytes: 64 * 1024, maximumResultBytes: 1024 * 1024,
    maximumArchiveBytes: 1024, maximumArchiveStoreBytes: 1024 * 1024,
    maximumEvidenceBytes: 1024, maximumEvidenceStoreBytes: 1024 * 1024,
    recordLimits: { maximumRecords: 10, maximumBytes: 1024 * 1024, maximumRecordBytes: 512 * 1024 },
    legacyLedger: document.suites,
  });
  let productionLegacyCalls = 0;
  await assert.rejects(() => production.execute({ idempotencyKey: 'dual-authority', pipelineStageId: 'stage:test', plan,
    repositoryRoot: '/not-read-before-authority-check', repositoryId: 'repository:test', grants: new Map(),
    maximumConcurrency: 1, submittedAt: '2026-08-12T00:00:00.000Z', timeoutMs: 1000, legacySuites: ['health'],
    runLegacy: async () => { productionLegacyCalls += 1; } }), /ALREADY_MIGRATED:health/u);
  assert.equal(productionLegacyCalls, 0, 'production composition must reject before legacy execution');
  assert.equal(fs.existsSync(path.join(productionRoot, 'dispatch')), false,
    'production composition must reject before durable dispatch or network submission');
} finally { fs.rmSync(productionRoot, { recursive: true, force: true }); }

const configSchema = JSON.parse(fs.readFileSync(
  'skills/buster/plugins/buster-suite-runtime/schemas/config.schema.json', 'utf8',
)) as { required: string[]; properties: Record<string, unknown> };
assert.equal(configSchema.required.includes('unmigratedSuites'), true);
assert.equal('allowedSuites' in configSchema.properties, false);

for (const file of [
  'skills/buster/engine/test-gates/remote-plan-service.ts',
  'contracts/pipeline-test-gate/v1/src/types.ts',
]) {
  const source = fs.readFileSync(file, 'utf8');
  for (const suite of LEGACY_UNMIGRATED_SUITES) {
    assert.equal(source.includes(`'${suite}'`), false, `resolved-plan path must not compile suite name ${suite}`);
  }
}

console.log(JSON.stringify({ ok: true, phase: '7-E', legacySuites: LEGACY_UNMIGRATED_SUITES.length }));
