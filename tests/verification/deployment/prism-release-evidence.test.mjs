import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { collectReceipts } from '../../../scripts/updates/release-images.mjs';

const repository = path.resolve(import.meta.dirname, '../../..');
const validator = path.join(repository, 'tests/verification/live/check-prism-release-evidence.mjs');
const image = `ghcr.io/datrab/kubeclaw-prism-worker@sha256:${'b'.repeat(64)}`;
const commit = 'a'.repeat(40), digest = `sha256:${'c'.repeat(64)}`;
const key = 'contract-fixture-only-key-not-a-real-issuer-secret';
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(name => `${JSON.stringify(name)}:${canonical(value[name])}`).join(',')}}` : JSON.stringify(value);

// These are signed validator-contract fixtures, never published as live evidence.
// The issuer string is a schema field, not a claim that GitHub Actions ran.
function fixture(reference = image) {
  return { schema: 'prism.production-evidence.v1', status: 'passed', issuer: 'github-actions',
    repositoryCommit: commit, imageReferences: [reference],
    cleanRuns: ['one', 'two'].map(name => ({ status: 'passed', repositoryCommit: commit,
      imageReferences: [reference], namespace: `test-prism-${name}`, baselineDigest: digest,
      evidenceArtifactDigest: digest, skippedChecks: [] })),
    ...Object.fromEntries(['novaStage', 'provider', 'failureMatrix', 'backupRestore', 'forgeBuster', 'telemetryAlerts', 'security']
      .map(name => [name, { status: 'passed', evidenceArtifactDigest: digest, skippedChecks: [] }])),
  };
}
function invoke(value, expectedImage = image, tamperAfterSigning = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-release-contract-'));
  try {
    const signed = { ...value, signature: `hmac-sha256:${createHmac('sha256', key).update(canonical(value)).digest('hex')}` };
    if (tamperAfterSigning) signed.repositoryCommit = 'd'.repeat(40);
    const file = path.join(root, 'contract-fixture.json'); fs.writeFileSync(file, JSON.stringify(signed));
    return spawnSync(process.execPath, [validator], { cwd: repository, encoding: 'utf8', timeout: 5000,
      env: { ...process.env, PRISM_LIVE_EVIDENCE_FILE: file, PRISM_LIVE_EVIDENCE_HMAC_KEY: key,
        PRISM_EXPECTED_COMMIT: commit, PRISM_EXPECTED_IMAGE_REFERENCES: expectedImage } });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('actual validator accepts signed immutable-release contract fixture; no live acceptance claimed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-selected-receipt-contract-'));
  try {
    fs.writeFileSync(path.join(root, 'worker.json'), JSON.stringify({ name: 'prism-worker', commit, image }));
    const selected = collectReceipts(root, commit, ['prism-worker']).images['prism-worker'];
    const result = invoke(fixture(selected)); assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('actual validator rejects mutable tag in both expected and signed fixture identities', () => {
  const tag = 'ghcr.io/datrab/kubeclaw-prism-worker:candidate-fixture';
  const result = invoke(fixture(tag), tag); assert.notEqual(result.status, 0);
  assert.match(result.stderr, /immutable release receipt contract/);
});
test('actual validator rejects malformed or mismatched immutable fixture identities', () => {
  for (const reference of [image.slice(0, -1), image.replace('@sha256:', '@sha512:'), image.replace('b'.repeat(64), 'd'.repeat(64))]) {
    const result = invoke(fixture(reference)); assert.notEqual(result.status, 0, reference);
  }
});
test('actual validator preserves signed-body tamper rejection', () => {
  const result = invoke(fixture(), image, true); assert.notEqual(result.status, 0);
  assert.match(result.stderr, /production evidence signature is invalid/);
});
test('actual validator preserves clean-run image binding and required live-gate completeness', () => {
  const inconsistent = fixture(); inconsistent.cleanRuns[0].imageReferences = [image.replace('b'.repeat(64), 'd'.repeat(64))];
  assert.notEqual(invoke(inconsistent).status, 0);
  const incomplete = fixture(); delete incomplete.security;
  const result = invoke(incomplete); assert.notEqual(result.status, 0);
  assert.match(result.stderr, /security live evidence is incomplete/);
});
