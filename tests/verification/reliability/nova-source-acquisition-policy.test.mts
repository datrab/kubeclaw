import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { captureSourceAcquisitionPolicy, LEGACY_SOURCE_ACQUISITION_POLICY as legacy } from '../../../skills/nova/core/test-gates/source-acquisition-policy.ts';
import { buildCommittedSourceSnapshot } from '../../../skills/nova/core/test-gates/source-snapshot.ts';
import { sourceGit } from '../../../skills/nova/core/test-gates/source-git.ts';

test('source receiving rejects incomplete, unknown and invalid policy before Git spawn', async () => {
  for (const key of Object.keys(legacy)) {
    for (const value of [undefined, 0, -1, 1.5, Infinity, 2147483648]) {
      const policy = { ...legacy, [key]: value };
      await assert.rejects(sourceGit('/nonexistent', ['status'], 100, new AbortController().signal, policy as typeof legacy), /NOVA_SOURCE_POLICY_INVALID/);
    }
  }
  assert.throws(() => captureSourceAcquisitionPolicy({ ...legacy, unexpected: 1 } as typeof legacy), /UNKNOWN_FIELD/);
  assert.throws(() => captureSourceAcquisitionPolicy({ ...legacy, forceKillAfterMs: 1500 }), /cleanupRelation/);
  const authored = { ...legacy }; const captured = captureSourceAcquisitionPolicy(authored);
  authored.maximumMetadataBytes = 1;
  assert.equal(captured.maximumMetadataBytes, 65536); assert(Object.isFrozen(captured));
});

test('actual Git metadata A/B and in-flight author mutation use captured source policy', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-source-policy-'));
  try {
    const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args]);
    git('init', '-q'); fs.writeFileSync(path.join(root, 'README'), 'original source'); git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'source');
    const options = { repositoryRoot: root, repositoryId: 'repository:policy', pipelineStageId: 'test',
      creatorAuthority: 'nova:policy', attestationPrivateKey: crypto.generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' }), maximumArchiveBytes: 100000 };
    const policy = { ...legacy };
    const admitted = buildCommittedSourceSnapshot({ ...options, sourceAcquisitionPolicy: policy });
    policy.maximumMetadataBytes = 1;
    const original = await admitted; assert(original.repositoryArchive.length > 0);
    await assert.rejects(buildCommittedSourceSnapshot({ ...options, sourceAcquisitionPolicy: policy }), /NOVA_SOURCE_ARCHIVE_SIZE_EXCEEDED/);
    const restored = await buildCommittedSourceSnapshot({ ...options, sourceAcquisitionPolicy: { ...legacy } });
    assert.deepEqual(restored.repositoryArchive, original.repositoryArchive);
    const error = await sourceGit(root, ['not-a-real-subcommand'], 10000, new AbortController().signal,
      { ...legacy, maximumStderrCharacters: 7 }).then(() => null, error => error);
    assert.match(error.message, /NOVA_SOURCE_GIT_FAILED/);
    assert.equal(error.message.split(':').slice(3).join(':').length, 7);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});


test('production constructor retains admitted source selection and factory forwards it before dispatch', async () => {
  const { ProductionNovaTestGate, createProductionNovaTestGate } = await import('../../../skills/nova/core/test-gates/production.ts');
  const { plan } = await import('../../fixtures/test-gate/remote-plan.mts');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-production-source-policy-'));
  try {
    const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args]);
    git('init', '-q'); fs.writeFileSync(path.join(root, 'README'), 'source'); git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'source');
    const base = { sourceAuthority: 'nova:policy', sourceAttestationPrivateKey: crypto.generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' }), maximumArchiveBytes: 100000 };
    const input = { idempotencyKey: 'policy:production', pipelineStageId: 'test', plan: plan('blocking', null), repositoryRoot: root,
      repositoryId: 'repository:policy', grants: new Map([['test', []]]), maximumConcurrency: 1,
      submittedAt: '2026-08-10T03:00:00.000Z', timeoutMs: 10000 };
    let dispatched = 0;
    // This unit boundary records submission only; source acquisition uses actual Git.
    const remote = { execute: async () => { dispatched++; throw new Error('SOURCE_CAPTURE_DISPATCH_REACHED'); } } as unknown as import('../../../skills/nova/core/test-gates/remote-result-import.ts').NovaRemoteTestGate;
    const authored = { ...legacy, maximumMetadataBytes: 1 };
    const gate = new ProductionNovaTestGate({ ...base, remote, sourceAcquisitionPolicy: authored });
    authored.maximumMetadataBytes = legacy.maximumMetadataBytes;
    await assert.rejects(gate.execute(input), /NOVA_SOURCE_ARCHIVE_SIZE_EXCEEDED/);
    assert.equal(dispatched, 0);
    const restored = new ProductionNovaTestGate({ ...base, remote, sourceAcquisitionPolicy: authored });
    authored.maximumMetadataBytes = 1;
    await assert.rejects(restored.execute(input), /SOURCE_CAPTURE_DISPATCH_REACHED/);
    assert.equal(dispatched, 1);
    const factory = createProductionNovaTestGate({ ...base, stateRoot: path.join(root, 'state'), endpoint: 'http://127.0.0.1:1', token: 'x'.repeat(32),
      pollMilliseconds: 10, maximumResponseBytes: 100000, maximumResultBytes: 100000, maximumArchiveStoreBytes: 1000000,
      maximumEvidenceBytes: 100000, maximumEvidenceStoreBytes: 1000000,
      recordLimits: { maximumRecords: 100, maximumBytes: 1000000, maximumRecordBytes: 100000 }, sourceAcquisitionPolicy: authored });
    await assert.rejects(factory.execute(input), /NOVA_SOURCE_ARCHIVE_SIZE_EXCEEDED/);
    assert.throws(() => new ProductionNovaTestGate({ ...base, remote, sourceAcquisitionPolicy: { ...legacy, timeoutMs: 0 } }), /NOVA_SOURCE_POLICY_INVALID/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});


