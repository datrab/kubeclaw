import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { stageEvidenceFiles, FileEvidenceStore } from '../../../skills/buster/engine/test-gates/artifacts.ts';

// Run only the contained byte-copy utility, never a provider, API client or
// deployment. These controls disprove non-API DATA inference from descriptors.
for (const [name, mediaType, content] of [
  ['json', 'application/json', '{"apiVersion":"v1","kind":"ConfigMap","metadata":{"name":"synthetic-boundary"},"data":{"synthetic":"true"}}\n'],
  ['yaml', 'application/yaml', 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: synthetic-boundary\ndata:\n  synthetic: "true"\n'],
  // A transfer proof must retain every document/item, not just the first API
  // object discovered by a parser or an envelope summary.
  ['yaml-multi-document', 'application/octet-stream', 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: first\n---\napiVersion: v1\nkind: Secret\nmetadata:\n  name: second\nstringData:\n  synthetic: not-a-credential\n'],
  ['json-list', 'text/plain', '{"apiVersion":"v1","kind":"List","items":[{"apiVersion":"v1","kind":"ConfigMap","metadata":{"name":"first"}},{"apiVersion":"v1","kind":"Secret","metadata":{"name":"second"},"stringData":{"synthetic":"not-a-credential"}}]}\n'],
  ['opaque', 'application/octet-stream', '{"apiVersion":"v1","kind":"ConfigMap","metadata":{"name":"synthetic-boundary"}}\n'],
] as const) test(`staging and artifact storage preserve actual API-bearing ${name} bytes`, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pr13-evidence-boundary-'));
  try {
    const source = path.join(root, 'source');
    const staged = path.join(root, 'staged');
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, 'evidence.bin'), content);
    const declaration = { evidenceId: 'synthetic', type: 'artifact', file: 'evidence.bin', mediaType };
    const bytes = Buffer.byteLength(content);
    assert.deepEqual(await stageEvidenceFiles(source, staged, [declaration], 1, bytes), { files: 1, bytes });
    assert.equal(await fs.readFile(path.join(staged, declaration.file), 'utf8'), content);
    const stored = await new FileEvidenceStore(path.join(root, 'stored')).store('synthetic-attempt', staged, declaration, bytes);
    assert.equal(await fs.readFile(new URL(stored.artifact.storageUrl), 'utf8'), content);
    assert.equal(stored.artifact.contentDigest, `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`);
    assert.equal(stored.artifact.sizeBytes, bytes);
    assert.equal(stored.artifact.mediaType, mediaType);
    assert.deepEqual(stored.declaration, declaration);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('API-bearing evidence still obeys byte limit and cancellation before publication', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pr13-evidence-boundary-'));
  try {
    const source = path.join(root, 'source');
    await fs.mkdir(source);
    const content = '{"apiVersion":"v1","kind":"ConfigMap"}';
    await fs.writeFile(path.join(source, 'api.json'), content);
    const declaration = { evidenceId: 'synthetic', type: 'artifact', file: 'api.json', mediaType: 'application/json' };
    const limited = path.join(root, 'limited');
    await assert.rejects(stageEvidenceFiles(source, limited, [declaration], 1, Buffer.byteLength(content) - 1), /TEST_PROVIDER_ARTIFACT_BYTE_LIMIT/);
    await assert.rejects(fs.stat(path.join(limited, declaration.file)), { code: 'ENOENT' });
    const controller = new AbortController();
    controller.abort(new Error('synthetic cancellation'));
    const cancelled = path.join(root, 'cancelled');
    await assert.rejects(stageEvidenceFiles(source, cancelled, [declaration], 1, 1024, controller.signal), /synthetic cancellation/);
    await assert.rejects(fs.stat(path.join(cancelled, declaration.file)), { code: 'ENOENT' });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
