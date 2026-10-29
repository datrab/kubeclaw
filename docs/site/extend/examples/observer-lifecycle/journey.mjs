import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

assert.equal(process.argv.length, 2, 'Usage: node observer-lifecycle/journey.mjs (no arguments)');
const sourceRoot = path.resolve(import.meta.dirname, '../../../../..');
const core = await import(pathToFileURL(path.join(sourceRoot, 'skills/nova/core/src/index.ts')).href);
const { prepareRuntime, createAdapterRuntime } = await import(pathToFileURL(path.join(sourceRoot, 'skills/nova/core/execution/engine-runtime.ts')).href);
const fixtureRoot = path.join(import.meta.dirname, 'plugin');
const fixtureManifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'plugin.json'), 'utf8'));
assert.equal(fixtureManifest.observers.length, 1);
const observerId = `${fixtureManifest.id}:${fixtureManifest.observers[0].id}`;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-observer-lifecycle-'));
const installationRoot = path.join(temporary, 'plugins');
const installedObserver = path.join(installationRoot, 'observer');
const report = { journey: 'local-observer-lifecycle', subscription: fixtureManifest.observers[0].subscriptions, journalKind: 'production FileJournal', deployment: false };
const definition = {
  schemaVersion: 'pipeline-definition.v2', id: 'pipeline:observer-tutorial', maxConcurrency: 1,
  stages: [{ id: 'greet', type: 'example.greeting.say', dependsOn: [], config: { prefix: 'Hello' },
    input: { name: 'Observer' }, execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 5000 } }],
};
function platform({ enabled = true, config = {} } = {}) {
  return {
    schemaVersion: 'pipeline-platform.v2', installationRoots: [installationRoot], trustedBuiltinRoots: [installationRoot],
    externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} }, providers: {},
    grants: { 'example.greeting:say': {}, ...(enabled ? { [observerId]: {} } : {}) },
    adapters: {}, activeAdapters: [], observers: enabled ? { [observerId]: config } : {},
    storageRoot: path.join(temporary, 'state'), shutdownTimeoutMs: 1000,
    orchestratorIssuerId: 'nova', administrativeDecisionIssuers: [],
  };
}
function journals(runRoot) {
  return {
    events: new core.FileJournal(path.join(runRoot, 'events.jsonl')),
    checkpoints: new core.FileJournal(path.join(runRoot, 'checkpoints.jsonl')),
    deliveries: new core.FileJournal(path.join(runRoot, 'deliveries.jsonl')),
  };
}
function observerRuntime(p, runtime, adapters, disk) {
  return new core.ObserverRuntime({ registry: runtime.granted, activated: runtime.activated, adapters,
    ...disk, configs: new Map(Object.entries(p.observers)) });
}
async function run(name, p, { expectFailure = false } = {}) {
  const runtime = await prepareRuntime(p, definition);
  const runRoot = path.join(temporary, 'runs', name);
  const disk = journals(runRoot);
  const adapters = createAdapterRuntime(p, runRoot, runtime, disk.events);
  try {
    await adapters.start();
    const runner = new core.PipelineRunner({ definition, registry: runtime.granted, activated: runtime.activated,
      adapters, journal: disk.events, orchestratorIssuerId: 'nova' });
    const result = await runner.run(`run:observer-${name}`);
    assert.equal(result.status, 'succeeded');
    const lifecycle = () => JSON.stringify(disk.events.records().filter(({ entry }) => entry.schemaVersion === 'lifecycle-event.v2'));
    const canonicalBefore = lifecycle();
    if (expectFailure) {
      await assert.rejects(observerRuntime(p, runtime, adapters, disk).drain(), /REQUIRED_OBSERVER_DELIVERY_FAILED:.*TUTORIAL_OBSERVER_FAILURE/u);
      assert.equal(disk.checkpoints.records().length, 0);
      assert.deepEqual(disk.deliveries.records().map(({ entry }) => entry.status), ['started', 'failed']);
      assert.equal(lifecycle(), canonicalBefore, 'observer failure must not rewrite committed lifecycle facts');
      return { requiredDrain: 'failed', pipelineStatus: result.status, checkpointCount: 0 };
    }
    const drained = await observerRuntime(p, runtime, adapters, disk).drain();
    assert.deepEqual(drained.failures, []);
    const expected = Object.keys(p.observers).length;
    assert.equal(drained.delivered, expected);
    const observations = disk.events.records().filter(({ entry }) => entry.type === 'plugin.example.observer-lifecycle.observed');
    assert.equal(observations.length, expected);
    if (expected) {
      assert.equal(observations[0].entry.payload.deniedCapability, 'state.read');
      assert.equal(disk.checkpoints.records().length, 1);
      assert.deepEqual(disk.deliveries.records().map(({ entry }) => entry.status), ['started', 'completed']);
    }
    assert.equal(lifecycle(), canonicalBefore, 'The observer can append domain facts. It must not rewrite lifecycle facts.');
    const reopened = journals(runRoot);
    const replay = await observerRuntime(p, runtime, adapters, reopened).drain();
    assert.equal(replay.delivered, 0);
    assert.deepEqual(replay.failures, []);
    assert.equal(reopened.events.records().filter(({ entry }) => entry.type === 'plugin.example.observer-lifecycle.observed').length, expected);
    return { activatedObservers: runtime.activated.observers.size, pipelineStatus: result.status,
      delivered: drained.delivered, observedSourceEventType: observations[0]?.entry.payload.sourceEventType ?? null, replayDelivered: replay.delivered, checkpointCount: reopened.checkpoints.records().length,
      retainedEventRecords: reopened.events.records().length, registrationVersion: runtime.snapshot.observers.get(observerId)?.package.manifest.packageVersion ?? null };
  } finally {
    await adapters.shutdown();
  }
}
try {
  fs.mkdirSync(installationRoot, { recursive: true });
  fs.cpSync(path.join(import.meta.dirname, '../minimal-stage'), path.join(installationRoot, 'stage'), { recursive: true });
  fs.cpSync(fixtureRoot, installedObserver, { recursive: true });
  const roleCommand = [path.join(sourceRoot, 'scripts/check-runtime-role-manifests.mjs'), '--additional-plugin', `nova=${path.join(installedObserver, 'plugin.json')}`];
  const missingRole = spawnSync(process.execPath, roleCommand, { cwd: sourceRoot, encoding: 'utf8' });
  assert.notEqual(missingRole.status, 0);
  assert(missingRole.stderr.includes(`nova omits its plugin: ${fixtureManifest.id}`), missingRole.stderr);
  const includedRole = spawnSync(process.execPath, [...roleCommand, '--role-addition', `nova=${fixtureManifest.id}`], { cwd: sourceRoot, encoding: 'utf8' });
  assert.equal(includedRole.status, 0, includedRole.stderr || includedRole.stdout);
  report.roleOmission = 'rejected'; report.roleInclusion = 'The role check validated only the addition. No deployed role changed.';
  report.success = await run('success', platform());
  await assert.rejects(prepareRuntime(platform({ config: { fail: 'not-a-boolean' } }), definition), error => error.code === 'REGISTRY_RESULT_INVALID');
  report.invalidConfiguration = 'REGISTRY_RESULT_INVALID';
  report.requiredFailure = await run('required-failure', platform({ config: { fail: true } }), { expectFailure: true });
  report.disabled = await run('disabled', platform({ enabled: false }));
  const manifestPath = path.join(installedObserver, 'plugin.json');
  const originalManifest = fs.readFileSync(manifestPath);
  fs.writeFileSync(manifestPath, JSON.stringify({ ...fixtureManifest, apiVersion: 'pipeline-plugin-v1' }));
  await assert.rejects(prepareRuntime(platform(), definition), error => error.code === 'REGISTRY_MANIFEST_INVALID');
  report.incompatibleApi = 'REGISTRY_MANIFEST_INVALID';
  fs.writeFileSync(manifestPath, JSON.stringify({ ...fixtureManifest, packageVersion: '2.0.0' }));
  report.sameContractVersionChange = await run('replacement', platform());
  assert.equal(report.sameContractVersionChange.registrationVersion, '2.0.0');
  fs.writeFileSync(manifestPath, originalManifest);
  report.rollback = await run('rollback', platform());
  assert.equal(report.rollback.registrationVersion, '1.0.0');
  const retained = ['events.jsonl', 'checkpoints.jsonl', 'deliveries.jsonl'].map(name => {
    const bytes = fs.readFileSync(path.join(temporary, 'runs/success', name));
    return { name, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  });
  fs.rmSync(installedObserver, { recursive: true });
  await assert.rejects(prepareRuntime(platform(), definition), error => error.code === 'REGISTRY_REGISTRATION_MISSING');
  assert(retained.every(({ name, sha256 }) => crypto.createHash('sha256').update(fs.readFileSync(path.join(temporary, 'runs/success', name))).digest('hex') === sha256));
  report.removal = 'REGISTRY_REGISTRATION_MISSING'; report.retainedSuccessJournals = retained;
  report.scope = 'This journey uses local trusted-first-party activation, persistent observer audit/checkpoint, and reconstructed runtime replay. It is not process-restart recovery, external isolation, production deployment, or full platform extension qualification.';
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
  report.temporaryRootRemoved = !fs.existsSync(temporary);
}
console.log(JSON.stringify(report, null, 2));
