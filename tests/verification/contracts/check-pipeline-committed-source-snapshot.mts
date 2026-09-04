import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCommittedSourceSnapshot } from '@kubeclaw/nova-core';
import { verifySourceSnapshotAttestation } from '@kubeclaw/pipeline-test-gate-contract';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'committed-source-snapshot-'));
const repository = path.join(temporary, 'repository');
const extracted = path.join(temporary, 'extracted');
const sourceKeys = crypto.generateKeyPairSync('ed25519');
const attestationPrivateKey = sourceKeys.privateKey.export({ type: 'pkcs8', format: 'pem' });
const attestationPublicKey = sourceKeys.publicKey.export({ type: 'spki', format: 'pem' });
const wrongPublicKey = crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
try {
  fs.mkdirSync(repository);
  execFileSync('git', ['-C', repository, 'init', '-q']);
  execFileSync('git', ['-C', repository, 'config', 'user.email', 'source@example.invalid']);
  execFileSync('git', ['-C', repository, 'config', 'user.name', 'Source Proof']);
  fs.writeFileSync(path.join(repository, 'tracked.txt'), 'committed\n');
  execFileSync('git', ['-C', repository, 'add', 'tracked.txt']);
  execFileSync('git', ['-C', repository, 'commit', '-qm', 'source snapshot']);
  const commit = execFileSync('git', ['-C', repository, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const tree = execFileSync('git', ['-C', repository, 'rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
  fs.writeFileSync(path.join(repository, 'tracked.txt'), 'changed but not committed\n');
  fs.writeFileSync(path.join(repository, 'untracked.txt'), 'untracked\n');

  const first = buildCommittedSourceSnapshot({ repositoryRoot: repository, repositoryId: 'repository:source-proof',
    pipelineStageId: 'stage:test-gate',
    creatorAuthority: 'nova:production', attestationPrivateKey, revision: 'HEAD', maximumArchiveBytes: 1024 * 1024 });
  const second = buildCommittedSourceSnapshot({ repositoryRoot: repository, repositoryId: 'repository:source-proof',
    pipelineStageId: 'stage:test-gate',
    creatorAuthority: 'nova:production', attestationPrivateKey, revision: commit, maximumArchiveBytes: 1024 * 1024 });
  assert.equal(first.sourceSnapshot.revision, `git:${commit}`);
  assert.equal(first.sourceSnapshot.tree, `git:${tree}`);
  assert.equal(verifySourceSnapshotAttestation(first.sourceSnapshot, 'nova:production', attestationPublicKey), true);
  assert.equal(verifySourceSnapshotAttestation(first.sourceSnapshot, 'nova:production', wrongPublicKey), false);
  assert.equal(verifySourceSnapshotAttestation({ ...first.sourceSnapshot, attestation: {
    ...first.sourceSnapshot.attestation, schemaVersion: 'source-snapshot-attestation.v2',
  } } as typeof first.sourceSnapshot, 'nova:production', attestationPublicKey), false,
  'the verifier must reject an unrecognized attestation schema');
  assert.equal(verifySourceSnapshotAttestation({ ...first.sourceSnapshot, attestation: {
    ...first.sourceSnapshot.attestation, algorithm: 'rsa-pss',
  } } as typeof first.sourceSnapshot, 'nova:production', attestationPublicKey), false,
  'the verifier must reject an algorithm that does not describe the verified signature');
  assert.equal(verifySourceSnapshotAttestation({ ...first.sourceSnapshot,
    repositoryId: 'repository:tampered' }, 'nova:production', attestationPublicKey), false);
  assert.equal(first.sourceSnapshot.archiveContentDigest, second.sourceSnapshot.archiveContentDigest,
    'the same commit must create the same archive');
  assert.deepEqual(first.repositoryArchive, second.repositoryArchive);
  fs.mkdirSync(extracted);
  const archive = path.join(temporary, 'snapshot.tar.gz');
  fs.writeFileSync(archive, first.repositoryArchive);
  execFileSync('/usr/bin/tar', ['-xzf', archive, '-C', extracted]);
  assert.equal(fs.readFileSync(path.join(extracted, 'tracked.txt'), 'utf8'), 'committed\n');
  assert.equal(fs.existsSync(path.join(extracted, 'untracked.txt')), false);
  assert.throws(() => buildCommittedSourceSnapshot({ repositoryRoot: repository,
    repositoryId: 'repository:source-proof', pipelineStageId: 'stage:test-gate', creatorAuthority: 'nova:production', attestationPrivateKey, revision: 'missing',
    maximumArchiveBytes: 1024 * 1024 }), /Command failed/u);
  assert.throws(() => buildCommittedSourceSnapshot({ repositoryRoot: repository,
    repositoryId: 'repository:source-proof', pipelineStageId: 'stage:test-gate', creatorAuthority: 'nova:production', attestationPrivateKey, revision: '--help',
    maximumArchiveBytes: 1024 * 1024 }), /Command failed/u,
  'revision input must not be interpreted as a Git option');
  assert.throws(() => buildCommittedSourceSnapshot({ repositoryRoot: repository,
    repositoryId: 'repository:source-proof', pipelineStageId: 'stage:test-gate', creatorAuthority: 'nova:production', attestationPrivateKey, maximumArchiveBytes: 1 }),
  /NOVA_SOURCE_ARCHIVE_SIZE_EXCEEDED/u);
  console.log(JSON.stringify({ ok: true, decision: 'D-094', revision: first.sourceSnapshot.revision,
    excludesWorkingTree: true }));
} finally {
  if (!process.env.KEEP_TEST_TMP) fs.rmSync(temporary, { recursive: true, force: true });
}
