import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { portableJson, sha256Text } from '@kubeclaw/plugin-sdk';
import * as core from '../../../skills/nova/core/src/index.ts';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const child = fileURLToPath(new URL('./delivery-manifest-v3-stage-boundary-child.mjs', import.meta.url));

function prepare(root, phase, killed = false) {
  const env = { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [child, root, phase], {
    cwd: repository, env, encoding: 'utf8', timeout: 30000,
  });
  assert.equal(result.status, killed ? null : 0, result.stderr);
  assert.equal(result.signal, killed ? 'SIGKILL' : null, result.stderr);
  return { phase, status: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr };
}

function files(root) {
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => {
      const file = path.join(entry.parentPath, entry.name);
      return [path.relative(root, file), sha256Text(fs.readFileSync(file))];
    }).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
}

test('real cancelled v2/v3 Summary writes and nested evidence reads never publish a successful receipt', async () => {
  const transcript = [];
  for (const target of ['write', 'read']) for (const mode of ['v2', 'v3']) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `delivery-cancel-${target}-${mode}-`));
    try {
      const setup = [];
      if (target === 'read') setup.push(prepare(root, mode === 'v2' ? 'produce-v2' : 'produce'));
      setup.push(prepare(root, `kill-${target}-${mode}-requested`, true));
      const pluginRoot = path.join(root, target === 'write' ? 'producer-plugins' : `consumer-kill-read-${mode}-requested-plugins`);
      const installationRoots = ['common', 'nova', 'buster'].map(role => path.join(repository, 'skills', role, 'plugins')).concat(pluginRoot);
      const registry = core.buildRegistry(core.discoverPackages({ installationRoots, trustPolicy: {
        trustedBuiltinRoots: installationRoots, allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
        verifierId: `test:delivery-cancellation:${target}:${mode}`,
      } }));
      const summaryId = 'kubeclaw.project-summary:summary';
      const consumerId = 'test.delivery-consumer:consume';
      const evidenceId = 'kubeclaw.remote-test-gate:evidence';
      const providers = new Map([['artifacts.read', 'kubeclaw.artifact-store:artifact-store'], ['artifacts.write', 'kubeclaw.artifact-store:artifact-store']]);
      if (target === 'read') providers.set('test.plan.evidence', evidenceId);
      const grants = target === 'write'
        ? new Map([[summaryId, new Map([['artifacts.read', { allowedNamespaces: ['kubeclaw.implementation-agent'] }],
          ['artifacts.write', { allowedNamespaces: ['kubeclaw.project-summary'] }]])]])
        : new Map([[consumerId, new Map([['test.plan.evidence', { allowedNamespaces: ['kubeclaw.project-summary'] }]])],
          [evidenceId, new Map([['artifacts.read', { allowedNamespaces: ['kubeclaw.project-summary', 'kubeclaw.buster-quality-gate'] }]])]]);
      const granted = core.resolveCapabilityGrants(registry, { enabledRegistrations: new Set(grants.keys()), providers, grants });
      const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
      const effectsFile = path.join(root, `durability-${target}-${mode}-requested-effects.jsonl`);
      const effects = new core.FileEffectJournal(effectsFile);
      const capability = target === 'write' ? 'artifacts.write' : 'test.plan.evidence';
      const prior = (await effects.recoveryEntries()).map(entry => entry.request)
        .find(request => request.capability === capability && (target !== 'write' || request.attempt.stageId === 'project-summary'));
      assert(prior);
      const originalRequest = portableJson(prior);
      const originalJournal = fs.readFileSync(effectsFile);
      const controller = new AbortController();
      const accepted = [];
      let cancellationRequest;
      // Observe the real coordinator's durable acceptance callback and cancel
      // the original AbortSignal. No adapter, journal or provider is replaced.
      const audit = {
        requested() {},
        accepted(request) {
          accepted.push(request);
          if (request.capability === (target === 'write' ? 'artifacts.write' : 'artifacts.read')) {
            cancellationRequest = request;
            controller.abort(new Error('DELIVERY_TEST_CANCELLED'));
          }
        },
        completed() {},
      };
      const artifactRoot = path.join(root, 'artifacts');
      const adapters = new core.AdapterRuntime({ granted, activated,
        configs: new Map([['kubeclaw.artifact-store:artifact-store', { artifactRoot }],
          [evidenceId, { stateRoot: root, manifestStageId: 'project-summary', gateStageId: 'final-test' }]]),
        effects: new core.EffectCoordinator(effects, undefined, audit, new core.FileResourceLockManager(path.join(root, 'cancel-locks'))),
        shutdownTimeoutMs: 1000, async emitDomainEvent() {},
      });
      await adapters.start();
      const beforeArtifacts = files(artifactRoot);
      let error;
      try {
        await adapters.invoke(capability, prior.attempt, prior.idempotencyKey,
          { operation: prior.operation, resource: prior.resource, payload: prior.payload }, controller.signal, prior.deliveryId);
      } catch (caught) { error = caught instanceof Error ? caught.message : String(caught); }
      finally { await adapters.shutdown(); }
      assert(cancellationRequest, 'actual requested cancellation boundary was not reached');
      assert(controller.signal.aborted);
      assert.match(error ?? '', /CANCEL|ABORT/i);
      const receipt = await effects.receipt(prior.idempotencyKey);
      assert.equal(receipt?.status, 'failed');
      assert.equal(receipt.result, undefined);
      assert.equal(portableJson(await effects.request(prior.idempotencyKey)), originalRequest);
      const afterJournal = fs.readFileSync(effectsFile);
      assert.deepEqual(afterJournal.subarray(0, originalJournal.length), originalJournal);
      assert.deepEqual(files(artifactRoot), beforeArtifacts, 'cancelled operation must not change persisted artifact files');
      if (target === 'write') {
        assert.equal(prior.payload.value.schemaVersion, `delivery-manifest.${mode}`);
        assert.equal(prior.payload.encoding, mode === 'v3' ? 'kubeclaw-json.utf16.v1' : undefined);
      } else {
        assert.equal(cancellationRequest.operation, 'get_latest_json_bytes');
        assert.equal(cancellationRequest.resource.canonicalId, prior.payload.manifest.artifactId);
        assert.equal(accepted.filter(request => request.capability === 'artifacts.read').length, 1,
          'cancelled manifest read must not continue to the gate decision');
      }
      transcript.push({ target, mode, setup, cancellationRequest, receipt, error,
        originalRequestRetained: true, originalJournalPrefixRetained: true, artifactsUnchanged: true,
        exactEffectJournalJsonl: afterJournal.toString('utf8'), providerExecution: false });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  if (process.env.KUBECLAW_DELIVERY_CANCELLATION_PROOF_OUTPUT) {
    const output = path.resolve(process.env.KUBECLAW_DELIVERY_CANCELLATION_PROOF_OUTPUT);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify({ phases: transcript, providerExecution: false, deploymentExecution: false }, null, 2) + '\n');
  }
});
