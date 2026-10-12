import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { buildRegistry, discoverPackages, resolveTestPlan, createProductionNovaTestGate } from '@kubeclaw/nova-core';
import { BusterRemotePlanRuntime, BusterRemotePlanService, FileBusterPlanJobStore } from '@kubeclaw/buster-engine';
import { remotePlanJobDigest, remotePlanJobId, type RemotePlanJobV1, type RemotePlanResultV1 } from '@kubeclaw/pipeline-test-gate-contract';
import { type CompactionIntent } from '../../../skills/buster/engine/test-gates/remote-plan-compaction.ts';
import { FileDurableRecordStore } from '@kubeclaw/plugin-foundation/observability/durable-records';
import { completed } from '../../fixtures/test-gate/remote-plan.mts';

const now = '2026-09-09T00:00:00.000Z';
const git = (root: string, ...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const token = 'compaction-local-http-token-000000000000000';

test('manual compaction reclaims genuine completed-job metadata bytes, preserving terminal HTTP replay', async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-compaction-'));
  const repository = path.join(temporary, 'repository'); fs.mkdirSync(repository);
  fs.writeFileSync(path.join(repository, 'retained-source.bin'), crypto.randomBytes(32768));
  git(repository, 'init', '-q'); git(repository, 'add', '.');
  git(repository, '-c', 'user.name=Compaction Test', '-c', 'user.email=compaction@example.invalid', 'commit', '-qm', 'retained source');
  const revision = git(repository, 'rev-parse', 'HEAD');
  const retainedRef = 'refs/tags/retained-project-candidate'; git(repository, 'update-ref', retainedRef, revision);
  const pluginRoot = path.join(temporary, 'plugins'); fs.mkdirSync(pluginRoot);
  for (const name of ['direct-command', 'junit-report-adapter']) fs.cpSync(path.resolve('skills/buster/plugins', name), path.join(pluginRoot, name), { recursive: true });
  const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
    trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'compaction',
  } }));
  const keys = crypto.generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
  const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const records = { maximumRecords: 100, maximumBytes: 16 * 1024 * 1024, maximumRecordBytes: 1024 * 1024 };
  const options = { recordLimits: records, maximumArchiveBytes: 1024 * 1024, maximumResultBytes: 1024 * 1024,
    maximumResultStoreBytes: 16 * 1024 * 1024, trustedSourceAuthority: 'nova:compaction', sourceAttestationPublicKey: publicKey };
  const storeRoot = path.join(temporary, 'original-state'); const runtimeRoot = path.join(temporary, 'runtime');
  const store = new FileBusterPlanJobStore(storeRoot, options);
  const serviceFor = (jobStore: FileBusterPlanJobStore) => new BusterRemotePlanService({ store: jobStore, registry,
    workerRevision: 'a'.repeat(40), runtimeRoot, tarExecutable: '/usr/bin/tar', maximumExtractedBytes: 1024 * 1024, allowedCapabilities: new Set() });
  const runtimeFor = (service: BusterRemotePlanService) => new BusterRemotePlanRuntime({ service, host: '127.0.0.1', port: 0, token,
    maximumRequestBytes: 2 * 1024 * 1024, maximumResponseBytes: 1024 * 1024, maximumResultBytes: 1024 * 1024, shutdownTimeoutMs: 5000 });
  const runtime = runtimeFor(serviceFor(store));
  try {
    const address = await runtime.start();
    const gate = createProductionNovaTestGate({ stateRoot: path.join(temporary, 'nova-state'), endpoint: `http://127.0.0.1:${address.port}`, token,
      sourceAuthority: options.trustedSourceAuthority, sourceAttestationPrivateKey: privateKey, pollMilliseconds: 10,
      maximumResponseBytes: 1024 * 1024, maximumResultBytes: 1024 * 1024, maximumArchiveBytes: 1024 * 1024,
      maximumArchiveStoreBytes: 4 * 1024 * 1024, maximumEvidenceBytes: 1024 * 1024, maximumEvidenceStoreBytes: 4 * 1024 * 1024, recordLimits: records });
    const limits = { cpuMillis: 30000, memoryBytes: 536870912, logBytes: 1048576, artifactBytes: 1048576, artifactFiles: 16, processes: 16 };
    const plan = resolveTestPlan({ planId: 'plan:compaction', runId: 'run:compaction', project: 'compaction', scope: { moduleId: 'api', gateId: null },
      createdAt: now, registry, suiteTemplates: [], declaration: { tests: { optional: { uses: 'kubeclaw.direct-command@1',
        config: { executable: 'node', args: ['--test'], resultMode: 'exit-code' }, when: { changedPaths: ['absent/**'] } } } },
      facts: { changedPaths: [], moduleType: null, pipelineStage: null }, policy: { defaultTimeoutMs: 30000, maximumTimeoutMs: 30000,
        defaultLimits: limits, maximumLimits: limits, maximumRetryCount: 1, maximumMatrixSize: 4, maximumNodes: 8,
        defaultConcurrencyLimit: 1, maximumConcurrencyLimits: {} } });
    const executed = await gate.execute({ idempotencyKey: 'compaction:original', pipelineStageId: 'test-api', plan, repositoryRoot: repository,
      repositoryId: 'compaction', revision, grants: new Map([['optional', []]]), maximumConcurrency: 1, submittedAt: now, timeoutMs: 30000 });
    assert.equal(executed.remote.status.state, 'completed');
    const original = (await store.records())[0]!;
    assert.equal(original.payload.schemaVersion, 'buster-plan-job-record.v1');
    if (original.payload.schemaVersion !== 'buster-plan-job-record.v1') throw new Error('full job required');
    const job = original.payload.job;
    const resultRef = original.payload.status.result!;
    const resultBytes = await store.result(job.jobId, resultRef.contentDigest, resultRef.sizeBytes);
    const result = JSON.parse(resultBytes.toString()) as RemotePlanResultV1;
    assert.equal(result.nodes[0]!.state, 'skipped', 'native skip is terminal store proof, not provider pass');
    await runtime.stop();
    const intent: CompactionIntent = { operationId: 'manual:compact-1', actor: 'operator:fixture', jobId: job.jobId,
      expectedPayloadDigest: original.payloadDigest, maximumEvidenceBytes: 1024 * 1024, source: { repositoryId: 'compaction', repositoryRoot: repository, retainedRef, retention: 'until-project-deletion' } };
    const copy = (name: string) => { const root = path.join(temporary, name); fs.cpSync(storeRoot, root, { recursive: true }); return root; };
    const changedJob = (id: string): RemotePlanJobV1 => {
      const unsigned = { ...job, idempotencyKey: id, jobId: remotePlanJobId(id) };
      return { ...unsigned, requestDigest: remotePlanJobDigest(unsigned) };
    };

    await t.test('real metadata byte quota is released; record count and completed status remain', async () => {
      const root = copy('quota'); const file = path.join(root, 'records/store.json'); const before = fs.statSync(file).size;
      const limited = new FileBusterPlanJobStore(root, { ...options, recordLimits: { ...records, maximumBytes: before + 8192, maximumRecords: 2 } });
      const second = changedJob('compaction:second');
      await assert.rejects(limited.accept(second, now), /DURABLE_RECORD_STORE_FULL/);
      const compacted = await limited.compactCompletedArchive(intent, runtimeRoot);
      assert.equal(compacted.releasedMetadataBytes, before - fs.statSync(file).size);
      assert.ok(compacted.releasedMetadataBytes > 32768);
      assert.deepEqual((await limited.get(job.jobId)).payload.status, original.payload.status);
      assert.equal((await limited.records()).length, 1);
      assert.deepEqual(await limited.result(job.jobId, resultRef.contentDigest, resultRef.sizeBytes), resultBytes);
      const after = fs.readFileSync(file);
      assert.deepEqual(await limited.compactCompletedArchive(intent, runtimeRoot), { receipt: compacted.receipt, releasedMetadataBytes: 0 });
      assert.deepEqual(fs.readFileSync(file), after);
      await assert.rejects(limited.compactCompletedArchive({ ...intent, actor: 'different' }, runtimeRoot), /INTENT_CONFLICT/);
      await assert.rejects(limited.transition(job.jobId, ['completed'], 'running', now), /COMPACTED_JOB_TERMINAL/);
      await limited.accept(second, now);
      const countLimited = new FileBusterPlanJobStore(root, { ...options, recordLimits: { ...records, maximumRecords: 2 } });
      await assert.rejects(countLimited.accept(changedJob('compaction:third'), now), /DURABLE_RECORD_STORE_FULL/);
      assert.equal((await limited.records()).length, 2);
    });

    await t.test('reopened original HTTP consumer returns same completion; full validation and conflicts survive', async () => {
      const root = copy('replay'); const first = new FileBusterPlanJobStore(root, options);
      await first.compactCompletedArchive(intent, runtimeRoot);
      const reopened = new FileBusterPlanJobStore(root, options); const service = serviceFor(reopened); const server = runtimeFor(service);
      const before = fs.readFileSync(path.join(root, 'records/store.json'));
      const endpoint = `http://127.0.0.1:${(await server.start()).port}/v1/plan-jobs`;
      try {
        const post = async (value: unknown) => fetch(endpoint, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(value) });
        const replay = await post(job); assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), original.payload.status);
        const status = await fetch(`${endpoint}/${encodeURIComponent(job.jobId)}`, { headers: { authorization: `Bearer ${token}` } });
        assert.deepEqual(await status.json(), original.payload.status);
        const fetched = await fetch(`${endpoint}/${encodeURIComponent(job.jobId)}/results/${encodeURIComponent(resultRef.contentDigest)}`, { headers: { authorization: `Bearer ${token}` } });
        assert.deepEqual(Buffer.from(await fetched.arrayBuffer()), resultBytes);
        assert.deepEqual(await reopened.complete(job.jobId, result, now), original.payload.status);
        const changed = { ...job, submittedAt: '2026-09-10T00:00:00.000Z' }; changed.requestDigest = remotePlanJobDigest(changed);
        assert.notEqual((await post(changed)).status, 200);
        assert.notEqual((await post({ ...job, repositoryArchive: { ...job.repositoryArchive, data: 'AAAA' } })).status, 200);
        assert.deepEqual(fs.readFileSync(path.join(root, 'records/store.json')), before, 'no enqueue, revival or duplicate result write');
      } finally { await server.stop(); }
    });

    await t.test('stale scope, unknown identity, movable branch and missing retained tag reject unchanged', async () => {
      const root = copy('reject'); const target = new FileBusterPlanJobStore(root, options); const before = fs.readFileSync(path.join(root, 'records/store.json'));
      for (const bad of [
        { ...intent, expectedPayloadDigest: `sha256:${'0'.repeat(64)}` },
        { ...intent, source: { ...intent.source, repositoryId: 'another' } },
        { ...intent, source: { ...intent.source, retainedRef: 'refs/heads/master' } },
        { ...intent, source: { ...intent.source, retainedRef: 'refs/tags/missing' } },
      ]) await assert.rejects(target.compactCompletedArchive(bad, runtimeRoot));
      fs.writeFileSync(path.join(repository, 'new.txt'), 'different revision'); git(repository, 'add', '.');
      git(repository, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'later');
      git(repository, 'update-ref', 'refs/tags/other-candidate', 'HEAD');
      await assert.rejects(target.compactCompletedArchive({ ...intent, source: { ...intent.source, retainedRef: 'refs/tags/other-candidate' } }, runtimeRoot), /SOURCE_REVISION_MISMATCH/);
      assert.deepEqual(fs.readFileSync(path.join(root, 'records/store.json')), before);
      fs.writeFileSync(path.join(repository, '.git/info/attributes'), 'retained-source.bin export-ignore\n');
      await assert.rejects(target.compactCompletedArchive(intent, runtimeRoot), /SOURCE_BYTES_MISMATCH/);
      fs.unlinkSync(path.join(repository, '.git/info/attributes'));
      // Unrelated later commits do not invalidate the retained exact candidate.
      assert.ok((await target.compactCompletedArchive(intent, runtimeRoot)).releasedMetadataBytes > 0);
    });

    await t.test('missing or changed real result blocks compaction', async () => {
      for (const operation of ['missing', 'changed']) {
        const root = copy(`result-${operation}`); const target = new FileBusterPlanJobStore(root, options);
        const file = path.join(root, 'results/blobs/sha256', resultRef.contentDigest.slice(7, 9), resultRef.contentDigest.slice(9));
        if (operation === 'missing') fs.unlinkSync(file); else fs.writeFileSync(file, 'damaged result');
        await assert.rejects(target.compactCompletedArchive(intent, runtimeRoot));
        assert.equal((await target.get(job.jobId)).payload.schemaVersion, 'buster-plan-job-record.v1');
      }
    });

    await t.test('accepted, running and uncertain execution remain ineligible', async () => {
      for (const state of ['accepted', 'running'] as const) {
        const target = new FileBusterPlanJobStore(path.join(temporary, `state-${state}`), options);
        await target.accept(job, now); if (state === 'running') await target.transition(job.jobId, ['accepted'], 'running', now);
        const record = (await target.get(job.jobId)).record;
        await assert.rejects(target.compactCompletedArchive({ ...intent, expectedPayloadDigest: record.payloadDigest }, runtimeRoot), /JOB_NOT_COMPLETED/);
        assert.equal((await target.get(job.jobId)).payload.status.state, state);
      }
      const target = new FileBusterPlanJobStore(path.join(temporary, 'uncertain'), options);
      await target.accept(job, now); await target.transition(job.jobId, ['accepted'], 'running', now);
      // Contract fixture verifies rejection of incomplete cleanup, not provider execution.
      await target.complete(job.jobId, completed(job, { outcome: 'failed', cleanup: true }).result, now);
      await assert.rejects(target.compactCompletedArchive({ ...intent, expectedPayloadDigest: (await target.get(job.jobId)).record.payloadDigest }, runtimeRoot), /EXECUTION_UNCERTAIN/);
    });

    await t.test('actual artifact bytes stay readable over HTTP; missing artifact prevents mutation', async artifactTest => {
      const target = new FileBusterPlanJobStore(path.join(temporary, 'artifact-state'), options);
      const artifactJob = changedJob('compaction:evidence');
      const jobRoot = path.join(runtimeRoot, crypto.createHash('sha256').update(artifactJob.jobId).digest('hex')); fs.mkdirSync(jobRoot);
      const log = path.join(jobRoot, 'native-command.log');
      const bytes = execFileSync(process.execPath, ['-e', 'process.stdout.write("actual diagnostic output\\n")']); fs.writeFileSync(log, bytes);
      const artifact = { type: 'log', artifactId: 'artifact:log', mediaType: 'text/plain',
        contentDigest: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`, sizeBytes: bytes.byteLength, storageUrl: pathToFileURL(log).href };
      await target.accept(artifactJob, now); await target.transition(artifactJob.jobId, ['accepted'], 'running', now);
      // Existing failed-result contract fixture carries actual native log bytes. No claimed Buster provider pass.
      await target.complete(artifactJob.jobId, completed(artifactJob, { outcome: 'failed', artifact }).result, now);
      const artifactIntent = { ...intent, jobId: artifactJob.jobId, expectedPayloadDigest: (await target.get(artifactJob.jobId)).record.payloadDigest };
      fs.renameSync(log, `${log}.retained`);
      await assert.rejects(target.compactCompletedArchive(artifactIntent, runtimeRoot));
      fs.renameSync(`${log}.retained`, log); fs.writeFileSync(log, Buffer.alloc(bytes.byteLength));
      await assert.rejects(target.compactCompletedArchive(artifactIntent, runtimeRoot), /EVIDENCE_DIGEST_MISMATCH/);
      fs.writeFileSync(log, bytes);
      await artifactTest.test('FIFO evidence rejects before read in original compactor and HTTP route', () => {
        const scope = path.join(temporary, 'fifo-scope.json');
        fs.writeFileSync(scope, JSON.stringify({ storeRoot: path.join(temporary, 'artifact-state'), options, runtimeRoot,
          intent: artifactIntent, pluginRoot, digest: artifact.contentDigest, token }));
        const code = `import fs from 'node:fs';
          import { buildRegistry, discoverPackages } from '@kubeclaw/nova-core';
          import { FileBusterPlanJobStore, BusterRemotePlanService, BusterRemotePlanRuntime } from '@kubeclaw/buster-engine';
          const input = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
          const store = new FileBusterPlanJobStore(input.storeRoot, input.options);
          if (process.argv[2] === 'compaction') {
            try { await store.compactCompletedArchive(input.intent, input.runtimeRoot); throw new Error('unexpected success'); }
            catch (error) { if (error.message !== 'BUSTER_REMOTE_EVIDENCE_SIZE_MISMATCH') throw error; }
          } else {
            const registry = buildRegistry(discoverPackages({ installationRoots: [input.pluginRoot], trustPolicy: {
              trustedBuiltinRoots: [input.pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'fifo-test' } }));
            const service = new BusterRemotePlanService({ store, registry, runtimeRoot: input.runtimeRoot, workerRevision: 'a'.repeat(40),
              tarExecutable: '/usr/bin/tar', maximumExtractedBytes: 1048576, allowedCapabilities: new Set() });
            const server = new BusterRemotePlanRuntime({ service, host: '127.0.0.1', port: 0, token: input.token,
              maximumRequestBytes: 2097152, maximumResponseBytes: 1048576, maximumResultBytes: 1048576, shutdownTimeoutMs: 5000 });
            try {
              const address = await server.start();
              const endpoint = 'http://127.0.0.1:' + address.port + '/v1/plan-jobs/' + encodeURIComponent(input.intent.jobId)
                + '/evidence/' + encodeURIComponent(input.digest);
              const response = await fetch(endpoint, { headers: { authorization: 'Bearer ' + input.token } });
              if (response.status < 400 || (await response.json()).error !== 'BUSTER_REMOTE_EVIDENCE_SIZE_MISMATCH') throw new Error('FIFO accepted');
            } finally { await server.stop(); }
          }
          process.stdout.write('FIFO_REJECTED');`;
        fs.unlinkSync(log); execFileSync('mkfifo', [log]);
        const before = fs.readFileSync(path.join(temporary, 'artifact-state/records/store.json'));
        try {
          for (const mode of ['compaction', 'http']) {
            // Bound the regression process so a reverted blocking open fails instead of hanging the suite.
            const child = spawnSync(process.execPath, ['--input-type=module', '-e', code, scope, mode], { encoding: 'utf8', timeout: 10000, killSignal: 'SIGKILL' });
            assert.equal(child.status, 0, `${mode}: ${child.error?.message ?? child.stderr}`);
            assert.equal(child.stdout, 'FIFO_REJECTED');
          }
          assert.deepEqual(fs.readFileSync(path.join(temporary, 'artifact-state/records/store.json')), before);
        } finally { fs.unlinkSync(log); fs.writeFileSync(log, bytes); }
      });
      await assert.rejects(target.compactCompletedArchive({ ...artifactIntent, maximumEvidenceBytes: 1 }, runtimeRoot), /EVIDENCE_BUDGET_EXCEEDED/);
      await target.compactCompletedArchive(artifactIntent, runtimeRoot);
      const server = runtimeFor(serviceFor(target));
      try {
        const endpoint = `http://127.0.0.1:${(await server.start()).port}/v1/plan-jobs/${encodeURIComponent(artifactJob.jobId)}/evidence/${encodeURIComponent(artifact.contentDigest)}`;
        const response = await fetch(endpoint, { headers: { authorization: `Bearer ${token}` } }); assert.equal(response.status, 200);
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes); assert.deepEqual(fs.readFileSync(log), bytes);
      } finally { await server.stop(); }
    });

    await t.test('caller mutation after submission cannot alter the persisted intent or poison replay', async () => {
      const root = copy('mutable-intent');
      const target = new FileBusterPlanJobStore(root, options);
      const mutable = { ...intent, source: { ...intent.source } };
      const pending = target.compactCompletedArchive(mutable, runtimeRoot);
      mutable.operationId = '';
      mutable.source.retainedRef = 'refs/tags/nonexistent-after-call';
      mutable.source.repositoryId = 'foreign-after-call';
      mutable.maximumEvidenceBytes = 0;
      const outcome = await pending;
      assert.deepEqual(outcome.receipt.intent, intent);
      const reopened = new FileBusterPlanJobStore(root, options);
      assert.equal((await reopened.records()).length, 1);
      assert.deepEqual(await reopened.accept(job, now), original.payload.status);
      assert.deepEqual(await reopened.compactCompletedArchive(intent, runtimeRoot), { receipt: outcome.receipt, releasedMetadataBytes: 0 });
      await assert.rejects(reopened.compactCompletedArchive(mutable, runtimeRoot), /COMPACTION_INTENT_INVALID/);
    });

    await t.test('concurrent identical operation has one writer; stale original CAS cannot restore archive', async () => {
      const root = copy('concurrent');
      const targets = [new FileBusterPlanJobStore(root, options), new FileBusterPlanJobStore(root, options)];
      const outcomes = await Promise.all(targets.map(target => target.compactCompletedArchive(intent, runtimeRoot)));
      assert.equal(outcomes.filter(outcome => outcome.releasedMetadataBytes > 0).length, 1);
      assert.equal(outcomes.filter(outcome => outcome.releasedMetadataBytes === 0).length, 1);
      assert.deepEqual(outcomes[0]!.receipt, outcomes[1]!.receipt);
      const inventoryModule = pathToFileURL(path.resolve('scripts/observability-retirement/files.mjs')).href;
      const storesModule = pathToFileURL(path.resolve('scripts/observability-retirement/stores.mjs')).href;
      const inspection = spawnSync(process.execPath, ['--input-type=module', '-e', `
        import { Inventory } from ${JSON.stringify(inventoryModule)};
        import { inspectJobs } from ${JSON.stringify(storesModule)};
        const inventory = new Inventory(); inventory.root(process.argv[1], 'buster-store');
        const report = inspectJobs(inventory, process.argv[1], process.argv[2], 'run:compaction');
        process.stdout.write(JSON.stringify({report, blockers: inventory.blockers}));`, root, runtimeRoot], { encoding: 'utf8' });
      assert.equal(inspection.status, 0, inspection.stderr);
      const inspected = JSON.parse(inspection.stdout);
      assert.equal(inspected.report.jobs.length, 1); assert.equal(inspected.report.jobs[0].disposition, 'retain');
      assert.equal(inspected.report.jobs[0].state, 'completed');
      assert.ok(!inspected.blockers.some((blocker: { code: string }) => blocker.code === 'JOB_IDENTITY_UNKNOWN'));
      const raw = new FileDurableRecordStore(root, records);
      await assert.rejects(raw.transition('buster-plan-jobs', original.idempotencyKey, original.payloadDigest, original.payload), /TRANSITION_CONFLICT/);
      assert.equal((await targets[0]!.get(job.jobId)).payload.schemaVersion, 'buster-plan-job-compacted-record.v1');
    });

    await t.test('SIGKILL before mutation and after durable commit recover without double release', async () => {
      const root = copy('crash');
      const scope = path.join(temporary, 'crash-scope.json'); fs.writeFileSync(scope, JSON.stringify({ root, options, intent, runtimeRoot }));
      const storeModule = pathToFileURL(path.resolve('skills/buster/engine/test-gates/remote-plan-service.ts')).href;
      const lockModule = pathToFileURL(path.resolve('skills/common/plugin-runtime/foundation/observability/durable-delivery.ts')).href;
      const code = `import fs from 'node:fs'; import { FileBusterPlanJobStore } from ${JSON.stringify(storeModule)};
        import { withDurableStoreLock } from ${JSON.stringify(lockModule)};
        const input = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
        if (process.argv[2] === 'before') await withDurableStoreLock(input.root + '/job-admission', async () => { process.kill(process.pid, 'SIGKILL'); });
        else { await new FileBusterPlanJobStore(input.root, input.options).compactCompletedArchive(input.intent, input.runtimeRoot); process.kill(process.pid, 'SIGKILL'); }`;
      const beforeBytes = fs.readFileSync(path.join(root, 'records/store.json'));
      const before = spawnSync(process.execPath, ['--input-type=module', '-e', code, scope, 'before'], { encoding: 'utf8' });
      assert.equal(before.signal, 'SIGKILL', before.stderr);
      assert.deepEqual(fs.readFileSync(path.join(root, 'records/store.json')), beforeBytes);
      const after = spawnSync(process.execPath, ['--input-type=module', '-e', code, scope, 'after'], { encoding: 'utf8' });
      assert.equal(after.signal, 'SIGKILL', after.stderr);
      const reopened = new FileBusterPlanJobStore(root, options);
      const replay = await reopened.compactCompletedArchive(intent, runtimeRoot);
      assert.equal(replay.releasedMetadataBytes, 0);
      assert.equal(replay.receipt.releasedMetadataBytes, beforeBytes.byteLength - fs.statSync(path.join(root, 'records/store.json')).size);
      assert.deepEqual(await reopened.accept(job, now), original.payload.status);
    });

    await t.test('manual CLI persists one receipt and idempotent retry returns zero additional bytes', async () => {
      const root = copy('manual'); const key = path.join(temporary, 'source-public.pem'); fs.writeFileSync(key, publicKey);
      const storeOptions = { recordLimits: options.recordLimits, maximumArchiveBytes: options.maximumArchiveBytes,
        maximumResultBytes: options.maximumResultBytes, maximumResultStoreBytes: options.maximumResultStoreBytes, trustedSourceAuthority: options.trustedSourceAuthority };
      const scope = path.join(temporary, 'operator-scope.json'); fs.writeFileSync(scope, JSON.stringify({ schemaVersion: 'buster-job-compaction-scope.v1',
        storeRoot: root, runtimeRoot, sourcePublicKeyFile: key, maximumSourcePublicKeyBytes: Buffer.byteLength(publicKey), storeOptions, intent }));
      const run = () => spawnSync(process.execPath, ['scripts/compact-buster-job.mjs', '--apply', scope], { encoding: 'utf8', timeout: 10000, killSignal: 'SIGKILL' });
      const scopeBytes = fs.readFileSync(scope);
      const before = fs.readFileSync(path.join(root, 'records/store.json'));
      fs.unlinkSync(scope); execFileSync('mkfifo', [scope]);
      const fifoScope = run(); assert.equal(fifoScope.status, 1, fifoScope.error?.message ?? fifoScope.stderr);
      assert.match(fifoScope.stderr, /SCOPE_FILE_INVALID/);
      fs.unlinkSync(scope); fs.writeFileSync(scope, scopeBytes);
      fs.unlinkSync(key); execFileSync('mkfifo', [key]);
      const fifoKey = run(); assert.equal(fifoKey.status, 1, fifoKey.error?.message ?? fifoKey.stderr);
      assert.match(fifoKey.stderr, /PUBLIC_KEY_FILE_INVALID/);
      fs.unlinkSync(key); fs.writeFileSync(key, publicKey);
      const tooSmall = JSON.parse(scopeBytes.toString()); tooSmall.maximumSourcePublicKeyBytes = Buffer.byteLength(publicKey) - 1;
      fs.writeFileSync(scope, JSON.stringify(tooSmall));
      const overBudget = run(); assert.equal(overBudget.status, 1, overBudget.stderr); assert.match(overBudget.stderr, /PUBLIC_KEY_SIZE_INVALID/);
      assert.deepEqual(fs.readFileSync(path.join(root, 'records/store.json')), before);
      fs.writeFileSync(scope, scopeBytes);
      const first = run(); assert.equal(first.status, 0, first.stderr); const firstResult = JSON.parse(first.stdout);
      const second = run(); assert.equal(second.status, 0, second.stderr); assert.deepEqual(JSON.parse(second.stdout), { receipt: firstResult.receipt, releasedMetadataBytes: 0 });
      fs.writeFileSync(scope, '{"SECRET_CANARY_COMPACTION":'); const invalid = run(); assert.equal(invalid.status, 1);
      assert.match(invalid.stderr, /SCOPE_JSON_INVALID/); assert.ok(!invalid.stderr.includes('SECRET_CANARY_COMPACTION'));
    });
  } finally { await runtime.stop(); fs.rmSync(temporary, { recursive: true, force: true }); }
});