test('runtime loader receives explicit immutable selection without opening v1 author keys', async () => {
  const { loadProductionNovaTestGate } = await import('../../../skills/nova/core/test-gates/runtime-config.ts');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-runtime-source-policy-'));
  try {
    const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args]);
    git('init', '-q'); fs.writeFileSync(path.join(root, 'README'), 'source'); git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'source');
    const config = { schemaVersion: 'nova-remote-test-gate-runtime.v1', endpoint: 'http://127.0.0.1:1',
      tokenEnvironmentVariable: 'TEST_TOKEN', sourceAttestationPrivateKeyEnvironmentVariable: 'TEST_KEY',
      sourceAuthority: 'nova:policy', stateRoot: './runtime-state', pollMilliseconds: 10,
      maximumResponseBytes: 100000, maximumResultBytes: 100000, maximumArchiveBytes: 100000,
      maximumArchiveStoreBytes: 1000000, maximumEvidenceBytes: 100000, maximumEvidenceStoreBytes: 1000000,
      recordLimits: { maximumRecords: 100, maximumBytes: 1000000, maximumRecordBytes: 100000 } };
    const file = path.join(root, 'runtime.json'); fs.writeFileSync(file, JSON.stringify(config));
    const environment = { TEST_TOKEN: 'x'.repeat(32), TEST_KEY: crypto.generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' }).toString() };
    const selection = { ...legacy, maximumMetadataBytes: 1 };
    const gate = loadProductionNovaTestGate(file, environment, selection);
    selection.maximumMetadataBytes = 65536;
    // An invalid replacement of current config cannot affect the admitted instance.
    fs.writeFileSync(file, '{}');
    const { plan } = await import('../../fixtures/test-gate/remote-plan.mts');
    await assert.rejects(gate.execute({ idempotencyKey: 'policy:runtime', pipelineStageId: 'test',
      plan: plan('blocking', null), repositoryRoot: root, repositoryId: 'repository:policy',
      grants: new Map([['test', []]]), maximumConcurrency: 1, submittedAt: '2026-08-10T03:00:00.000Z', timeoutMs: 10000 }), /NOVA_SOURCE_ARCHIVE_SIZE_EXCEEDED/);
    for (const key of ['sourceAcquisitionPolicy', 'sourceAcquisitionSelection']) {
      fs.writeFileSync(file, JSON.stringify({ ...config, [key]: legacy }));
      assert.throws(() => loadProductionNovaTestGate(file, environment), /NOVA_REMOTE_CONFIG_INVALID:root/);
    }
    assert.throws(() => loadProductionNovaTestGate('/nonexistent', environment,
      { ...legacy, timeoutMs: 0 }), /NOVA_SOURCE_POLICY_INVALID/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});


test('selected metadata byte ceiling is inclusive and independent of archive ceiling', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-source-exact-'));
  try {
    const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args]);
    git('init', '-q'); fs.writeFileSync(path.join(root, 'README'), crypto.randomBytes(2048)); git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'source');
    const metadataBytes = Math.max(git('rev-parse', '--show-toplevel').byteLength,
      git('rev-parse', '--verify', 'HEAD^{commit}').byteLength,
      git('rev-parse', '--verify', 'HEAD^{tree}').byteLength);
    const options = { repositoryRoot: root, repositoryId: 'repository:exact', pipelineStageId: 'test',
      creatorAuthority: 'nova:exact', attestationPrivateKey: crypto.generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' }), maximumArchiveBytes: 100000 };
    const selected = { ...legacy, maximumMetadataBytes: metadataBytes };
    const admitted = await buildCommittedSourceSnapshot({ ...options, sourceAcquisitionPolicy: selected });
    assert(admitted.repositoryArchive.byteLength > metadataBytes);
    await assert.rejects(buildCommittedSourceSnapshot({ ...options,
      sourceAcquisitionPolicy: { ...selected, maximumMetadataBytes: metadataBytes - 1 } }), /NOVA_SOURCE_ARCHIVE_SIZE_EXCEEDED/);
    // Archive capacity remains a distinct obligation, even with sufficient metadata capacity.
    await assert.rejects(buildCommittedSourceSnapshot({ ...options, sourceAcquisitionPolicy: selected,
      maximumArchiveBytes: admitted.repositoryArchive.byteLength - 1 }), /NOVA_SOURCE_ARCHIVE_SIZE_EXCEEDED/);
    const restored = await buildCommittedSourceSnapshot({ ...options, sourceAcquisitionPolicy: selected,
      maximumArchiveBytes: admitted.repositoryArchive.byteLength });
    assert.deepEqual(restored.repositoryArchive, admitted.repositoryArchive);
    assert.deepEqual(restored.sourceSnapshot, admitted.sourceSnapshot);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
